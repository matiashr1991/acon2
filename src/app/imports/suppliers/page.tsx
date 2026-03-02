"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import { supabase } from '@/lib/supabase/client';
import { formatISO, startOfWeek } from 'date-fns';
import { X, Upload, Save, CheckCircle2, AlertCircle, FileSpreadsheet, ChevronRight, Loader2, Download } from 'lucide-react';

interface ParsedRow {
    fileName: string;
    _rawIndex: number;
    sku: string;
    xlsxName?: string;
    purchase: number | null;
    cost: number | null;
    margen: number | null;
    benefit: number | null;
    productId: string | null;
    officialName: string | null;
    dbSupplierId: string | null;
    status: 'OK' | 'ERROR';
    errorMsg?: string;
}

interface DedupedRow extends ParsedRow {
    calcList1: number | null;
    deltaStatus: 'NEW' | 'MODIFIED' | 'UNCHANGED' | 'ERROR';
    conflicts: ParsedRow[]; // other rows for same sku that were discarded
}

export default function MassiveSupplierImportPage() {
    const currentWeekInfo = formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), { representation: 'date' });
    const [selectedWeek, setSelectedWeek] = useState(currentWeekInfo);

    const [files, setFiles] = useState<File[]>([]);

    // Steps: 1 - Upload, 2 - Review, 3 - Done
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Processing states
    const [isParsing, setIsParsing] = useState(false);
    const [parseProgress, setParseProgress] = useState({ current: 0, total: 0 });

    // Extracted Data
    const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
    const [fileStats, setFileStats] = useState<Record<string, any>>({});

    // Deduplicated Data & Baselines
    const [dedupedRows, setDedupedRows] = useState<DedupedRow[]>([]);
    const [baselineMap, setBaselineMap] = useState<Record<string, any>>({});

    const [isCommitting, setIsCommitting] = useState(false);
    const [commitProgress, setCommitProgress] = useState({ current: 0, total: 0 });

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

    // Options
    const [onlyDifferences, setOnlyDifferences] = useState(true);
    const [defaultMargen, setDefaultMargen] = useState<string>('0.458');

    // --- 1. Parse Phase ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const runParse = async () => {
        if (files.length === 0) return;
        setIsParsing(true);
        setErrorMsg(null);
        setRawRows([]);
        setFileStats({});
        setParseProgress({ current: 0, total: files.length });

        const accumulatedRows: ParsedRow[] = [];
        const accumulatedStats: Record<string, any> = {};

        const CHUNK_SIZE = 5;

        try {
            for (let i = 0; i < files.length; i += CHUNK_SIZE) {
                const chunkFiles = files.slice(i, i + CHUNK_SIZE);

                const formData = new FormData();
                chunkFiles.forEach(f => formData.append('files', f));

                const { data: { session } } = await supabase.auth.getSession();
                const headers: Record<string, string> = {};
                if (session?.access_token) {
                    headers['Authorization'] = `Bearer ${session.access_token}`;
                }

                const res = await fetch('/api/imports/massive/parse', {
                    method: 'POST',
                    headers,
                    body: formData
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || 'Error parsing chunk');
                }

                const data = await res.json();
                if (data.rows) accumulatedRows.push(...data.rows);
                if (data.fileStats) Object.assign(accumulatedStats, data.fileStats);

                setParseProgress({ current: Math.min(i + CHUNK_SIZE, files.length), total: files.length });
            }

            setRawRows(accumulatedRows);
            setFileStats(accumulatedStats);

            await determineBaselineAndDedupe(accumulatedRows);

        } catch (err: any) {
            setErrorMsg(`Error en el parseo: ${err.message}`);
            setIsParsing(false);
        }
    };

    // --- 2. Baseline & Deduplication ---
    const determineBaselineAndDedupe = async (allRows: ParsedRow[]) => {
        try {
            // Unify valid SKUs to fetch baseline
            const validProductIdMap = new Map<string, string>(); // sku -> productId
            allRows.forEach(r => {
                if (r.productId && r.status === 'OK') {
                    validProductIdMap.set(r.sku, r.productId);
                }
            });

            const uniqueProductIds = Array.from(new Set(validProductIdMap.values()));

            // Fetch Baselines
            if (uniqueProductIds.length > 0) {
                const { data: { session } } = await supabase.auth.getSession();
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

                const res = await fetch('/api/imports/massive/baseline', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ product_ids: uniqueProductIds, week_start_date: selectedWeek })
                });

                if (!res.ok) throw new Error('Error al cargar baseline');
                const data = await res.json();
                setBaselineMap(data.baselineMap || {});
            }

            setIsParsing(false);
            setStep(2);
        } catch (err: any) {
            setErrorMsg(`Error calculando base: ${err.message}`);
            setIsParsing(false);
        }
    };

    // Trigger local deduplication when baseline or options change
    useEffect(() => {
        if (step >= 2 && rawRows.length > 0) {
            applyDedupeAndDeltas();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, rawRows, baselineMap, defaultMargen]); // Run when these change

    const applyDedupeAndDeltas = () => {
        // Group by SKU
        const groups = new Map<string, ParsedRow[]>();
        rawRows.forEach(r => {
            if (!groups.has(r.sku)) groups.set(r.sku, []);
            groups.get(r.sku)!.push(r);
        });

        const defaultMargenNum = parseFloat(defaultMargen) || 0;
        const deduped: DedupedRow[] = [];

        groups.forEach((rowList, sku) => {
            // Deduplication logic: Give priority to row with cost > 0.
            // If multiple have cost > 0, pick the last one parsed (overwrite logic).
            const okRows = rowList.filter((r: ParsedRow) => r.status === 'OK');

            if (okRows.length === 0) {
                // All are ERROR. Pick the first one for representation.
                const repr = rowList[0];
                deduped.push({
                    ...repr,
                    calcList1: null,
                    deltaStatus: 'ERROR',
                    conflicts: rowList.slice(1)
                });
                return;
            }

            // Among OK rows, sort so that cost > 0 gets priority. 
            // In JavaScript sort, return > 0 to place b before a.
            // Actually, let's just find the best candidate manually.
            let bestIndex = 0;
            for (let i = 1; i < okRows.length; i++) {
                const currentBest = okRows[bestIndex];
                const candidate = okRows[i];

                if ((candidate.cost || 0) > 0 && (currentBest.cost || 0) === 0) {
                    bestIndex = i; // Candidate has cost, current doesn't
                } else if ((candidate.cost || 0) > 0 && (currentBest.cost || 0) > 0) {
                    bestIndex = i; // Both have cost, candidate is later occurrence
                } else if ((candidate.cost || 0) === 0 && (currentBest.cost || 0) === 0) {
                    bestIndex = i; // Neither has cost, candidate is later occurrence
                }
            }

            const winner = okRows[bestIndex];
            const conflicts = okRows.filter((_: ParsedRow, i: number) => i !== bestIndex);

            // Calc L1 and Delta
            const finalMargen = winner.margen != null ? winner.margen : defaultMargenNum;
            const calcList1 = winner.cost != null && winner.cost >= 0 ? winner.cost * (1 + finalMargen) : null;

            let deltaStatus: DedupedRow['deltaStatus'] = 'NEW';
            let finalSupplierId = winner.dbSupplierId;

            if (winner.productId && baselineMap[winner.productId]) {
                const prev = baselineMap[winner.productId];
                if (!finalSupplierId) finalSupplierId = prev.supplier_id;

                const isCostSame = prev.cost_final_unit === winner.cost;
                const isPurchSame = (prev.purchase_price ?? null) === winner.purchase;
                const isSupplierSame = prev.supplier_id === finalSupplierId;

                if (isCostSame && isPurchSame && isSupplierSame) deltaStatus = 'UNCHANGED';
                else deltaStatus = 'MODIFIED';
            }

            let errorMsg = winner.errorMsg;
            if (!finalSupplierId) {
                deltaStatus = 'ERROR';
                errorMsg = 'Falta proveedor en BD';
            }

            deduped.push({
                ...winner,
                dbSupplierId: finalSupplierId,
                errorMsg: errorMsg,
                margen: finalMargen,
                calcList1,
                deltaStatus,
                conflicts
            });
        });

        setDedupedRows(deduped);
    };

    // --- Stats ---
    const stats = useMemo(() => {
        let errs = 0, news = 0, mods = 0, unchs = 0, filesMixed = 0;

        dedupedRows.forEach(r => {
            if (r.deltaStatus === 'ERROR') errs++;
            else if (r.deltaStatus === 'NEW') news++;
            else if (r.deltaStatus === 'MODIFIED') mods++;
            else if (r.deltaStatus === 'UNCHANGED') unchs++;
        });

        Object.values(fileStats).forEach(s => {
            if (s.isMixed) filesMixed++;
        });

        return {
            totalFiles: files.length,
            validFiles: Object.keys(fileStats).length,
            mixedFiles: filesMixed,
            totalRowsRead: rawRows.length,
            totalUnique: dedupedRows.length,
            errors: errs,
            news, mods, unchanged: unchs
        };
    }, [dedupedRows, files.length, fileStats, rawRows.length]);

    // --- 3. Commit Phase ---
    const handleCommit = async () => {
        setIsCommitting(true);
        setErrorMsg(null);

        try {
            const toSave = dedupedRows.filter(r =>
                r.deltaStatus !== 'ERROR' &&
                (!onlyDifferences || r.deltaStatus !== 'UNCHANGED')
            );

            if (toSave.length === 0) throw new Error('No hay nada para guardar. Ajuste los filtros.');

            const CHUNK_SIZE = 1000;
            const totalChunks = Math.ceil(toSave.length / CHUNK_SIZE);
            setCommitProgress({ current: 0, total: totalChunks });

            for (let i = 0; i < totalChunks; i++) {
                const chunk = toSave.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const isFinal = i === totalChunks - 1;

                const { data: { session } } = await supabase.auth.getSession();
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

                const res = await fetch('/api/imports/massive/commit', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        rows: chunk,
                        week_start_date: selectedWeek,
                        mode: onlyDifferences ? 'only_changes' : 'overwrite',
                        isFinalChunk: isFinal,
                        stats: isFinal ? {
                            ...stats,
                            savedCount: toSave.length,
                            onlyDifferences
                        } : undefined,
                        errorDetails: isFinal ? {
                            unresolved_errors: stats.errors,
                            mixed_files: stats.mixedFiles
                        } : undefined
                    })
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || `Error guardando chunk ${i + 1}`);
                }

                setCommitProgress({ current: i + 1, total: totalChunks });
            }

            setToast({ type: 'ok', msg: `${toSave.length} filas importadas con éxito masivamente.` });
            setStep(3);

        } catch (err: any) {
            setErrorMsg(`Error en Commit: ${err.message}`);
        } finally {
            setIsCommitting(false);
        }
    };

    // --- 4. CSV Exports ---
    const downloadCSV = (filename: string, rows: any[], headers: string[]) => {
        if (rows.length === 0) return;
        const csvContent = [
            headers.join(','),
            ...rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadErrors = () => {
        const errorRows = dedupedRows.filter(r => r.deltaStatus === 'ERROR').map(r => ({
            SKU: r.sku,
            Archivo: r.fileName,
            Error: r.errorMsg || 'Costo Inválido'
        }));
        downloadCSV(`errores_importacion_${selectedWeek}.csv`, errorRows, ['SKU', 'Archivo', 'Error']);
    };

    const downloadConflicts = () => {
        const conflictRows: any[] = [];
        dedupedRows.forEach(winner => {
            if (winner.conflicts.length > 0) {
                // Add winner
                conflictRows.push({
                    SKU: winner.sku,
                    Archivo: winner.fileName,
                    Costo: winner.cost,
                    Estado: 'GANADOR (Guardado)'
                });
                // Add losers
                winner.conflicts.forEach(loser => {
                    conflictRows.push({
                        SKU: loser.sku,
                        Archivo: loser.fileName,
                        Costo: loser.cost,
                        Estado: 'DESCARTADO'
                    });
                });
            }
        });
        downloadCSV(`conflictos_deduplicacion_${selectedWeek}.csv`, conflictRows, ['SKU', 'Archivo', 'Costo', 'Estado']);
    };

    // --- Render Helpers ---

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto flex flex-col">
                <MobileHeader />

                <div className="flex-1 p-8 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-3xl font-bold text-slate-900">Importación Masiva de Maestros</h1>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
                        {/* Stepper Header */}
                        <div className="flex items-center border-b border-slate-100 bg-slate-50 shrink-0 select-none">
                            <div className={`flex-1 py-3 px-6 text-sm font-medium border-b-2 flex items-center justify-center gap-2
                                ${step === 1 ? 'border-primary text-primary bg-blue-50/50' : 'border-transparent text-slate-400'}`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
                                Múltiples XLSX
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                            <div className={`flex-1 py-3 px-6 text-sm font-medium border-b-2 flex items-center justify-center gap-2
                                ${step === 2 ? 'border-orange-500 text-orange-600 bg-orange-50/50' : 'border-transparent text-slate-400'}`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                                Staging & Conflictos
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                            <div className={`flex-1 py-3 px-6 text-sm font-medium border-b-2 flex items-center justify-center gap-2
                                ${step === 3 ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-400'}`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 3 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
                                ¡Listo!
                            </div>
                        </div>

                        {/* Work Area */}
                        <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden relative">
                            {errorMsg && (
                                <div className="m-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-start gap-2 text-sm shrink-0">
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                    <div className="flex-1">{errorMsg}</div>
                                </div>
                            )}

                            {/* --- STEP 1 --- */}
                            {step === 1 && (
                                <div className="p-8 flex-1 flex flex-col items-center justify-center">
                                    <div className="max-w-xl w-full">

                                        <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm mb-6">
                                            <h3 className="font-semibold text-slate-800 mb-4">Configuración de Importación</h3>
                                            <div className="flex gap-4 items-center">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Semana de Vigencia Target</label>
                                                    <input
                                                        type="date"
                                                        value={selectedWeek}
                                                        onChange={(e) => setSelectedWeek(e.target.value)}
                                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                                                        disabled={isParsing}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <label className={`
                                            flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer bg-white transition-all
                                            ${isParsing ? 'opacity-50 border-slate-300 pointer-events-none bg-slate-50' : 'border-blue-400 hover:bg-blue-50/50 hover:border-blue-500 shadow-sm'}
                                        `}>
                                            <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
                                                {isParsing ? (
                                                    <>
                                                        <Loader2 className="w-10 h-10 text-primary animate-spin" />
                                                        <div>
                                                            <p className="font-bold text-slate-700 mb-1">Procesando archivos...</p>
                                                            <p className="text-sm text-slate-500">Chunk {parseProgress.current} de {parseProgress.total} archivos ({Math.round((parseProgress.current / parseProgress.total) * 100)}%)</p>
                                                            <div className="w-48 bg-slate-200 rounded-full h-1.5 mt-3 overflow-hidden">
                                                                <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${(parseProgress.current / parseProgress.total) * 100}%` }}></div>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-16 h-16 bg-blue-100/50 text-blue-600 rounded-full flex items-center justify-center">
                                                            <Upload className="w-8 h-8" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-700 mb-1">Click para seleccionar XLSX maestros</p>
                                                            <p className="text-sm text-slate-500">Puedes seleccionar +100 archivos. El sistema los procesará en lotes y resolverá las colisiones de SKUs automáticamente.</p>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <input type="file" multiple accept=".xlsx, .xls" className="hidden" onChange={handleFileSelect} disabled={isParsing} />
                                        </label>

                                        {!isParsing && files.length > 0 && (
                                            <div className="mt-6 flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                                                <div className="text-sm text-blue-800 font-medium">{files.length} archivos seleccionados listos para parsear.</div>
                                                <button onClick={runParse} className="bg-primary text-white font-bold py-2 px-6 rounded-lg shadow-sm hover:bg-blue-600 transition-colors">Iniciar Parseo</button>
                                            </div>
                                        )}

                                    </div>
                                </div>
                            )}

                            {/* --- STEP 2 --- */}
                            {step === 2 && (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap gap-4 items-center justify-between shrink-0">
                                        <div className="flex gap-4 items-center">
                                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Default L1 Margen</label>
                                                <input
                                                    type="text"
                                                    value={defaultMargen}
                                                    onChange={e => setDefaultMargen(e.target.value)}
                                                    className="w-16 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-primary"
                                                />
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer bg-orange-50 text-orange-800 border border-orange-200 px-3 py-2 rounded-lg font-semibold text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={onlyDifferences}
                                                    onChange={e => setOnlyDifferences(e.target.checked)}
                                                    className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 accent-orange-600"
                                                />
                                                Importar solo cambios (Deltas)
                                            </label>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                                            <div className="px-3 py-1.5 rounded-full border bg-slate-100 text-slate-700">Archivos: {stats.validFiles}/{stats.totalFiles}</div>
                                            {stats.mixedFiles > 0 && <div className="px-3 py-1.5 rounded-full border bg-amber-100 border-amber-300 text-amber-800">Mixtos: {stats.mixedFiles}</div>}
                                            <div className="px-3 py-1.5 rounded-full border bg-white shadow-sm text-slate-800">SKUs Únicos: {stats.totalUnique}</div>
                                            <div className="px-3 py-1.5 rounded-full border bg-emerald-100 text-emerald-800">{stats.news} Nuevos</div>
                                            <div className="px-3 py-1.5 rounded-full border bg-blue-100 text-blue-800">{stats.mods} Modificados</div>
                                            <div className="px-3 py-1.5 rounded-full border bg-red-100 text-red-800">{stats.errors} Errores</div>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-auto bg-white p-6 relative">
                                        <h3 className="text-lg font-bold text-slate-800 mb-4">Preview de Resolución (Primeros 100 SKUs)</h3>
                                        {dedupedRows.length === 0 ? (
                                            <p className="text-sm text-slate-500">No hay filas válidas decodificadas.</p>
                                        ) : (
                                            <div className="border border-slate-200 rounded-lg overflow-x-auto">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                                        <tr>
                                                            <th className="px-3 py-2 font-semibold">SKU</th>
                                                            <th className="px-3 py-2 font-semibold">Nombre Oficial DB</th>
                                                            <th className="px-3 py-2 font-semibold">Archivo Origen (Ganador)</th>
                                                            <th className="px-3 py-2 font-semibold text-right">Precio Compra</th>
                                                            <th className="px-3 py-2 font-semibold text-right">Costo Final</th>
                                                            <th className="px-3 py-2 font-semibold text-right">Precio L1 (Auto)</th>
                                                            <th className="px-3 py-2 font-semibold text-center">Estado Delta</th>
                                                            <th className="px-3 py-2 font-semibold text-center">Conflictos Ignorados</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {dedupedRows.slice(0, 100).map((r, i) => {
                                                            const skip = onlyDifferences && r.deltaStatus === 'UNCHANGED';
                                                            return (
                                                                <tr key={i} className={`hover:bg-slate-50 ${r.deltaStatus === 'ERROR' ? 'bg-red-50/50' : ''} ${skip ? 'opacity-40' : ''}`}>
                                                                    <td className="px-3 py-2 font-mono text-slate-500">{r.sku}</td>
                                                                    <td className="px-3 py-2 font-medium">
                                                                        {r.officialName || <span className="text-red-600 font-bold">{r.errorMsg}</span>}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]" title={r.fileName}>{r.fileName || '-'}</td>
                                                                    <td className="px-3 py-2 text-right text-slate-700 font-medium">{r.purchase != null ? r.purchase.toFixed(2) : '-'}</td>
                                                                    <td className="px-3 py-2 text-right font-bold text-slate-900">{r.cost != null ? r.cost.toFixed(2) : '-'}</td>
                                                                    <td className="px-3 py-2 text-right text-blue-700 font-semibold">{r.calcList1 != null ? r.calcList1.toFixed(2) : '-'}</td>
                                                                    <td className="px-3 py-2 text-center">
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border 
                                                                            ${r.deltaStatus === 'NEW' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                                                r.deltaStatus === 'MODIFIED' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                                                    r.deltaStatus === 'ERROR' ? 'bg-red-100 text-red-700 border-red-200' :
                                                                                        'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                                            {r.deltaStatus}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center text-slate-500 font-medium">
                                                                        {r.conflicts.length > 0 ? (
                                                                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200">{r.conflicts.length} desempates</span>
                                                                        ) : '-'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                        {dedupedRows.length > 100 && (
                                            <div className="text-center p-4 text-xs text-slate-400 font-medium">
                                                Mostrando los primeros 100 de {dedupedRows.length} SKUs únicos resueltos.
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
                                        <div className="flex items-center gap-4">
                                            <button onClick={() => setStep(1)} disabled={isCommitting} className="px-5 py-2 text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 shadow-sm transition-colors">
                                                Atrás
                                            </button>

                                            <div className="flex gap-2 ml-4 border-l border-slate-300 pl-4">
                                                <button
                                                    onClick={downloadErrors}
                                                    disabled={stats.errors === 0 || isCommitting}
                                                    className="px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
                                                >
                                                    <Download className="w-3 h-3" /> Descargar Errores CSV
                                                </button>
                                                <button
                                                    onClick={downloadConflicts}
                                                    disabled={isCommitting} // Will be empty if no conflicts
                                                    className="px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50 transition-colors"
                                                >
                                                    <Download className="w-3 h-3" /> Reporte Conflictos CSV
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex gap-4 items-center">
                                            {isCommitting && (
                                                <div className="text-sm font-semibold text-primary flex items-center gap-2">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Commit {commitProgress.current} / {commitProgress.total} chunks...
                                                </div>
                                            )}
                                            <button
                                                onClick={handleCommit}
                                                disabled={isCommitting || (stats.news + stats.mods + (onlyDifferences ? 0 : stats.unchanged)) === 0}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg shadow disabled:opacity-50 transition-colors flex items-center gap-2"
                                            >
                                                <Save className="w-5 h-5" />
                                                Ejecutar Commit BD
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- STEP 3 --- */}
                            {step === 3 && (
                                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-emerald-50/50">
                                    <div className="w-24 h-24 bg-white text-emerald-600 shadow border border-emerald-100 rounded-full flex items-center justify-center mb-6">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                    <h3 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">¡Importación Exitosa!</h3>
                                    <p className="text-slate-500 font-medium text-center mb-8 max-w-md">
                                        Se han procesado masivamente {files.length} archivos y unificado {dedupedRows.length} SKUs con base a la estrategia solicitada.
                                    </p>

                                    <div className="flex gap-4">
                                        <button onClick={() => { setStep(1); setFiles([]); setRawRows([]); setDedupedRows([]); }} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-8 rounded-xl shadow-md transition-all">
                                            Nuevos Archivos
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

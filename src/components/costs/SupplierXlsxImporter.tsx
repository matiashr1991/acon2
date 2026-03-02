"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Upload, Save, CheckCircle2, AlertCircle, FileSpreadsheet, ChevronRight, Loader2 } from 'lucide-react';
import * as xlsx from 'xlsx';
import { upsertCostsCsv } from '@/lib/data/costs';
import { logImportJob } from '@/lib/data/master';
import { DEFAULT_COMPANY_ID } from '@/lib/data/constants';

// --- Types ---

interface Product {
    id: string;
    external_id: string;
    name: string;
}

interface ParsedRow {
    _rawIndex: number; // For debugging
    sku: string;
    xlsxName?: string;
    purchase: number | null;
    cost: number | null;
    margen: number | null;
    benefit: number | null;
}

interface PreviewRow extends ParsedRow {
    productId: string | null;
    officialName: string | null;
    calcList1: number | null; // Always calculated
    status: 'NEW' | 'MODIFIED' | 'UNCHANGED' | 'ERROR';
    errorMsg?: string;
}

interface Props {
    supplierId: string;
    supplierName: string;
    products: Product[];
    selectedWeek: string;
    baselineCosts: any[];
    baselineWeek: string | null; // Which week was used as baseline (could be prev week)
    onClose: () => void;
}

// --- Helpers ---

const ALIASES = {
    sku: ['COD ART', 'COD. ART', 'COD ARTICULO', 'COD ARTÍCULO'],
    name: ['DESCRIPCION'],
    purchase: ['PRECIO DE COMPRA', 'PRECIO COMPRA', 'PR. COMPRA', 'PR COMPRA', 'PRECIO BASE', 'PRECIO LISTA', 'PRECIO LISTA 1'],
    cost: ['COSTO FINAL', 'COSTO S/IVA', 'COSTO S/IVA S/MARGEN'],
    margen: ['MARGEN INT LISTA 1', 'MARGEN LISTA 1'],
    benefit: ['% FINAL TOTAL', 'FINAL TOTAL']
};
const normalizeHeader = (s: string) => s ? String(s).trim().toUpperCase().replace(/\s+/g, ' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
const matchHeader = (normalizedHeader: string, aliases: string[]) => {
    return aliases.some(alias => normalizedHeader === normalizeHeader(alias));
};

const parseNumber = (val: any): number | null => {
    if (val == null || val === '') return null;
    let s = String(val).replace(/[$\s]/g, '').trim();
    if (/\d\.\d{3},/.test(s) || (s.includes(',') && !s.includes('.'))) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        s = s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
};

const normalizePct = (val: any): number | null => {
    if (val == null || val === '') return null;
    const isExplicitPct = String(val).includes('%');
    const n = parseNumber(val);
    if (n === null) return null;
    if (isExplicitPct || n > 1) return n / 100;
    return n;
};

export function SupplierXlsxImporter({ supplierId, supplierName, products, selectedWeek, baselineCosts, baselineWeek, onClose }: Props) {
    // --- Step State ---
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // --- Data State ---
    const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
    const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

    // --- Options State ---
    const [defaultMargen, setDefaultMargen] = useState<string>('0.458');
    const [onlyDifferences, setOnlyDifferences] = useState(true);

    // --- UI/Loading State ---
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

    // --- Maps ---
    const prodMap = useMemo(() => {
        const m = new Map<string, Product>();
        products.forEach(p => m.set(p.external_id || p.id, p));
        return m;
    }, [products]);

    const costMap = useMemo(() => {
        const m = new Map<string, any>();
        baselineCosts.forEach(c => m.set(c.product_id, c));
        return m;
    }, [baselineCosts]);

    // --- STEP 1: Upload & Parse ---

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setParsing(true);
        setErrorMsg(null);

        try {
            const data = await file.arrayBuffer();
            const workbook = xlsx.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

            // 1. Find Header Row
            let headerRowIndex = -1;
            let headerIndeces: Record<keyof typeof ALIASES, number> = {
                sku: -1, name: -1, purchase: -1, cost: -1, margen: -1, benefit: -1
            };

            for (let i = 0; i < rawRows.length; i++) {
                const row = rawRows[i];
                if (!Array.isArray(row)) continue;

                let foundSku = -1;
                for (let j = 0; j < row.length; j++) {
                    const cell = normalizeHeader(row[j]);
                    if (matchHeader(cell, ALIASES.sku)) { foundSku = j; break; }
                }

                if (foundSku >= 0) {
                    headerRowIndex = i;
                    headerIndeces.sku = foundSku;
                    // Map other columns
                    for (let j = 0; j < row.length; j++) {
                        const cell = normalizeHeader(row[j]);
                        if (matchHeader(cell, ALIASES.name)) headerIndeces.name = j;
                        if (matchHeader(cell, ALIASES.purchase)) headerIndeces.purchase = j;
                        if (matchHeader(cell, ALIASES.cost)) headerIndeces.cost = j;
                        if (matchHeader(cell, ALIASES.margen)) headerIndeces.margen = j;
                        if (matchHeader(cell, ALIASES.benefit)) headerIndeces.benefit = j;
                    }
                    break;
                }
            }

            if (headerRowIndex === -1 || headerIndeces.sku === -1) {
                throw new Error('No se encontró la fila de encabezados con "COD ART" (o aliases permitidos).');
            }
            if (headerIndeces.cost === -1) {
                throw new Error('No se encontró la columna de COSTO FINAL (o aliases). Es requerida para importar.');
            }

            // 2. Parse Data Rows
            const extracted: ParsedRow[] = [];
            const seenSkus = new Set<string>();

            for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
                const row = rawRows[i];
                if (!Array.isArray(row) || row.length === 0) continue;

                const rawSku = row[headerIndeces.sku];
                const cleanSku = String(rawSku).trim();

                // Ignore empty or non-numeric SKUs (filters out section titles)
                if (!cleanSku || isNaN(Number(rawSku))) continue;

                // Stop if we hit repeating headers (just in case they repeat header block)
                if (matchHeader(normalizeHeader(rawSku), ALIASES.sku)) continue;

                // Ignore duplicate SKUs within the same file to prevent "ON CONFLICT DO UPDATE" errors
                if (seenSkus.has(cleanSku)) continue;
                seenSkus.add(cleanSku);

                extracted.push({
                    _rawIndex: i + 1, // 1-based exact row number in excel
                    sku: cleanSku,
                    xlsxName: headerIndeces.name >= 0 ? String(row[headerIndeces.name]).trim() : undefined,
                    purchase: headerIndeces.purchase >= 0 ? parseNumber(row[headerIndeces.purchase]) : null,
                    cost: parseNumber(row[headerIndeces.cost]),
                    margen: headerIndeces.margen >= 0 ? normalizePct(row[headerIndeces.margen]) : null,
                    benefit: headerIndeces.benefit >= 0 ? normalizePct(row[headerIndeces.benefit]) : null,
                });
            }

            if (extracted.length === 0) {
                throw new Error('No se encontraron filas válidas con datos numéricos de SKU debajo del encabezado.');
            }

            setParsedData(extracted);
            regeneratePreview(extracted, defaultMargen);
            setStep(2);

        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setParsing(false);
            e.target.value = ''; // Reset
        }
    };

    // --- STEP 2: Preview & Delta ---

    const regeneratePreview = useCallback((data: ParsedRow[], currentMargenDef: string) => {
        const defFrac = normalizePct(currentMargenDef);

        const preview: PreviewRow[] = data.map(row => {
            const matchProd = prodMap.get(row.sku);
            const prevCost = matchProd ? costMap.get(matchProd.id) : null;

            // Base error validations
            let errorMsg: string | undefined;
            if (!matchProd) errorMsg = 'SKU no encontrado en sistema.';
            else if (row.cost == null || row.cost < 0) errorMsg = 'Costo inválido o vacío.';
            else if (row.purchase != null && row.purchase < 0) errorMsg = 'Precio compra inválido.';

            // Calculate Margen & L1
            // Use row logic if present, else fallback to param default
            const finalMargen = row.margen != null ? row.margen : (defFrac ?? 0);
            const calcList1 = row.cost != null && row.cost >= 0 ? row.cost * (1 + finalMargen) : null;
            // Note: benefit is also passed through (recalculating live optional, but requested to trust source/cost)

            // Delta Status
            let status: PreviewRow['status'] = 'NEW';
            if (errorMsg) {
                status = 'ERROR';
            } else if (prevCost) {
                // Check if identical (cost and purchase are our main indicators for an update)
                const isCostSame = prevCost.cost_final_unit === row.cost;
                const isPurchSame = (prevCost.purchase_price ?? null) === row.purchase;
                const isSupplierSame = prevCost.supplier_id === supplierId;

                if (isCostSame && isPurchSame && isSupplierSame) {
                    status = 'UNCHANGED';
                } else {
                    status = 'MODIFIED';
                }
            }

            return {
                ...row,
                productId: matchProd?.id || null,
                officialName: matchProd?.name || null,
                margen: finalMargen,
                calcList1,
                status,
                errorMsg
            };
        });

        setPreviewRows(preview);
    }, [prodMap, costMap]);

    // Handle Margin options change live
    useEffect(() => {
        if (parsedData.length > 0 && step === 2) {
            regeneratePreview(parsedData, defaultMargen);
        }
    }, [defaultMargen, parsedData, regeneratePreview, step]);

    // Stats
    const stats = useMemo(() => {
        let errs = 0, news = 0, mods = 0, unchs = 0;
        previewRows.forEach(r => {
            if (r.status === 'ERROR') errs++;
            else if (r.status === 'NEW') news++;
            else if (r.status === 'MODIFIED') mods++;
            else if (r.status === 'UNCHANGED') unchs++;
        });
        return { totalRead: parsedData.length, errors: errs, news, mods, unchanged: unchs };
    }, [previewRows, parsedData.length]);

    // Apply Margen to Pending only
    const applyToPending = () => {
        const rows = [...parsedData];
        // For the sake of this UX, 'Apply to pending' just sets rows that lack row.margen to use default
        // But our regeneratePreview already does this gracefully by defaulting!
        // So we can visually show confirmation:
        setToast({ type: 'ok', msg: 'Margen default aplicado a filas sin margen propio.' });
        setTimeout(() => setToast(null), 2000);
    };

    // --- STEP 3: Commit ---

    const handleCommit = async () => {
        setSaving(true);
        setErrorMsg(null);
        try {
            // Include anything not ERROR, optionally skipping UNCHANGED
            const toSave = previewRows.filter(r =>
                r.status !== 'ERROR' &&
                (!onlyDifferences || r.status !== 'UNCHANGED')
            );

            if (toSave.length === 0) {
                throw new Error('No hay filas válidas para guardar con estas opciones.');
            }

            // Batch size 1000
            const BATCH_SIZE = 1000;
            const payload = toSave.map(r => {
                const benefit = r.purchase && r.purchase > 0 && r.cost != null ? 1 - r.cost / r.purchase : null;

                return {
                    supplier_id: supplierId,
                    product_id: r.productId!,
                    week_start_date: selectedWeek,
                    purchase_price: r.purchase,
                    cost_final_unit: r.cost!,
                    margin_list1_pct: r.margen,
                    price_list1_net: r.calcList1,
                    freight_pct: 0, // default if missing from XLSX reqs
                    benefit_pct: benefit ?? r.benefit, // prefer live calc, fallback to parsed
                    notes: ''
                };
            });

            // Upsert CSV
            for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                await upsertCostsCsv(payload.slice(i, i + BATCH_SIZE));
            }

            // Log Job
            await logImportJob({
                company_id: DEFAULT_COMPANY_ID,
                job_type: 'bulk_xlsx_master',
                week_start_date: selectedWeek,
                status: 'completed',
                stats: {
                    rows_read: stats.totalRead,
                    errors: stats.errors,
                    new: stats.news,
                    modified: stats.mods,
                    unchanged: stats.unchanged,
                    saved_count: toSave.length,
                    only_differences_applied: onlyDifferences
                }
            });

            setToast({ type: 'ok', msg: `${toSave.length} filas importadas con éxito.` });
            setStep(3);
        } catch (err: any) {
            setErrorMsg(`Error guardando: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // --- Renders ---

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-sm p-4 md:p-8" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden w-full h-full max-w-[1400px] mx-auto">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white shrink-0">
                    <div>
                        <h2 className="text-lg font-bold">Importador Maestro: {supplierName}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-300 text-sm">Target: Semana {selectedWeek}</span>
                            {/* Baseline info */}
                            {baselineWeek && baselineWeek !== selectedWeek && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    Comparando vs Semana {baselineWeek}
                                </span>
                            )}
                            {!baselineCosts.length && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-700 text-slate-400">
                                    No hay baseline previo
                                </span>
                            )}
                        </div>
                    </div>
                    {step !== 3 && (
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Stepper Header */}
                <div className="flex items-center border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className={`flex-1 py-3 px-6 text-sm font-medium border-b-2 flex items-center justify-center gap-2
                        ${step === 1 ? 'border-primary text-primary bg-blue-50/50' : 'border-transparent text-slate-400'}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
                        Subir XLSX
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                    <div className={`flex-1 py-3 px-6 text-sm font-medium border-b-2 flex items-center justify-center gap-2
                        ${step === 2 ? 'border-orange-500 text-orange-600 bg-orange-50/50' : 'border-transparent text-slate-400'}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                        Revisar Deltas
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                    <div className={`flex-1 py-3 px-6 text-sm font-medium border-b-2 flex items-center justify-center gap-2
                        ${step === 3 ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-400'}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 3 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
                        ¡Listo!
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50">

                    {/* ERRORS/TOASTS */}
                    {errorMsg && (
                        <div className="m-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-start gap-2 text-sm shrink-0">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <div className="flex-1">{errorMsg}</div>
                        </div>
                    )}
                    {toast && (
                        <div className="m-4 p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg flex items-center gap-2 text-sm shrink-0 shadow-sm">
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            {toast.msg}
                        </div>
                    )}

                    {/* --- VIEW 1 --- */}
                    {step === 1 && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8">
                            <div className="max-w-md w-full text-center">
                                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <FileSpreadsheet className="w-10 h-10" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Sube el Archivo Maestro</h3>
                                <p className="text-slate-500 mb-8 text-sm leading-relaxed">
                                    El sistema buscará la fila que contenga la columna <b>"COD ART"</b> (o "SKU") para iniciar la lectura. Se ignorarán subtítulos, secciones, y filas vacías automáticamente.
                                </p>
                                <label className={`
                                    flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer bg-white transition-colors
                                    ${parsing ? 'opacity-50 border-slate-300 bg-slate-50' : 'border-blue-300 hover:bg-blue-50'}
                                `}>
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        {parsing ? (
                                            <>
                                                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                                <p className="text-sm font-semibold text-slate-600">Procesando y mapeando producto...</p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-8 h-8 text-blue-500 mb-1" />
                                                <p className="text-sm font-semibold text-slate-700">Click para seleccionar XLSX</p>
                                                <p className="text-xs text-slate-400">Soporta alias: COD ART, PRECIO DE COMPRA, COSTO FINAL...</p>
                                            </>
                                        )}
                                    </div>
                                    <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={parsing} />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* --- VIEW 2 --- */}
                    {step === 2 && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Toolbar */}
                            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-6">
                                    {/* Default Margen */}
                                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-2">
                                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Margen L1 Default</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={defaultMargen}
                                                onChange={e => setDefaultMargen(e.target.value)}
                                                className="w-20 text-sm border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-primary focus:outline-none"
                                            />
                                            <div className="flex gap-1">
                                                <button onClick={() => setDefaultMargen("0")} className="px-2 py-1 text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">0%</button>
                                                <button onClick={() => setDefaultMargen("0.458")} className="px-2 py-1 text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">45.8%</button>
                                            </div>
                                            <button onClick={applyToPending} className="ml-1 text-xs text-blue-600 hover:underline">Aplicar a faltantes</button>
                                        </div>
                                    </div>
                                    {/* Delta check */}
                                    <label className="flex items-center gap-2 cursor-pointer bg-orange-50 text-orange-800 border border-orange-200 px-3 py-2 rounded-lg font-medium text-sm">
                                        <input
                                            type="checkbox"
                                            checked={onlyDifferences}
                                            onChange={e => setOnlyDifferences(e.target.checked)}
                                            className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 accent-orange-600"
                                            disabled={!baselineCosts.length}
                                        />
                                        Importar solo cambios {onlyDifferences && baselineCosts.length > 0 && `(omite ${stats.unchanged})`}
                                    </label>
                                </div>

                                {/* Stats badges */}
                                <div className="flex flex-wrap gap-2 text-xs font-medium">
                                    <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200" title="Ignorados los que no tienen COD ART numérico">Leídos: {stats.totalRead}</div>
                                    {stats.news > 0 && <div className="px-3 py-1.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700">Nuevos: {stats.news}</div>}
                                    {stats.mods > 0 && <div className="px-3 py-1.5 rounded-full bg-blue-100 border border-blue-300 text-blue-700">Modificados: {stats.mods}</div>}
                                    {stats.unchanged > 0 && <div className="px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-slate-600">Iguales: {stats.unchanged}</div>}
                                    {stats.errors > 0 && <div className="px-3 py-1.5 rounded-full bg-red-100 border border-red-300 text-red-700">Con Error: {stats.errors}</div>}
                                </div>
                            </div>

                            {/* Table Container */}
                            <div className="flex-1 overflow-auto bg-white">
                                <table className="w-full text-xs text-left border-collapse min-w-[1000px]">
                                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10 shadow-sm text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold">Row</th>
                                            <th className="px-3 py-2 font-semibold w-[22%]">SKU / Producto Oficial</th>
                                            <th className="px-3 py-2 font-semibold max-w-[150px]">Nombre XLSX (Orig)</th>
                                            <th className="px-3 py-2 font-semibold text-right">Compra</th>
                                            <th className="px-3 py-2 font-semibold text-right text-slate-800">Costo Final</th>
                                            <th className="px-3 py-2 font-semibold text-right">Margen L1</th>
                                            <th className="px-3 py-2 font-semibold text-right text-blue-600">Precio L1 Neto (Auto)</th>
                                            <th className="px-3 py-2 font-semibold text-right">Beneficio</th>
                                            <th className="px-3 py-2 font-semibold text-center w-[120px]">Estado (Delta)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {previewRows.map((r, i) => {
                                            const isErr = r.status === 'ERROR';
                                            const isUnchanged = r.status === 'UNCHANGED';
                                            const skip = isUnchanged && onlyDifferences;

                                            return (
                                                <tr key={i} className={`hover:bg-slate-50 ${isErr ? 'bg-red-50/50' : ''} ${skip ? 'opacity-40 grayscale' : ''}`}>
                                                    <td className="px-3 py-1 align-top text-slate-400">#{r._rawIndex}</td>
                                                    <td className="px-3 py-1 align-top">
                                                        <div className="font-mono text-[10px] text-slate-500">{r.sku}</div>
                                                        <div className={`font-semibold ${r.officialName ? 'text-slate-800' : 'text-red-500'} truncate overflow-hidden`} title={r.officialName || 'No encontrado'}>
                                                            {r.officialName || '! NO EN REGISTROS'}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-1 align-top text-slate-400 truncate max-w-[150px] italic">
                                                        {r.xlsxName || '-'}
                                                    </td>
                                                    <td className="px-3 py-1 align-top text-right font-medium text-slate-600">
                                                        {r.purchase != null ? r.purchase.toFixed(2) : '-'}
                                                    </td>
                                                    <td className="px-3 py-1 align-top text-right font-bold text-slate-900">
                                                        {r.cost != null ? r.cost.toFixed(2) : <span className="text-red-500">?</span>}
                                                    </td>
                                                    <td className="px-3 py-1 align-top text-right font-medium text-slate-600">
                                                        {r.margen != null ? `${(r.margen * 100).toFixed(2)}%` : '-'}
                                                    </td>
                                                    <td className="px-3 py-1 align-top text-right">
                                                        {r.calcList1 != null ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <span className="font-bold text-blue-700">{r.calcList1.toFixed(2)}</span>
                                                                <span className="text-[9px] font-bold text-blue-400">AUTO</span>
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="px-3 py-1 align-top text-right font-medium text-slate-600">
                                                        {r.benefit != null ? `${(r.benefit * 100).toFixed(2)}%` : (
                                                            r.purchase && r.cost && r.purchase > 0 && r.cost > 0
                                                                ? `${((1 - r.cost / r.purchase) * 100).toFixed(2)}%` : '-'
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1 align-top text-center">
                                                        {isErr ? (
                                                            <span className="text-[10px] font-bold text-red-600 px-1.5 py-0.5 bg-red-100 rounded" title={r.errorMsg}>{r.errorMsg}</span>
                                                        ) : r.status === 'NEW' ? (
                                                            <span className="text-[10px] font-bold text-emerald-700 px-1.5 py-0.5 bg-emerald-100 border border-emerald-200 shadow-sm rounded">NUEVO</span>
                                                        ) : r.status === 'MODIFIED' ? (
                                                            <span className="text-[10px] font-bold text-blue-700 px-1.5 py-0.5 bg-blue-100 border border-blue-200 shadow-sm rounded">MODIFICADO</span>
                                                        ) : skip ? (
                                                            <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 border border-slate-200 rounded">IGNORADO</span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded">IGUAL</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Submit */}
                            <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-4 flex justify-between items-center">
                                <p className="text-sm font-medium text-slate-600">
                                    Se importarán <b className="text-slate-900">{stats.news + stats.mods + (onlyDifferences ? 0 : stats.unchanged)}</b> filas válidas.
                                </p>
                                <div className="flex gap-3">
                                    <button onClick={() => { setStep(1); setParsedData([]); setErrorMsg(null); }} className="px-5 py-2 text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100">
                                        Volver Atrás
                                    </button>
                                    <button
                                        onClick={handleCommit}
                                        disabled={saving || stats.errors === previewRows.length || (stats.news + stats.mods + (onlyDifferences ? 0 : stats.unchanged)) === 0}
                                        className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-green-600 rounded-lg shadow disabled:opacity-50 hover:bg-green-700"
                                    >
                                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        <Save className="w-4 h-4" />
                                        Confirmar Importación
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- VIEW 3 --- */}
                    {step === 3 && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-emerald-50/30">
                            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-sm border border-emerald-200">
                                <CheckCircle2 className="w-12 h-12" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-2">¡Importación Exitosa!</h3>
                            <p className="text-slate-500 mb-8 max-w-sm text-center">
                                Los costos han sido guardados en product_cost_week para el proveedor {supplierName}.
                            </p>
                            <button
                                onClick={onClose}
                                className="px-8 py-3 bg-slate-900 text-white font-bold rounded-lg shadow-md hover:bg-slate-800 transition-colors"
                            >
                                Volver al Proveedor
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

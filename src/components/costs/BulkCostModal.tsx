"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Save, CheckCircle2, AlertCircle, Lock, Unlock, Loader2 } from 'lucide-react';
import {
    getCostsForSupplierWeek,
    upsertCostsCsv,
    getSupplierDefaults,
    upsertSupplierDefaults
} from '@/lib/data/costs';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
    id: string;
    external_id: string;
    name: string;
}

interface RowState {
    productId: string;
    sku: string;
    name: string;
    // Raw display values (what the user sees while editing)
    raw_cost: string;
    raw_purchase: string;
    raw_flete: string;
    raw_margen: string;
    raw_list1: string;
    // Computed (read-only unless overridden)
    calc_list1: number | null;     // costo * (1 + margen)
    calc_benefit: number | null;   // 1 - (costo / purchase)
    list1_override: boolean;       // user manually typed precio_l1_neto
    // Validation flags
    margen_invalid: boolean;       // cannot parse margen input
    cost_gt_purchase: boolean;     // warning: costo > precio_compra
    // State
    hasSavedCost: boolean;
    dirty: boolean;
}

interface Props {
    supplierId: string;
    supplierName: string;
    products: Product[];
    selectedWeek: string;
    onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a number from user input: handles commas as decimal sep, strips $, % */
const parseNumber = (val: string): number | null => {
    if (val == null || val === '') return null;
    // Remove currency symbols and percent
    let s = String(val).replace(/[$\s]/g, '').replace('%', '').trim();
    // Detect if comma is decimal separator (e.g. "1.234,56" → "1234.56")
    if (/\d\.\d{3},/.test(s) || (s.includes(',') && !s.includes('.'))) {
        // European: dots=thousands, comma=decimal
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        // Assume dot=decimal, remove any thousands commas
        s = s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
};

/**
 * Normalize % input to a fraction 0..1.
 * Accepts: "45.8%", "45,8%", "45.8", "0.458"
 * Returns null if unparseable.
 */
const normalizePct = (val: string): number | null => {
    if (val == null || val === '') return null;
    const isExplicitPct = String(val).includes('%');
    const n = parseNumber(val);
    if (n === null) return null;
    if (isExplicitPct || n > 1) return n / 100;
    return n; // already a fraction
};

const isValidPct = (val: string): boolean => val === '' || normalizePct(val) !== null;

/** Format for display */
const fmt2 = (n: number | null | undefined): string =>
    n != null ? n.toFixed(2) : '';

const fmtPctDisplay = (frac: number | null | undefined): string =>
    frac != null ? (frac * 100).toFixed(2) : '';

// ─── Per-row calculation (pure, no React deps) ───────────────────────────────

interface RowCalc {
    calc_list1: number | null;
    calc_benefit: number | null;
    margen_invalid: boolean;
    cost_gt_purchase: boolean;
}

const calcRow = (raw_cost: string, raw_purchase: string, raw_margen: string, raw_flete: string = '0'): RowCalc => {
    const cost = parseNumber(raw_cost);
    const purchase = parseNumber(raw_purchase);
    const margenFrac = normalizePct(raw_margen);
    const fleteFrac = normalizePct(raw_flete) ?? 0;
    const margen_invalid = raw_margen !== '' && margenFrac === null;

    const calc_list1 =
        cost != null && cost > 0 && margenFrac != null
            ? cost * (1 + margenFrac)
            : null;

    // benefit = 1 - (cost/purchase) - freight_pct
    const calc_benefit =
        purchase != null && purchase > 0 && cost != null
            ? 1 - cost / purchase - fleteFrac
            : null;

    const cost_gt_purchase =
        cost != null && purchase != null && purchase > 0 && cost > purchase;

    return { calc_list1, calc_benefit, margen_invalid, cost_gt_purchase };
};

// ─── Build initial row ───────────────────────────────────────────────────────

const buildRow = (
    p: Product,
    existingCost: any | null,
    defaults: any | null
): RowState => {
    const raw_cost = fmt2(existingCost?.cost_final_unit ?? null);
    const raw_purchase = fmt2(existingCost?.purchase_price ?? null);
    const raw_flete = existingCost?.freight_pct != null
        ? fmtPctDisplay(existingCost.freight_pct)
        : defaults?.flete_pct != null ? fmtPctDisplay(defaults.flete_pct) : '0';
    const raw_margen = existingCost?.margin_list1_pct != null
        ? fmtPctDisplay(existingCost.margin_list1_pct)
        : defaults?.margen_lista1_pct != null ? fmtPctDisplay(defaults.margen_lista1_pct) : '';

    const savedList1 = existingCost?.price_list1_net != null
        ? fmt2(existingCost.price_list1_net)
        : '';

    const { calc_list1, calc_benefit, margen_invalid, cost_gt_purchase } =
        calcRow(raw_cost, raw_purchase, raw_margen, raw_flete);

    return {
        productId: p.id,
        sku: p.external_id || p.id,
        name: p.name,
        raw_cost,
        raw_purchase,
        raw_flete,
        raw_margen,
        raw_list1: savedList1 || '',
        calc_list1,
        calc_benefit,
        list1_override: savedList1 !== '',
        margen_invalid,
        cost_gt_purchase,
        hasSavedCost: !!existingCost,
        dirty: false,
    };
};

// ─── Component ───────────────────────────────────────────────────────────────

export function BulkCostModal({ supplierId, supplierName, products, selectedWeek, onClose }: Props) {

    // Defaults
    const [defaultFlete, setDefaultFlete] = useState('0');
    const [defaultMargen, setDefaultMargen] = useState('');
    const [savingDefaults, setSavingDefaults] = useState(false);
    const [defaultsSaved, setDefaultsSaved] = useState(false);

    // Rows
    const [rows, setRows] = useState<RowState[]>([]);
    const [loadingRows, setLoadingRows] = useState(true);

    // Filters
    const [filterSku, setFilterSku] = useState('');
    const [filterName, setFilterName] = useState('');
    const [onlyPending, setOnlyPending] = useState(false);

    // Save
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

    // ─── Load ────────────────────────────────────────────────────────────────

    useEffect(() => {
        (async () => {
            setLoadingRows(true);
            try {
                const [existingCosts, defaults] = await Promise.all([
                    getCostsForSupplierWeek(supplierId, selectedWeek),
                    getSupplierDefaults(supplierId, selectedWeek),
                ]);
                const costMap = new Map<string, any>(
                    (existingCosts || []).map((c: any) => [c.product_id, c])
                );
                if (defaults) {
                    setDefaultFlete(fmtPctDisplay(defaults.flete_pct));
                    setDefaultMargen(defaults.margen_lista1_pct != null
                        ? fmtPctDisplay(defaults.margen_lista1_pct) : '');
                }
                const initial = (products || [])
                    .map(p => buildRow(p, costMap.get(p.id) ?? null, defaults))
                    .sort((a, b) => {
                        if (!a.hasSavedCost && b.hasSavedCost) return -1;
                        if (a.hasSavedCost && !b.hasSavedCost) return 1;
                        return a.sku.localeCompare(b.sku);
                    });
                setRows(initial);
            } finally {
                setLoadingRows(false);
            }
        })();
    }, [supplierId, selectedWeek, products]);

    // ─── Update a single row field, recalc only that row ─────────────────────

    const updateRow = useCallback((productId: string, field: keyof RowState, value: string) => {
        setRows(prev => prev.map(r => {
            if (r.productId !== productId) return r;
            const next = { ...r, [field]: value, dirty: true };

            const cost = field === 'raw_cost' ? value : next.raw_cost;
            const purchase = field === 'raw_purchase' ? value : next.raw_purchase;
            const margen = field === 'raw_margen' ? value : next.raw_margen;
            const flete = field === 'raw_flete' ? value : next.raw_flete;

            const { calc_list1, calc_benefit, margen_invalid, cost_gt_purchase } =
                calcRow(cost, purchase, margen, flete);

            next.calc_list1 = calc_list1;
            next.calc_benefit = calc_benefit;
            next.margen_invalid = margen_invalid;
            next.cost_gt_purchase = cost_gt_purchase;

            // If user typed in list1 field, mark as override
            if (field === 'raw_list1') next.list1_override = true;

            return next;
        }));
    }, []);

    const toggleList1Override = useCallback((productId: string) => {
        setRows(prev => prev.map(r =>
            r.productId !== productId ? r
                : { ...r, list1_override: !r.list1_override, raw_list1: '', dirty: true }
        ));
    }, []);

    // ─── onBlur formatters ────────────────────────────────────────────────────

    const blurCost = useCallback((productId: string) => {
        setRows(prev => prev.map(r => {
            if (r.productId !== productId) return r;
            const n = parseNumber(r.raw_cost);
            return { ...r, raw_cost: n != null ? fmt2(n) : r.raw_cost };
        }));
    }, []);

    const blurPurchase = useCallback((productId: string) => {
        setRows(prev => prev.map(r => {
            if (r.productId !== productId) return r;
            const n = parseNumber(r.raw_purchase);
            return { ...r, raw_purchase: n != null ? fmt2(n) : r.raw_purchase };
        }));
    }, []);

    const blurPct = useCallback((productId: string, field: 'raw_flete' | 'raw_margen') => {
        setRows(prev => prev.map(r => {
            if (r.productId !== productId) return r;
            const frac = normalizePct(r[field]);
            return { ...r, [field]: frac != null ? fmtPctDisplay(frac) : r[field] };
        }));
    }, []);

    // ─── Apply defaults ───────────────────────────────────────────────────────

    const applyDefaults = useCallback((onlyPendingRows: boolean) => {
        setRows(prev => prev.map(r => {
            if (onlyPendingRows && r.hasSavedCost) return r;
            const next = { ...r, raw_flete: defaultFlete, raw_margen: defaultMargen, dirty: true };
            const { calc_list1, calc_benefit, margen_invalid, cost_gt_purchase } =
                calcRow(next.raw_cost, next.raw_purchase, defaultMargen, defaultFlete);
            return { ...next, calc_list1, calc_benefit, margen_invalid, cost_gt_purchase };
        }));
    }, [defaultFlete, defaultMargen]);

    // ─── Save defaults ────────────────────────────────────────────────────────

    const handleSaveDefaults = async () => {
        setSavingDefaults(true);
        try {
            const flete = normalizePct(defaultFlete) ?? 0;
            const margen = normalizePct(defaultMargen);
            await upsertSupplierDefaults(supplierId, selectedWeek, flete, margen);
            setDefaultsSaved(true);
            setTimeout(() => setDefaultsSaved(false), 2000);
        } catch (e: any) {
            showToast('err', `Error guardando defaults: ${e.message}`);
        } finally {
            setSavingDefaults(false);
        }
    };

    // ─── Batch save ───────────────────────────────────────────────────────────

    const handleSaveAll = async () => {
        const toSave = rows.filter(r => r.raw_cost !== '' && parseNumber(r.raw_cost) != null);
        if (toSave.length === 0) { showToast('err', 'No hay filas con costo final para guardar.'); return; }

        const invalid = toSave.filter(r => r.margen_invalid);
        if (invalid.length > 0) {
            showToast('err', `${invalid.length} filas tienen "Margen L1 %" inválido. Corrija antes de guardar.`);
            return;
        }

        setSaving(true);
        try {
            const payload = toSave.map(r => {
                const cost = parseNumber(r.raw_cost)!;
                const purchase = parseNumber(r.raw_purchase);
                const flete = normalizePct(r.raw_flete) ?? 0;
                const margen = normalizePct(r.raw_margen);
                // price_list1_net: prefer override, then calculated
                const list1 = r.list1_override
                    ? parseNumber(r.raw_list1)
                    : r.calc_list1;
                // benefit: recalculate from normalized values
                const benefit = purchase && purchase > 0 ? 1 - cost / purchase : null;

                return {
                    supplier_id: supplierId,
                    product_id: r.productId,
                    week_start_date: selectedWeek,
                    cost_final_unit: cost,
                    purchase_price: purchase,
                    freight_pct: flete,
                    margin_list1_pct: margen,
                    price_list1_net: list1,
                    benefit_pct: benefit,
                    notes: '',
                };
            });

            if (payload.some(p => p.cost_final_unit < 0))
                throw new Error('Costo final no puede ser negativo.');
            if (payload.some(p => p.purchase_price != null && p.purchase_price < 0))
                throw new Error('Precio compra no puede ser negativo.');

            await upsertCostsCsv(payload);

            setRows(prev => prev.map(r => {
                const saved = payload.find(p => p.product_id === r.productId);
                return saved ? { ...r, dirty: false, hasSavedCost: true } : r;
            }));
            showToast('ok', `${payload.length} SKUs guardados correctamente.`);
        } catch (e: any) {
            showToast('err', `Error guardando: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const showToast = (type: 'ok' | 'err', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 4000);
    };

    // ─── Derived counts (live) ────────────────────────────────────────────────

    const pendingCount = useMemo(
        () => rows.filter(r => !r.raw_cost || parseNumber(r.raw_cost) == null).length,
        [rows]
    );
    const totalCount = rows.length;

    // ─── Filtered rows ────────────────────────────────────────────────────────

    const filteredRows = useMemo(() => rows.filter(r => {
        if (onlyPending && r.hasSavedCost && (!r.raw_cost || parseNumber(r.raw_cost) == null)) return true;
        if (onlyPending && parseNumber(r.raw_cost) != null) return false;
        if (filterSku && !r.sku.toLowerCase().includes(filterSku.toLowerCase())) return false;
        if (filterName && !r.name.toLowerCase().includes(filterName.toLowerCase())) return false;
        return true;
    }), [rows, filterSku, filterName, onlyPending]);

    // ─── Render helpers ───────────────────────────────────────────────────────

    const inputBase = "w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2";
    const inputNormal = `${inputBase} border-slate-200 focus:ring-primary`;
    const inputOk = `${inputBase} border-green-300 focus:ring-green-400`;
    const inputPending = `${inputBase} border-orange-300 focus:ring-orange-400`;
    const inputError = `${inputBase} border-red-300 focus:ring-red-400 bg-red-50`;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-black/60"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="relative flex flex-col bg-white rounded-xl shadow-2xl m-4 md:m-8 overflow-hidden h-[calc(100vh-4rem)]">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 text-white shrink-0">
                    <div>
                        <h2 className="text-lg font-bold">⚡ Carga Masiva de Costos</h2>
                        <p className="text-slate-300 text-sm mt-0.5">{supplierName} · Semana {selectedWeek}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs bg-white/10 rounded-full px-3 py-1 tabular-nums">
                            {pendingCount} pendientes / {totalCount} SKUs
                        </span>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* ── Defaults bar ── */}
                <div className="shrink-0 bg-blue-50 border-b border-blue-100 px-6 py-3">
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-blue-700 mb-1">Flete % (default)</label>
                            <input
                                type="text"
                                value={defaultFlete}
                                onChange={e => setDefaultFlete(e.target.value)}
                                placeholder="0"
                                className="w-24 border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-blue-700 mb-1">Margen Lista 1 % (default)</label>
                            <input
                                type="text"
                                value={defaultMargen}
                                onChange={e => setDefaultMargen(e.target.value)}
                                placeholder="ej: 45.8 o 0.458"
                                className="w-40 border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={handleSaveDefaults}
                                disabled={savingDefaults}
                                className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {savingDefaults ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                {defaultsSaved ? '¡Guardado!' : 'Guardar Defaults'}
                            </button>
                            <button onClick={() => applyDefaults(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition-colors">
                                Aplicar a todos
                            </button>
                            <button onClick={() => applyDefaults(true)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                                Aplicar a pendientes
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Filters ── */}
                <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-2.5 border-b border-slate-100 bg-slate-50/70">
                    <input
                        type="text" placeholder="Filtrar SKU..."
                        value={filterSku} onChange={e => setFilterSku(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                    <input
                        type="text" placeholder="Filtrar nombre..."
                        value={filterName} onChange={e => setFilterName(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                        <input
                            type="checkbox" checked={onlyPending}
                            onChange={e => setOnlyPending(e.target.checked)}
                            className="rounded border-slate-300 accent-primary"
                        />
                        Solo pendientes ({pendingCount})
                    </label>
                    <span className="ml-auto text-xs text-slate-400">{filteredRows.length} productos visibles</span>
                </div>

                {/* ── Table ── */}
                <div className="flex-1 overflow-auto">
                    {loadingRows ? (
                        <div className="flex items-center justify-center h-full text-slate-400 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Cargando productos...</span>
                        </div>
                    ) : (
                        <table className="w-full text-xs text-left border-collapse min-w-[980px]">
                            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-2.5 text-slate-500 font-semibold uppercase w-[15%]">SKU / Producto</th>
                                    <th className="px-3 py-2.5 font-semibold uppercase w-[13%]">
                                        <span className="text-red-600">Costo Final ★</span>
                                    </th>
                                    <th className="px-3 py-2.5 text-slate-500 font-semibold uppercase w-[12%]">Pr. Compra</th>
                                    <th className="px-3 py-2.5 text-slate-500 font-semibold uppercase w-[9%]">Flete %</th>
                                    <th className="px-3 py-2.5 text-slate-500 font-semibold uppercase w-[11%]">Margen L1 %</th>
                                    <th className="px-3 py-2.5 text-slate-500 font-semibold uppercase w-[15%]">
                                        Precio L1 Neto
                                        <span className="ml-1 text-[10px] text-slate-400 normal-case font-normal">(auto)</span>
                                    </th>
                                    <th className="px-3 py-2.5 text-slate-500 font-semibold uppercase w-[10%]">Beneficio</th>
                                    <th className="px-3 py-2.5 text-slate-500 font-semibold uppercase w-[7%] text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-16 text-center text-slate-400">
                                            No hay productos que coincidan con los filtros.
                                        </td>
                                    </tr>
                                ) : filteredRows.map(row => {
                                    const costNum = parseNumber(row.raw_cost);
                                    const hasCost = costNum != null && costNum >= 0 && row.raw_cost !== '';
                                    const rowBg = row.cost_gt_purchase
                                        ? 'bg-orange-50/40 hover:bg-orange-50/70'
                                        : hasCost
                                            ? 'bg-green-50/30 hover:bg-green-50/60'
                                            : 'hover:bg-slate-50/70';

                                    // Which list1 value to show
                                    const list1Display = row.list1_override
                                        ? row.raw_list1
                                        : row.calc_list1 != null ? fmt2(row.calc_list1) : '';

                                    return (
                                        <tr key={row.productId} className={`transition-colors ${rowBg}`}>
                                            {/* SKU */}
                                            <td className="px-4 py-2 align-middle">
                                                <div className="font-mono text-[10px] text-slate-400 leading-tight">{row.sku}</div>
                                                <div className="text-slate-700 font-medium truncate max-w-[170px] leading-tight" title={row.name}>
                                                    {row.name}
                                                </div>
                                                {row.cost_gt_purchase && (
                                                    <div className="text-[10px] text-orange-600 font-semibold mt-0.5">⚠ Costo &gt; Compra</div>
                                                )}
                                            </td>

                                            {/* Costo Final */}
                                            <td className="px-3 py-2 align-middle">
                                                <input
                                                    type="text"
                                                    value={row.raw_cost}
                                                    onChange={e => updateRow(row.productId, 'raw_cost', e.target.value)}
                                                    onBlur={() => blurCost(row.productId)}
                                                    placeholder="0.00"
                                                    className={hasCost ? inputOk : inputPending}
                                                />
                                            </td>

                                            {/* Precio Compra */}
                                            <td className="px-3 py-2 align-middle">
                                                <input
                                                    type="text"
                                                    value={row.raw_purchase}
                                                    onChange={e => updateRow(row.productId, 'raw_purchase', e.target.value)}
                                                    onBlur={() => blurPurchase(row.productId)}
                                                    placeholder="opcional"
                                                    className={row.cost_gt_purchase ? inputPending : inputNormal}
                                                />
                                            </td>

                                            {/* Flete % */}
                                            <td className="px-3 py-2 align-middle">
                                                <input
                                                    type="text"
                                                    value={row.raw_flete}
                                                    onChange={e => updateRow(row.productId, 'raw_flete', e.target.value)}
                                                    onBlur={() => blurPct(row.productId, 'raw_flete')}
                                                    placeholder="0"
                                                    className={inputNormal}
                                                />
                                            </td>

                                            {/* Margen L1 % */}
                                            <td className="px-3 py-2 align-middle">
                                                <input
                                                    type="text"
                                                    value={row.raw_margen}
                                                    onChange={e => updateRow(row.productId, 'raw_margen', e.target.value)}
                                                    onBlur={() => blurPct(row.productId, 'raw_margen')}
                                                    placeholder="ej: 45.8"
                                                    className={row.margen_invalid ? inputError : inputNormal}
                                                />
                                                {row.margen_invalid && (
                                                    <span className="text-[10px] text-red-500 font-semibold">Valor inválido</span>
                                                )}
                                            </td>

                                            {/* Precio L1 Neto */}
                                            <td className="px-3 py-2 align-middle">
                                                <div className="relative flex items-center gap-1">
                                                    {row.list1_override ? (
                                                        <input
                                                            type="text"
                                                            value={row.raw_list1}
                                                            onChange={e => updateRow(row.productId, 'raw_list1', e.target.value)}
                                                            placeholder="0.00"
                                                            className={`${inputNormal} flex-1`}
                                                        />
                                                    ) : (
                                                        <div className={`flex-1 px-2 py-1.5 rounded-lg text-xs text-right tabular-nums
                                                            ${list1Display
                                                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                                                : 'bg-slate-50 text-slate-400 border border-slate-200'
                                                            }`}>
                                                            {list1Display || '—'}
                                                            {list1Display && (
                                                                <span className="ml-1 text-[9px] text-sky-500 font-bold">AUTO</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <button
                                                        title={row.list1_override ? 'Volver a automático' : 'Editar manualmente'}
                                                        onClick={() => toggleList1Override(row.productId)}
                                                        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                                                    >
                                                        {row.list1_override
                                                            ? <Unlock className="w-3 h-3" />
                                                            : <Lock className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Beneficio */}
                                            <td className="px-3 py-2 align-middle text-center">
                                                {row.calc_benefit != null ? (
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span className={`text-xs font-bold tabular-nums ${row.calc_benefit < 0
                                                            ? 'text-red-500'
                                                            : row.calc_benefit > 0.3
                                                                ? 'text-emerald-600'
                                                                : 'text-amber-600'
                                                            }`}>
                                                            {(row.calc_benefit * 100).toFixed(2)}%
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-semibold">AUTO</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>

                                            {/* Estado */}
                                            <td className="px-3 py-2 align-middle text-center">
                                                {hasCost ? (
                                                    <CheckCircle2 className={`w-4 h-4 mx-auto ${row.cost_gt_purchase ? 'text-orange-400' : 'text-emerald-500'}`} />
                                                ) : (
                                                    <div className="w-3 h-3 rounded-full bg-slate-200 mx-auto" title="Pendiente" />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
                    {toast ? (
                        <div className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg ${toast.type === 'ok'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                            {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {toast.msg}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 tabular-nums">
                            {totalCount - pendingCount} de {totalCount} SKUs con costo final cargado
                        </p>
                    )}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handleSaveAll}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Guardando...' : 'Guardar Todo'}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

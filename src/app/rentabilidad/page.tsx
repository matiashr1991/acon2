"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import { getPeriods } from '@/lib/data/periods';
import { getSuppliers, getSellers, getCustomers } from '@/lib/data/master';
import { getProfitTable, getProfitCharts, ProfitFilters, ProfitTableRow, ProfitChartsData } from '@/lib/data/report';
import { MARGIN_COPY } from '@/lib/copy/marginExplain';
import { formatISO, startOfWeek } from 'date-fns';
import { X, ChevronDown, ChevronUp, Download, AlertCircle, Loader2, TrendingUp, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

// Dynamic import ECharts (SSR-safe)
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt$ = (n: number | null | undefined) =>
    n == null ? '—' : '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmt2 = (n: number | null | undefined) =>
    n == null ? '—' : Number(n).toFixed(2);

const fmtPct = (n: number | null | undefined, scale = 1) =>
    n == null ? '—' : (Number(n) * scale * 100).toFixed(1) + '%';

function exportToCsv(filename: string, rows: any[], headers: string[]) {
    const escape = (v: any) => {
        const s = String(v ?? '').replace(/"/g, '""');
        return `"${s}"`;
    };
    const lines = [headers.map(escape).join(',')];
    for (const r of rows) {
        lines.push(headers.map(h => escape(r[h])).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupBy = 'supplier' | 'seller' | 'sku' | 'customer';
const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
    { value: 'supplier', label: 'Proveedor' },
    { value: 'seller', label: 'Vendedor' },
    { value: 'sku', label: 'SKU / Producto' },
    { value: 'customer', label: 'Cliente' },
];

// ─── MarginPopover ─────────────────────────────────────────────────────────────

interface MarginPopoverProps {
    row: ProfitTableRow;
    weekSelected: string;
    groupBy: GroupBy;
    supplierId?: string;
}

function MarginPopover({ row, weekSelected, groupBy, supplierId }: MarginPopoverProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const vn = Number(row.ventas_netas);
    const unid = Number(row.unidades);
    const ct = Number(row.costo_total);
    const mp = Number(row.margen_pesos);
    const mpct = Number(row.margen_pct);
    const cu = row.cost_final_unit != null ? Number(row.cost_final_unit) : null;
    // N/A only makes sense in SKU mode where cost_final_unit is meaningful.
    // In supplier/seller/customer grouping the RPC returns NULL for it anyway.
    const hasCost = groupBy !== 'sku' || cu != null;
    const precioUnit = unid > 0 ? vn / unid : null;
    const isNeg = mp < 0;

    const fv = (n: number | null | undefined, digits = 2) =>
        n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
    const fp = (n: number | null | undefined) =>
        n == null ? '—' : `${(Number(n) * 100).toFixed(2)}%`;

    const costWeekLabel = row.cost_week_used
        ? new Date(row.cost_week_used + 'T12:00:00').toLocaleDateString('es-AR')
        : '—';
    const weekSelLabel = weekSelected
        ? new Date(weekSelected + 'T12:00:00').toLocaleDateString('es-AR')
        : '—';

    // Button label: N/A if no cost, otherwise margen $ with ⓘ
    const btnLabel = hasCost ? fv(mp, 0) : MARGIN_COPY.noCost.value;
    const btnColor = !hasCost
        ? 'text-slate-400 bg-slate-100 hover:bg-slate-200'
        : isNeg
            ? 'text-red-600 hover:bg-red-100 bg-red-50'
            : 'text-emerald-700 hover:bg-emerald-100 bg-emerald-50';
    const headerBg = !hasCost ? 'bg-slate-500' : isNeg ? 'bg-red-600' : 'bg-emerald-600';

    return (
        <div ref={ref} className="relative inline-block">
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold tabular-nums transition-colors ${btnColor}`}
                title="Ver cómo se calculó"
            >
                {btnLabel}
                <span className="opacity-60 text-[10px]">ⓘ</span>
            </button>

            {open && (
                <div
                    className="absolute z-[9999] right-0 top-full mt-1 w-[420px] max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-200 text-xs overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className={`px-4 py-3 flex items-center justify-between ${headerBg} text-white`}>
                        <span className="font-bold text-sm">{MARGIN_COPY.popoverTitle}</span>
                        <button onClick={() => setOpen(false)} className="hover:opacity-70 p-0.5">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-4 space-y-4">

                        {/* No-cost state */}
                        {!hasCost ? (
                            <div className="flex flex-col items-center gap-3 py-4">
                                <span className="px-3 py-1.5 bg-orange-100 text-orange-700 font-bold rounded-full text-[11px]">
                                    ⚠ {MARGIN_COPY.noCost.badge}
                                </span>
                                <p className="text-slate-500 text-center text-[11px] leading-relaxed">
                                    {MARGIN_COPY.noCost.cause}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Formulas */}
                                <div>
                                    <p className="font-semibold text-slate-600 mb-2 uppercase text-[10px] tracking-wider">{MARGIN_COPY.formulasTitle}</p>
                                    <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-[11px] text-slate-600 leading-relaxed">
                                        {MARGIN_COPY.formulas.map((f, i) => <div key={i}>{f}</div>)}
                                    </div>
                                </div>

                                {/* Applied values */}
                                <div>
                                    <p className="font-semibold text-slate-600 mb-2 uppercase text-[10px] tracking-wider">{MARGIN_COPY.valuesTitle}</p>
                                    <table className="w-full text-[11px]">
                                        <tbody className="divide-y divide-slate-50">
                                            {([
                                                [MARGIN_COPY.valueLabels.ventas_netas, fv(vn, 2)],
                                                [MARGIN_COPY.valueLabels.unidades, unid.toLocaleString('es-AR')],
                                                [MARGIN_COPY.valueLabels.precio_unit_net, fv(precioUnit, 4)],
                                                [MARGIN_COPY.valueLabels.costo_unit_asof, fv(cu, 4)],
                                                [MARGIN_COPY.valueLabels.costo_total, fv(ct, 2)],
                                                [MARGIN_COPY.valueLabels.margen_pesos, fv(mp, 2)],
                                                [MARGIN_COPY.valueLabels.margen_pct, fp(mpct)],
                                            ] as [string, string][]).map(([label, val], i) => (
                                                <tr key={i}>
                                                    <td className="py-1 pr-3 text-slate-500">{label}</td>
                                                    <td className={`py-1 text-right font-semibold ${i >= 5 ? (isNeg ? 'text-red-600' : 'text-emerald-700') : 'text-slate-700'}`}>{val}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer: dates */}
                                <div className="text-[10px] text-slate-400 bg-slate-50 rounded px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                                    <span>{MARGIN_COPY.weekSelectedLabel}: <strong className="text-slate-600">{weekSelLabel}</strong></span>
                                    <span>{MARGIN_COPY.weekCostUsedLabel}: <strong className="text-slate-600">{costWeekLabel}</strong></span>
                                </div>

                                {/* Negative margin block */}
                                {isNeg && (
                                    <div className="border border-red-200 rounded-lg overflow-hidden">
                                        <div className="bg-red-50 px-3 py-2 text-red-700 font-semibold text-[11px]">
                                            ⚠ {MARGIN_COPY.negativeTitle}
                                        </div>
                                        <ul className="px-3 py-2 space-y-1.5 text-[11px] text-slate-600 list-none">
                                            {MARGIN_COPY.negativeCauses(costWeekLabel).map((cause, i) => (
                                                <li key={i} className="flex items-start gap-1.5">
                                                    <span className="text-red-400 shrink-0 mt-px">•</span>
                                                    <span>{cause}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {supplierId && (
                                            <div className="px-3 pb-3 pt-1">
                                                <a
                                                    href={`/suppliers/${supplierId}?sku=${encodeURIComponent(row.group_external_id || row.group_key)}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-colors"
                                                    onClick={() => setOpen(false)}
                                                >
                                                    🔍 Abrir costos del SKU
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


// ─── Multi-Select component ───────────────────────────────────────────────────

function MultiSelect({
    options, value, onChange, placeholder
}: {
    options: { id: string; name: string }[];
    value: string[];
    onChange: (v: string[]) => void;
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (id: string) => {
        if (value.includes(id)) onChange(value.filter(v => v !== id));
        else onChange([...value, id]);
    };

    const selectedNames = options.filter(o => value.includes(o.id)).map(o => o.name);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary text-left"
            >
                <span className="truncate text-slate-700">
                    {value.length === 0 ? <span className="text-slate-400">{placeholder}</span>
                        : selectedNames.length <= 2 ? selectedNames.join(', ')
                            : `${value.length} seleccionados`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
                    <div className="max-h-52 overflow-y-auto">
                        {options.length === 0 ? (
                            <div className="p-3 text-sm text-slate-400">Sin opciones</div>
                        ) : options.map(o => (
                            <label key={o.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                                <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)}
                                    className="accent-primary rounded" />
                                <span className="truncate text-slate-700">{o.name}</span>
                            </label>
                        ))}
                    </div>
                    {value.length > 0 && (
                        <button onClick={() => onChange([])} className="w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-t border-slate-100">
                            Limpiar selección
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Drill Drawer ─────────────────────────────────────────────────────────────

function DrillDrawer({
    open, onClose, baseFilters, drillName, drillField, drillId
}: {
    open: boolean;
    onClose: () => void;
    baseFilters: ProfitFilters;
    drillName: string;
    drillField: 'supplier_ids' | 'seller_ids';
    drillId: string;
}) {
    const [rows, setRows] = useState<ProfitTableRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const PAGE_SIZE = 50;

    useEffect(() => {
        if (!open) return;
        setPage(0);
        load(0);
    }, [open, drillId]);

    const load = async (p: number) => {
        setLoading(true);
        try {
            const filters: ProfitFilters = {
                ...baseFilters,
                group_by: 'sku',
                [drillField]: [drillId],
            };
            const { rows: r, total: t } = await getProfitTable(filters, p, PAGE_SIZE);
            setRows(r);
            setTotal(t);
        } catch (e: any) { console.error(e); }
        finally { setLoading(false); }
    };

    const handlePage = (p: number) => { setPage(p); load(p); };

    return (
        <div className={`fixed inset-0 z-50 flex justify-end transition-all ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
            <div className={`relative flex flex-col bg-white w-full max-w-4xl shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 text-white shrink-0">
                    <div>
                        <h2 className="text-base font-bold">Detalle SKUs — {drillName}</h2>
                        <p className="text-slate-300 text-xs mt-0.5">{total} SKUs encontrados</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                        </div>
                    ) : (
                        <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                            <thead className="sticky top-0 bg-slate-100 z-10">
                                <tr>
                                    {['SKU', 'Producto', 'Proveedor', 'Ventas Netas', 'Unidades', 'Costo Unit.', 'Margen $', 'Margen %', 'Estado'].map(h => (
                                        <th key={h} className="px-3 py-2 font-semibold text-slate-600 uppercase whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {rows.map(r => (
                                    <tr key={r.group_key} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{r.group_external_id || r.group_key.substring(0, 8)}</td>
                                        <td className="px-3 py-2 max-w-[200px] truncate font-medium text-slate-700" title={r.group_name}>{r.group_name}</td>
                                        <td className="px-3 py-2 text-slate-500">{r.supplier_name || '—'}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmt$(r.ventas_netas)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{Number(r.unidades).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmt$(r.cost_final_unit)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <MarginPopover
                                                row={r}
                                                weekSelected={baseFilters.week_date}
                                                groupBy="sku"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.margen_pct)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.cost_status === 'CON_COSTO' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {r.cost_status === 'CON_COSTO' ? '✓ OK' : '⚠ S/C'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                {total > PAGE_SIZE && (
                    <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-sm">
                        <span className="text-slate-500">Pág {page + 1} de {Math.ceil(total / PAGE_SIZE)}</span>
                        <div className="flex gap-2">
                            <button disabled={page === 0} onClick={() => handlePage(page - 1)} className="px-3 py-1 border rounded disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                            <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => handlePage(page + 1)} className="px-3 py-1 border rounded disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Charts Section ───────────────────────────────────────────────────────────

function ChartsSection({
    charts, onDrillSupplier, onDrillSeller, onDrillSku
}: {
    charts: ProfitChartsData | null;
    onDrillSupplier: (id: string) => void;
    onDrillSeller: (id: string) => void;
    onDrillSku: (sku: string) => void;
}) {
    if (!charts) return null;

    const barColor = (pct: number) => pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

    const fmtTooltip = (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const val = Number(p.value);
        return `${p.name}<br/>$${val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    const suppliersOpt = {
        tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const }, formatter: fmtTooltip },
        grid: { left: 120, right: 20, top: 10, bottom: 20 },
        xAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => '$' + (v / 1000).toFixed(0) + 'k' } },
        yAxis: {
            type: 'category' as const,
            data: [...(charts.top_suppliers || [])].reverse().map(s => s.supplier_name),
            axisLabel: { fontSize: 11 }
        },
        series: [{
            type: 'bar' as const,
            data: [...(charts.top_suppliers || [])].reverse().map(s => ({
                value: Math.round(s.margin_amount * 100) / 100,
                itemStyle: { color: barColor(s.coverage_pct) }
            })),
            barMaxWidth: 28,
        }]
    };

    const sellersOpt = {
        tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const }, formatter: fmtTooltip },
        grid: { left: 120, right: 20, top: 10, bottom: 20 },
        xAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => '$' + (v / 1000).toFixed(0) + 'k' } },
        yAxis: {
            type: 'category' as const,
            data: [...(charts.top_sellers || [])].reverse().map(s => s.seller_name),
            axisLabel: { fontSize: 11 }
        },
        series: [{
            type: 'bar' as const,
            data: [...(charts.top_sellers || [])].reverse().map(s => ({
                value: Math.round(s.margin_amount * 100) / 100,
                itemStyle: { color: barColor(s.coverage_pct) }
            })),
            barMaxWidth: 28,
        }]
    };

    const skusOpt = {
        tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const }, formatter: fmtTooltip },
        grid: { left: 160, right: 20, top: 10, bottom: 20 },
        xAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => '$' + (v / 1000).toFixed(0) + 'k' } },
        yAxis: {
            type: 'category' as const,
            data: [...(charts.top_skus || [])].reverse().map(s => (s.product_name || s.sku || '').substring(0, 22)),
            axisLabel: { fontSize: 10 }
        },
        series: [{
            type: 'bar' as const,
            data: [...(charts.top_skus || [])].reverse().map(s => ({
                value: Math.round(s.margin_amount * 100) / 100,
                itemStyle: { color: s.cost_status === 'CON_COSTO' ? '#10b981' : '#ef4444' }
            })),
            barMaxWidth: 24,
        }]
    };

    const cov = charts.coverage;
    const coverageOpt = {
        tooltip: {
            trigger: 'item' as const,
            formatter: (p: any) => {
                const val = Number(p.value);
                return `${p.name}: $${val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} (${Number(p.percent).toFixed(1)}%)`;
            }
        },
        legend: { bottom: 0, textStyle: { fontSize: 11 } },
        series: [{
            type: 'pie' as const,
            radius: ['40%', '70%'],
            data: [
                { name: 'Con costo', value: Math.round(cov?.sales_with_cost || 0), itemStyle: { color: '#10b981' } },
                { name: 'Sin costo', value: Math.round(cov?.sales_without_cost || 0), itemStyle: { color: '#f59e0b' } },
            ],
            label: { show: true, formatter: '{d}%', fontSize: 12, fontWeight: 'bold' }
        }]
    };

    const handleSupplierClick = (params: any) => {
        const idx = (charts.top_suppliers?.length || 0) - 1 - params.dataIndex;
        const s = charts.top_suppliers?.[idx];
        if (s) onDrillSupplier(s.supplier_id);
    };

    const handleSellerClick = (params: any) => {
        const idx = (charts.top_sellers?.length || 0) - 1 - params.dataIndex;
        const s = charts.top_sellers?.[idx];
        if (s) onDrillSeller(s.seller_id);
    };

    const handleSkuClick = (params: any) => {
        const idx = (charts.top_skus?.length || 0) - 1 - params.dataIndex;
        const s = charts.top_skus?.[idx];
        if (s) onDrillSku(s.sku);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3">🏭 Top Proveedores por Margen $</h3>
                <p className="text-[10px] text-slate-400 mb-2">Clic en barra para filtrar</p>
                <ReactECharts option={suppliersOpt} style={{ height: 240 }} onEvents={{ click: handleSupplierClick }} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3">👤 Top Vendedores por Margen $</h3>
                <p className="text-[10px] text-slate-400 mb-2">Clic en barra para filtrar</p>
                <ReactECharts option={sellersOpt} style={{ height: 240 }} onEvents={{ click: handleSellerClick }} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3">📦 Top SKUs por Margen $</h3>
                <p className="text-[10px] text-slate-400 mb-2">Clic en barra para filtrar</p>
                <ReactECharts option={skusOpt} style={{ height: 280 }} onEvents={{ click: handleSkuClick }} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3">📊 Cobertura de Costos</h3>
                {cov && (
                    <div className="flex gap-4 text-xs mb-2">
                        <span className="text-slate-500">Total: <strong>{fmt$(cov.sales_total)}</strong></span>
                        <span className="text-emerald-600">Con costo: <strong>{fmtPct(cov.coverage_pct, 0.01)}</strong></span>
                    </div>
                )}
                <ReactECharts option={coverageOpt} style={{ height: 240 }} />
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const currentMonday = formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), { representation: 'date' });

export default function RentabilidadPage() {
    // Master data
    const [periods, setPeriods] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [sellers, setSellers] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [masterLoading, setMasterLoading] = useState(true);

    // Filters (staged — only applied on "Aplicar")
    const [periodId, setPeriodId] = useState('');
    const [weekDate, setWeekDate] = useState(currentMonday);
    const [supplierIds, setSupplierIds] = useState<string[]>([]);
    const [sellerIds, setSellerIds] = useState<string[]>([]);
    const [customerIds, setCustomerIds] = useState<string[]>([]);
    const [skuSearch, setSkuSearch] = useState('');
    const [groupBy, setGroupBy] = useState<GroupBy>('supplier');
    const [soloConCosto, setSoloConCosto] = useState(false);
    const [soloSinCosto, setSoloSinCosto] = useState(false);
    const [soloMargenNeg, setSoloMargenNeg] = useState(false);

    // Applied filters (snapshot used for data fetch)
    const [appliedFilters, setAppliedFilters] = useState<ProfitFilters | null>(null);

    // Table
    const [rows, setRows] = useState<ProfitTableRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [tableLoading, setTableLoading] = useState(false);
    const [tableError, setTableError] = useState('');

    // Charts
    const [charts, setCharts] = useState<ProfitChartsData | null>(null);
    const [chartsLoading, setChartsLoading] = useState(false);
    const [showCharts, setShowCharts] = useState(true);

    // Drill drawer
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerName, setDrawerName] = useState('');
    const [drawerField, setDrawerField] = useState<'supplier_ids' | 'seller_ids'>('supplier_ids');
    const [drawerId, setDrawerId] = useState('');

    const skuDebounceRef = useRef<ReturnType<typeof setTimeout>>();

    // ─── Load master data ─────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            setMasterLoading(true);
            try {
                const [p, s, sel, cust] = await Promise.all([getPeriods(), getSuppliers(), getSellers(), getCustomers()]);
                setPeriods(p || []);
                setSuppliers(s || []);
                setSellers(sel || []);
                setCustomers(cust || []);
                if (p?.length) setPeriodId(p[0].id);
            } catch (e: any) { console.error(e); }
            finally { setMasterLoading(false); }
        })();
    }, []);

    // ─── Apply filters ────────────────────────────────────────────────────────
    const applyFilters = useCallback(() => {
        if (!periodId) return;
        const f: ProfitFilters = {
            period_id: periodId,
            week_date: weekDate,
            group_by: groupBy,
            supplier_ids: supplierIds,
            seller_ids: sellerIds,
            customer_ids: customerIds,
            sku_search: skuSearch.trim() || undefined,
            solo_con_costo: soloConCosto,
            solo_sin_costo: soloSinCosto,
            solo_margen_neg: soloMargenNeg,
        };
        setAppliedFilters(f);
        setPage(0);
    }, [periodId, weekDate, groupBy, supplierIds, sellerIds, customerIds, skuSearch, soloConCosto, soloSinCosto, soloMargenNeg]);

    // ─── Fetch table ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!appliedFilters) return;
        (async () => {
            setTableLoading(true);
            setTableError('');
            try {
                const { rows: r, total: t } = await getProfitTable(appliedFilters, page, PAGE_SIZE);
                setRows(r);
                setTotal(t);
            } catch (e: any) {
                setTableError(e.message);
            } finally { setTableLoading(false); }
        })();
    }, [appliedFilters, page]);

    // ─── Fetch charts ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!appliedFilters || !showCharts) return;
        (async () => {
            setChartsLoading(true);
            try {
                const data = await getProfitCharts(appliedFilters);
                setCharts(data);
            } catch (e: any) { console.error(e); }
            finally { setChartsLoading(false); }
        })();
    }, [appliedFilters, showCharts]);

    // ─── Drill-click handlers ─────────────────────────────────────────────────
    const handleRowClick = (row: ProfitTableRow) => {
        if (groupBy === 'supplier') {
            setDrawerField('supplier_ids');
            setDrawerId(row.group_key);
            setDrawerName(row.group_name);
            setDrawerOpen(true);
        } else if (groupBy === 'seller') {
            setDrawerField('seller_ids');
            setDrawerId(row.group_key);
            setDrawerName(row.group_name);
            setDrawerOpen(true);
        }
    };

    const handleChartDrillSupplier = (id: string) => {
        const s = suppliers.find(x => x.id === id);
        setSupplierIds([id]);
        if (s) {
            setDrawerField('supplier_ids');
            setDrawerId(id);
            setDrawerName(s.name);
            setDrawerOpen(true);
        }
    };

    const handleChartDrillSeller = (id: string) => {
        const s = sellers.find(x => x.id === id);
        setSellerIds([id]);
        if (s) {
            setDrawerField('seller_ids');
            setDrawerId(id);
            setDrawerName(s.name);
            setDrawerOpen(true);
        }
    };

    const handleChartDrillSku = (sku: string) => {
        setSkuSearch(sku);
        // Schedule apply after state settles
        setTimeout(applyFilters, 50);
    };

    // ─── CSV Export ────────────────────────────────────────────────────────────
    const handleExportCsv = () => {
        if (!rows.length) return;
        const isSkuMode = appliedFilters?.group_by === 'sku';
        const headers = isSkuMode
            ? ['group_key', 'group_name', 'supplier_name', 'ventas_netas', 'unidades', 'cost_final_unit', 'costo_total', 'margen_pesos', 'margen_pct', 'cobertura_pct', 'cost_status']
            : ['group_key', 'group_name', 'ventas_netas', 'unidades', 'costo_total', 'margen_pesos', 'margen_pct', 'cobertura_pct'];
        exportToCsv(`rentabilidad_${appliedFilters?.group_by}_${new Date().toISOString().slice(0, 10)}.csv`, rows, headers);
    };

    const handleExportPendientes = async () => {
        if (!appliedFilters) return;
        try {
            const filtersNoCosto = { ...appliedFilters, group_by: 'sku' as GroupBy, solo_sin_costo: true, solo_con_costo: false };
            const { rows: pending } = await getProfitTable(filtersNoCosto, 0, 5000);
            if (!pending.length) { alert('No hay SKUs sin costo para este período.'); return; }
            exportToCsv(
                `pendientes_sin_costo_${new Date().toISOString().slice(0, 10)}.csv`,
                pending,
                ['group_key', 'group_name', 'supplier_name', 'ventas_netas', 'unidades']
            );
        } catch (e: any) { alert('Error: ' + e.message); }
    };

    // ─── Render ────────────────────────────────────────────────────────────────
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const isClickable = groupBy === 'supplier' || groupBy === 'seller';
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const handleResetCharts = useCallback(() => {
        setSupplierIds([]);
        setSellerIds([]);
        setSkuSearch('');
        // re-apply with cleared chart-drill filters
        if (!appliedFilters) return;
        const f: ProfitFilters = {
            ...appliedFilters,
            supplier_ids: [],
            seller_ids: [],
            sku_search: undefined,
        };
        setAppliedFilters(f);
        setPage(0);
    }, [appliedFilters]);

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            {/* Collapsible Sidebar */}
            {sidebarOpen && <Sidebar />}
            <main
                className="overflow-y-auto min-w-0"
                style={{ flex: sidebarOpen ? '1' : '1 0 100vw' }}
            >
                <MobileHeader />
                <div
                    className="space-y-5"
                    style={sidebarOpen
                        ? { padding: '24px', maxWidth: '1600px', margin: '0 auto' }
                        : { padding: '16px', width: '100%' }
                    }
                >

                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSidebarOpen(v => !v)}
                                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition-colors text-slate-500"
                                title={sidebarOpen ? 'Ocultar sidebar' : 'Mostrar sidebar'}
                            >
                                <ChevronLeft className={`w-4 h-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
                            </button>
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                                    <TrendingUp className="w-8 h-8 text-primary" /> Rentabilidad
                                </h1>
                                <p className="text-slate-500 text-sm mt-1">Margen por período, con costo as-of semana seleccionada</p>
                            </div>
                        </div>
                        {appliedFilters && (
                            <div className="flex gap-2">
                                <button onClick={handleExportCsv} disabled={!rows.length}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 bg-white">
                                    <Download className="w-4 h-4" /> Exportar tabla
                                </button>
                                <button onClick={handleExportPendientes}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 bg-white">
                                    <Download className="w-4 h-4" /> Pendientes s/costo
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Filter Bar */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-slate-500" />
                            <h2 className="text-sm font-bold text-slate-700">Filtros</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">

                            {/* Period */}
                            <div className="lg:col-span-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Período *</label>
                                <select value={periodId} onChange={e => setPeriodId(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">
                                    <option value="">— seleccionar —</option>
                                    {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                </select>
                            </div>

                            {/* Week */}
                            <div className="lg:col-span-1">
                                <label
                                    className="block text-xs font-semibold text-slate-500 mb-1 cursor-help"
                                    title={MARGIN_COPY.weekSelectorTooltip}
                                >
                                    {MARGIN_COPY.weekSelectorLabel} ℹ️
                                </label>
                                <input type="date" value={weekDate} onChange={e => setWeekDate(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>

                            {/* Group By */}
                            <div className="lg:col-span-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Agrupar por</label>
                                <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">
                                    {GROUP_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>

                            {/* SKU Search */}
                            <div className="lg:col-span-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Buscar SKU / Producto</label>
                                <input type="text" value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
                                    placeholder="código o nombre…"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>

                            {/* Supplier */}
                            <div className="lg:col-span-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Proveedor</label>
                                <MultiSelect options={suppliers} value={supplierIds} onChange={setSupplierIds} placeholder="Todos los proveedores" />
                            </div>

                            {/* Seller */}
                            <div className="lg:col-span-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Vendedor</label>
                                <MultiSelect options={sellers} value={sellerIds} onChange={setSellerIds} placeholder="Todos los vendedores" />
                            </div>
                        </div>

                        {/* Row 2: Toggles + Apply */}
                        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                            {[
                                { label: 'Solo con costo', value: soloConCosto, set: setSoloConCosto },
                                { label: 'Solo sin costo', value: soloSinCosto, set: setSoloSinCosto },
                                { label: 'Solo margen negativo', value: soloMargenNeg, set: setSoloMargenNeg },
                            ].map(({ label, value, set }) => (
                                <label key={label} className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
                                    <input type="checkbox" checked={value} onChange={e => set(e.target.checked)}
                                        className="rounded border-slate-300 accent-primary w-4 h-4" />
                                    {label}
                                </label>
                            ))}
                            <div className="ml-auto">
                                <button onClick={applyFilters} disabled={!periodId || masterLoading}
                                    className="flex items-center gap-2 bg-primary text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-sm">
                                    {tableLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                                    Aplicar filtros
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {tableError && (
                        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-sm">Error cargando datos</p>
                                <p className="text-xs mt-0.5">{tableError}</p>
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {!appliedFilters && !masterLoading && (
                        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                            <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-slate-600 mb-2">Seleccioná un período y aplicá los filtros</h3>
                            <p className="text-slate-400 text-sm">La tabla y los gráficos se generarán con los datos de ventas y costos del período elegido.</p>
                        </div>
                    )}

                    {/* Table */}
                    {appliedFilters && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                                <div>
                                    <h2 className="font-bold text-slate-800">
                                        Resultados — {GROUP_BY_OPTIONS.find(o => o.value === appliedFilters.group_by)?.label}
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString()} filas · {rows.length} visibles</p>
                                </div>
                                {isClickable && (
                                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
                                        💡 Clic en fila para ver detalle por SKU
                                    </span>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                {tableLoading ? (
                                    <div className="flex items-center justify-center h-48 gap-2 text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin" /> Calculando márgenes…
                                    </div>
                                ) : rows.length === 0 ? (
                                    <div className="p-12 text-center text-slate-400 text-sm">
                                        No se encontraron datos para los filtros seleccionados.
                                    </div>
                                ) : (
                                    <table className="w-full text-xs text-left border-collapse">
                                        <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold text-slate-500 uppercase">
                                                    {GROUP_BY_OPTIONS.find(o => o.value === appliedFilters.group_by)?.label}
                                                </th>
                                                {appliedFilters.group_by === 'sku' && (
                                                    <th className="px-3 py-3 font-semibold text-slate-500 uppercase">Proveedor</th>
                                                )}
                                                <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Ventas Netas</th>
                                                <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Unidades</th>
                                                <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Costo Total</th>
                                                <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Margen $</th>
                                                <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Margen %</th>
                                                <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Cobertura</th>
                                                {appliedFilters.group_by === 'sku' && (
                                                    <>
                                                        <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Costo Unit.</th>
                                                        <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Pr. Compra</th>
                                                        <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Flete %</th>
                                                        <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Margen L1 %</th>
                                                        <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">P. L1 Neto</th>
                                                        <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-right">Beneficio</th>
                                                        <th className="px-3 py-3 font-semibold text-slate-500 uppercase text-center">Estado</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {rows.map((row) => {
                                                const margenNeg = Number(row.margen_pesos) < 0;
                                                const sinCosto = appliedFilters.group_by === 'sku' && row.cost_status === 'SIN_COSTO';
                                                return (
                                                    <tr
                                                        key={row.group_key}
                                                        onClick={() => handleRowClick(row)}
                                                        className={`transition-colors ${isClickable ? 'cursor-pointer hover:bg-blue-50/50' : 'hover:bg-slate-50/70'}
                                                            ${margenNeg ? 'bg-red-50/30' : sinCosto ? 'bg-orange-50/30' : ''}`}
                                                    >
                                                        <td className="px-4 py-2.5 font-medium text-slate-800">
                                                            {appliedFilters.group_by === 'sku' && row.group_external_id ? (
                                                                <span>
                                                                    <span className="font-mono text-slate-400 text-[11px] mr-1.5">{row.group_external_id}</span>
                                                                    {row.group_name || row.group_key}
                                                                </span>
                                                            ) : (
                                                                row.group_name || row.group_key
                                                            )}
                                                        </td>
                                                        {appliedFilters.group_by === 'sku' && (
                                                            <td className="px-3 py-2.5 text-slate-500">{row.supplier_name || '—'}</td>
                                                        )}
                                                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt$(row.ventas_netas)}</td>
                                                        <td className="px-3 py-2.5 text-right tabular-nums">{Number(row.unidades).toLocaleString()}</td>
                                                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt$(row.costo_total)}</td>
                                                        <td className="px-3 py-2.5 text-right">
                                                            <MarginPopover
                                                                row={row}
                                                                weekSelected={appliedFilters.week_date}
                                                                groupBy={appliedFilters.group_by as GroupBy}
                                                            />
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${margenNeg ? 'text-red-500' : Number(row.margen_pct) > 0.2 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                            {fmtPct(row.margen_pct)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right tabular-nums">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                                                    <div className={`h-1.5 rounded-full ${Number(row.cobertura_pct) >= 80 ? 'bg-emerald-500' : 'bg-orange-400'}`}
                                                                        style={{ width: `${Math.min(Number(row.cobertura_pct), 100)}%` }} />
                                                                </div>
                                                                <span className="w-10 text-right">{Number(row.cobertura_pct).toFixed(0)}%</span>
                                                            </div>
                                                        </td>
                                                        {appliedFilters.group_by === 'sku' && (
                                                            <>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt$(row.cost_final_unit)}</td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt$(row.purchase_price)}</td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                                                                    {row.freight_pct != null ? (Number(row.freight_pct) * 100).toFixed(1) + '%' : '—'}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                                                                    {row.margin_list1_pct != null ? (Number(row.margin_list1_pct) * 100).toFixed(1) + '%' : '—'}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-sky-700">{fmt$(row.price_list1_net)}</td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums">
                                                                    {row.benefit_pct != null
                                                                        ? <span className={Number(row.benefit_pct) < 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>
                                                                            {(Number(row.benefit_pct) * 100).toFixed(2)}%
                                                                        </span>
                                                                        : <span className="text-slate-300">—</span>}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap
                                                                        ${row.cost_status === 'CON_COSTO' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                        {row.cost_status === 'CON_COSTO' ? '✓ OK' : '⚠ S/C'}
                                                                    </span>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/70">
                                    <span className="text-xs text-slate-500">
                                        Pág {page + 1} de {totalPages} · {total.toLocaleString()} resultados
                                    </span>
                                    <div className="flex gap-2">
                                        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-slate-100">
                                            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                                        </button>
                                        <button disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-slate-100">
                                            Siguiente <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Charts Section */}
                    {appliedFilters && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="flex items-center border-b border-slate-100">
                                <button
                                    onClick={() => setShowCharts(v => !v)}
                                    className="flex-1 flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                                >
                                    <span className="font-bold text-slate-800 flex items-center gap-2">
                                        📊 Análisis Gráfico
                                        {chartsLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                                    </span>
                                    {showCharts ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                                </button>
                                {(supplierIds.length > 0 || sellerIds.length > 0 || skuSearch) && (
                                    <button
                                        onClick={handleResetCharts}
                                        className="flex items-center gap-1.5 px-4 py-2 mr-3 text-xs font-semibold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                                        title="Limpiar filtros de gráfico y volver a la vista general"
                                    >
                                        ↺ Resetear filtros gráfico
                                    </button>
                                )}
                            </div>
                            {showCharts && (
                                <div className="p-5">
                                    {chartsLoading ? (
                                        <div className="flex items-center justify-center h-32 gap-2 text-slate-400">
                                            <Loader2 className="w-5 h-5 animate-spin" /> Calculando gráficos…
                                        </div>
                                    ) : charts ? (
                                        <ChartsSection
                                            charts={charts}
                                            onDrillSupplier={handleChartDrillSupplier}
                                            onDrillSeller={handleChartDrillSeller}
                                            onDrillSku={handleChartDrillSku}
                                        />
                                    ) : (
                                        <p className="text-center text-sm text-slate-400 py-8">Aplicá los filtros para ver los gráficos.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Drill Drawer */}
            {appliedFilters && (
                <DrillDrawer
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    baseFilters={appliedFilters}
                    drillName={drawerName}
                    drillField={drawerField}
                    drillId={drawerId}
                />
            )}
        </div>
    );
}

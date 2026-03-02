"use client";

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import { getSellersSummary, SellerSummaryRow, SellersFilterParams } from '@/lib/data/sellers';
import { getPeriods } from '@/lib/data/periods';
import { getSuppliers, getCustomers } from '@/lib/data/master';
import Link from 'next/link';
import { Users, Search, Download, Filter, ChevronRight, Loader2 } from 'lucide-react';
import { formatISO, startOfWeek } from 'date-fns';

const fmt$ = (n: number | null | undefined) =>
    n == null ? '—' : '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtPct = (n: number | null | undefined) =>
    n == null ? '—' : (Number(n) * 100).toFixed(1) + '%';

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

function SellersOverview() {
    // Master data
    const [periods, setPeriods] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [masterLoading, setMasterLoading] = useState(true);

    // Filters
    const currentMonday = formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), { representation: 'date' });
    const [periodId, setPeriodId] = useState('');
    const [weekDate, setWeekDate] = useState(currentMonday);
    const [supplierId, setSupplierId] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [skuSearch, setSkuSearch] = useState('');

    const [appliedFilters, setAppliedFilters] = useState<SellersFilterParams | null>(null);

    // Data
    const [rows, setRows] = useState<SellerSummaryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        (async () => {
            setMasterLoading(true);
            try {
                const [p, s, c] = await Promise.all([getPeriods(), getSuppliers(), getCustomers()]);
                setPeriods(p || []);
                setSuppliers(s || []);
                setCustomers(c || []);
                if (p?.length) {
                    setPeriodId(p[0].id);
                    setAppliedFilters({
                        periodIds: [p[0].id],
                        weekDate: currentMonday
                    });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setMasterLoading(false);
            }
        })();
    }, [currentMonday]);

    const handleApply = () => {
        if (!periodId) return;
        setAppliedFilters({
            periodIds: [periodId],
            weekDate,
            supplierId: supplierId || undefined,
            customerId: customerId || undefined,
            skuSearch: skuSearch.trim() || undefined,
        });
    };

    useEffect(() => {
        if (!appliedFilters) return;
        (async () => {
            setLoading(true);
            setErrorMsg('');
            try {
                const data = await getSellersSummary(appliedFilters);
                setRows(data);
            } catch (e: any) {
                console.error(e);
                setErrorMsg(e.message || 'Error al cargar datos');
            }
            setLoading(false);
        })();
    }, [appliedFilters]);

    const handleExport = () => {
        if (!rows.length) return;
        const headers = ['seller_name', 'sales_net', 'units', 'customers_count', 'invoices_count', 'coverage_cost_pct', 'margin_amount', 'margin_pct'];
        exportToCsv(`vendedores_${new Date().toISOString().slice(0, 10)}.csv`, rows, headers);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto min-w-0">
                <MobileHeader />
                <div className="p-4 lg:p-8 max-w-[1600px] mx-auto space-y-6">

                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                                <Users className="w-8 h-8 text-primary" /> Vendedores
                            </h1>
                            <p className="text-slate-500 text-sm mt-1">Rendimiento, ventas, y márgenes por vendedor</p>
                        </div>
                        {appliedFilters && (
                            <button onClick={handleExport} disabled={!rows.length}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 bg-white">
                                <Download className="w-4 h-4" /> Exportar CSV
                            </button>
                        )}
                    </div>

                    {/* Filter Bar */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-slate-500" />
                            <h2 className="text-sm font-bold text-slate-700">Filtros Globales</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

                            {/* Periodo */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Período *</label>
                                {masterLoading ? (
                                    <div className="h-[38px] bg-slate-100 animate-pulse rounded-lg border border-slate-200" />
                                ) : (
                                    <select
                                        value={periodId}
                                        onChange={e => setPeriodId(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                    >
                                        <option value="" disabled>Seleccione período</option>
                                        {periods.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Semana de Costo */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Costo al (Lunes) *</label>
                                <input
                                    type="date"
                                    value={weekDate}
                                    onChange={e => setWeekDate(e.target.value)}
                                    // Make sure it's Monday
                                    step={7}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                />
                            </div>

                            {/* Proveedor */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Proveedor (0=Todos)</label>
                                <select
                                    value={supplierId}
                                    onChange={e => setSupplierId(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                >
                                    <option value="">(Todos los proveedores)</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            {/* Cliente */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente (0=Todos)</label>
                                <select
                                    value={customerId}
                                    onChange={e => setCustomerId(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                >
                                    <option value="">(Todos los clientes)</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            {/* SKU / Button */}
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">SKU</label>
                                    <input
                                        type="text"
                                        placeholder="Código o descrip."
                                        value={skuSearch}
                                        onChange={e => setSkuSearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleApply();
                                        }}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                    />
                                </div>
                                <button
                                    onClick={handleApply}
                                    disabled={loading || !periodId}
                                    className="h-[38px] px-4 shrink-0 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                                >
                                    Aplicar
                                </button>
                            </div>

                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading && (
                            <div className="h-2 w-full bg-blue-50 overflow-hidden">
                                <div className="h-full bg-blue-500 animate-[move-right_1.5s_infinite_ease-in-out] w-1/3" />
                            </div>
                        )}
                        {errorMsg && (
                            <div className="p-4 bg-red-50 text-red-600 text-sm border-b border-red-100 font-medium">
                                Error: {errorMsg}
                            </div>
                        )}
                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Vendedor</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Clientes</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Facturas</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Ventas Netas</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right hidden lg:table-cell">Margen $ (S/Costo)</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right hidden lg:table-cell">Cobertura</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Rank</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 relative">
                                    {!loading && rows.length === 0 && !errorMsg ? (
                                        <tr><td colSpan={8} className="p-8 text-center text-slate-500 bg-slate-50/50">No hay datos que coincidan con los filtros aplicados.</td></tr>
                                    ) : (
                                        rows.map((r) => (
                                            <tr key={r.seller_id} className="hover:bg-blue-50/50 transition-colors group">
                                                <td className="p-4">
                                                    <div className="font-semibold text-slate-900 group-hover:text-primary transition-colors">{r.seller_name || 'Sin Asignar'}</div>
                                                    <div className="text-xs text-slate-400 mt-1 font-mono">{r.seller_id.substring(0, 8)}</div>
                                                </td>
                                                <td className="p-4 text-right tabular-nums text-slate-600 font-medium">{Number(r.customers_count).toLocaleString('es-AR')}</td>
                                                <td className="p-4 text-right tabular-nums text-slate-600">{Number(r.invoices_count).toLocaleString('es-AR')}</td>
                                                <td className="p-4 text-right tabular-nums font-bold text-slate-800">{fmt$(r.sales_net)}</td>
                                                <td className={`p-4 text-right tabular-nums font-medium hidden lg:table-cell ${r.margin_amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                                    <div>{fmt$(r.margin_amount)}</div>
                                                    <div className="text-xs opacity-70">{fmtPct(r.margin_pct)}</div>
                                                </td>
                                                <td className="p-4 text-right tabular-nums hidden lg:table-cell">
                                                    <div className={`px-2 py-0.5 rounded inline-flex text-xs font-medium ${r.coverage_cost_pct >= 95 ? 'bg-emerald-50 text-emerald-700' : r.coverage_cost_pct >= 80 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                                                        {fmtPct(r.coverage_cost_pct / 100)}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right tabular-nums text-xs text-slate-400">
                                                    # {r.rank_sales}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Link
                                                        href={`/sellers/${r.seller_id}?periods=${appliedFilters?.periodIds?.join(',') || ''}&week=${appliedFilters?.weekDate || ''}`}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-primary hover:text-primary rounded-lg text-sm font-medium transition-colors shadow-sm"
                                                    >
                                                        Detalle <ChevronRight className="w-4 h-4" />
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function SellersPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen overflow-hidden bg-slate-50 items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-slate-500 font-medium">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    Cargando...
                </div>
            </div>
        }>
            <SellersOverview />
        </Suspense>
    );
}

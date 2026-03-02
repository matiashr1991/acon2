"use client";

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import {
    getSellerCustomers, getSellerSuppliers, getSellerProducts,
    SellerCustomerRow, SellerSupplierRow, SellerProductRow,
    SellersFilterParams
} from '@/lib/data/sellers';
import { ArrowLeft, Users, Building2, Package, Calculator, Loader2, Download } from 'lucide-react';
import Link from 'next/link';

const TABS = [
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'suppliers', label: 'Proveedores', icon: Building2 },
    { id: 'products', label: 'Productos', icon: Package },
    { id: 'commissions', label: 'Simulador Comisiones', icon: Calculator },
];

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

function SellerDetail() {
    const params = useParams();
    const searchParams = useSearchParams();

    const sellerId = params.id as string;
    const initialPeriodIds = searchParams.get('periods')?.split(',') || [];
    const initialWeekDate = searchParams.get('week') || new Date().toISOString().split('T')[0];

    const [activeTab, setActiveTab] = useState(TABS[0].id);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // Data states
    const [customers, setCustomers] = useState<SellerCustomerRow[]>([]);
    const [suppliers, setSuppliers] = useState<SellerSupplierRow[]>([]);
    const [products, setProducts] = useState<SellerProductRow[]>([]);

    useEffect(() => {
        if (!sellerId) return;

        (async () => {
            setLoading(true);
            setErrorMsg('');
            try {
                const baseParams: SellersFilterParams = {
                    periodIds: initialPeriodIds,
                    weekDate: initialWeekDate
                };

                const [c, s, p] = await Promise.all([
                    getSellerCustomers(sellerId, { periodIds: initialPeriodIds }),
                    getSellerSuppliers(sellerId, { periodIds: initialPeriodIds, weekDate: initialWeekDate }),
                    getSellerProducts(sellerId, baseParams)
                ]);

                setCustomers(c);
                setSuppliers(s);
                setProducts(p);

            } catch (e: any) {
                console.error(e);
                setErrorMsg('Error al cargar datos del vendedor: ' + e.message);
            }
            setLoading(false);
        })();
    }, [sellerId, initialPeriodIds.join(','), initialWeekDate]);

    const handleExportCustomers = () => {
        if (!customers.length) return;
        exportToCsv(`vendedor_${sellerId}_clientes.csv`, customers, ['customer_id', 'customer_name', 'address', 'invoices_count', 'sales_net', 'units']);
    };

    const handleExportSuppliers = () => {
        if (!suppliers.length) return;
        exportToCsv(`vendedor_${sellerId}_proveedores.csv`, suppliers, ['supplier_id', 'supplier_name', 'sales_net', 'units', 'margin_amount', 'margin_pct', 'coverage_pct']);
    };

    const handleExportProducts = () => {
        if (!products.length) return;
        exportToCsv(`vendedor_${sellerId}_productos.csv`, products, ['product_id', 'sku', 'product_name', 'sales_net', 'units', 'cost_unit_asof', 'margin_amount', 'cost_status']);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto min-w-0">
                <MobileHeader />
                <div className="p-4 lg:p-8 max-w-[1600px] mx-auto space-y-6">

                    {/* Header */}
                    <div>
                        <Link href="/sellers" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary mb-4 transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Volver a Vendedores
                        </Link>
                        <div className="flex items-center justify-between">
                            <h1 className="text-3xl font-bold text-slate-900">
                                Detalle del Vendedor
                                <span className="block text-sm font-normal text-slate-500 mt-1 font-mono">ID: {sellerId}</span>
                            </h1>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex space-x-1 border-b border-slate-200">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" /> {tab.label}
                            </button>
                        ))}
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
                        </div>
                    )}

                    {errorMsg && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 font-medium">
                            {errorMsg}
                        </div>
                    )}

                    {!loading && !errorMsg && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
                            {activeTab === 'customers' && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-slate-800">Top Clientes</h3>
                                        <button onClick={handleExportCustomers} disabled={!customers.length} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                                            <Download className="w-4 h-4" /> Exportar CSV
                                        </button>
                                    </div>
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase">Cliente</th>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase">Dirección</th>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Facturas</th>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Ventas Netas</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {customers.map(c => (
                                                <tr key={c.customer_id} className="hover:bg-slate-50">
                                                    <td className="p-3 font-medium text-slate-800">{c.customer_name}</td>
                                                    <td className="p-3 text-sm text-slate-500 truncate max-w-[200px]" title={c.address || ''}>{c.address || '—'}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(c.invoices_count).toLocaleString('es-AR')}</td>
                                                    <td className="p-3 text-right tabular-nums font-bold">{fmt$(c.sales_net)}</td>
                                                </tr>
                                            ))}
                                            {customers.length === 0 && (
                                                <tr><td colSpan={4} className="p-8 text-center text-slate-500">No hay datos de clientes.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'suppliers' && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-slate-800">Rendimiento por Proveedor</h3>
                                        <button onClick={handleExportSuppliers} disabled={!suppliers.length} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                                            <Download className="w-4 h-4" /> Exportar CSV
                                        </button>
                                    </div>
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase">Proveedor</th>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Ventas Netas</th>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Margen $</th>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Margen %</th>
                                                <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Cobertura %</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {suppliers.map(s => (
                                                <tr key={s.supplier_id} className="hover:bg-slate-50">
                                                    <td className="p-3 font-medium text-slate-800">{s.supplier_name}</td>
                                                    <td className="p-3 text-right tabular-nums font-bold">{fmt$(s.sales_net)}</td>
                                                    <td className={`p-3 text-right tabular-nums font-medium ${s.margin_amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmt$(s.margin_amount)}</td>
                                                    <td className="p-3 text-right tabular-nums text-slate-600">{fmtPct(s.margin_pct)}</td>
                                                    <td className="p-3 text-right tabular-nums text-slate-600">{fmtPct(s.coverage_pct / 100)}</td>
                                                </tr>
                                            ))}
                                            {suppliers.length === 0 && (
                                                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No hay datos de proveedores.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'products' && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-slate-800">Detalle de SKUs</h3>
                                        <button onClick={handleExportProducts} disabled={!products.length} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                                            <Download className="w-4 h-4" /> Exportar CSV
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left min-w-[800px]">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="p-3 text-xs font-semibold text-slate-500 uppercase">SKU</th>
                                                    <th className="p-3 text-xs font-semibold text-slate-500 uppercase">Producto</th>
                                                    <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Ventas Netas</th>
                                                    <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Costo Unit.</th>
                                                    <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-right">Margen $</th>
                                                    <th className="p-3 text-xs font-semibold text-slate-500 uppercase text-center">Estado Costo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {products.map(p => (
                                                    <tr key={p.product_id} className="hover:bg-slate-50">
                                                        <td className="p-3 text-sm font-mono text-slate-500">{p.sku}</td>
                                                        <td className="p-3 font-medium text-slate-800 max-w-[200px] truncate" title={p.product_name}>{p.product_name}</td>
                                                        <td className="p-3 text-right tabular-nums font-bold">{fmt$(p.sales_net)}</td>
                                                        <td className="p-3 text-right tabular-nums text-slate-600">{fmt$(p.cost_unit_asof)}</td>
                                                        <td className={`p-3 text-right tabular-nums font-medium ${p.margin_amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmt$(p.margin_amount)}</td>
                                                        <td className="p-3 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.cost_status === 'CON_COSTO' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                {p.cost_status === 'CON_COSTO' ? '✓ OK' : '⚠ S/C'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {products.length === 0 && (
                                                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">No hay datos de productos.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'commissions' && (
                                <div>
                                    <div className="flex items-center gap-3 mb-6 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                        <Calculator className="w-8 h-8 text-blue-500" />
                                        <div>
                                            <h3 className="font-bold text-slate-800">Simulador de Comisiones</h3>
                                            <p className="text-sm text-slate-600">Proyección usando cálculos parametrizados para las ventas netas del vendedor en el período.</p>
                                        </div>
                                    </div>
                                    {/* Simulador temporal */}
                                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                        <h4 className="text-xl font-medium text-slate-400 mb-2">Construcción en progreso...</h4>
                                        <p className="text-slate-500 text-sm">Aquí se integrarán las reglas dinámicas de comisiones basadas en márgenes, cumplimiento y cuotas.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}

export default function SellerDetailPage() {
    return <Suspense><SellerDetail /></Suspense>;
}

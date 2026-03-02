"use client";

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import { getSupplierById, getProductsBySupplier } from '@/lib/data/master';
import { upsertCostsCsv, getCostsForSupplierWeek, getCostsBaseline } from '@/lib/data/costs';
import { BulkCostModal } from '@/components/costs/BulkCostModal';
import { SupplierXlsxImporter } from '@/components/costs/SupplierXlsxImporter';
import * as xlsx from 'xlsx';
import { formatISO, startOfWeek } from 'date-fns';
import Link from 'next/link';

export default function SupplierDetailPage({ params }: { params: { id: string } }) {
    const [supplier, setSupplier] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [costsMap, setCostsMap] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [savingRow, setSavingRow] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showImporter, setShowImporter] = useState(false);
    const [baselineData, setBaselineData] = useState<any[]>([]);
    const [baselineWeek, setBaselineWeek] = useState<string | null>(null);

    const currentWeekInfo = formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), { representation: 'date' });
    const [selectedWeek, setSelectedWeek] = useState(currentWeekInfo);

    useEffect(() => {
        loadData();
    }, [params.id, selectedWeek]);

    const loadData = async () => {
        setLoading(true);
        setStatus('');
        try {
            const [suppData, prodData, costData] = await Promise.all([
                getSupplierById(params.id),
                getProductsBySupplier(params.id),
                getCostsForSupplierWeek(params.id, selectedWeek)
            ]);
            setSupplier(suppData);
            setProducts(prodData);

            const cm: Record<string, any> = {};
            for (const c of costData || []) {
                const formatNumber = (val: number | null | undefined, scale: number = 1) => {
                    if (val == null) return '';
                    return Number(val * scale).toFixed(2).replace(/\.00$/, '');
                };

                cm[c.product_id] = {
                    purchase_price: formatNumber(c.purchase_price),
                    cost_final_unit: formatNumber(c.cost_final_unit),
                    benefit_pct: formatNumber(c.benefit_pct, 100),
                    freight_pct: formatNumber(c.freight_pct, 100),
                    margin_list1_pct: formatNumber(c.margin_list1_pct, 100),
                    price_list1_net: formatNumber(c.price_list1_net),
                    notes: c.notes || ''
                };
            }
            setCostsMap(cm);
        } catch (err: any) {
            console.error(err);
            setStatus(`Error cargando datos: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleInlineChange = (productId: string, field: string, value: string) => {
        setCostsMap(prev => ({
            ...prev,
            [productId]: {
                ...(prev[productId] || { freight_pct: 0 }),
                [field]: value
            }
        }));
    };

    const handleInlineSave = async (productId: string) => {
        setSavingRow(productId);
        try {
            const row = costsMap[productId];
            if (!row) return;

            const parseNumber = (val: any) => {
                if (val === "" || val == null) return null;
                const parsed = parseFloat(String(val).replace(',', '.'));
                return isNaN(parsed) ? null : parsed;
            };

            const parsedPurchase = parseNumber(row.purchase_price);
            const parsedCost = parseNumber(row.cost_final_unit);

            if (parsedPurchase !== null && parsedPurchase < 0) throw new Error("Precio compra negativo");
            if (parsedCost !== null && parsedCost < 0) throw new Error("Costo negativo");

            // Pass the UUID productId, as the DB foreign key strictly expects a UUID
            const payload = [{
                supplier_id: supplier.id,
                product_id: productId,
                week_start_date: selectedWeek,
                purchase_price: parsedPurchase,
                cost_final_unit: parsedCost,
                benefit_pct: parseNumber(row.benefit_pct) !== null ? parseNumber(row.benefit_pct)! / 100 : null,
                freight_pct: parseNumber(row.freight_pct) !== null ? parseNumber(row.freight_pct)! / 100 : 0,
                margin_list1_pct: parseNumber(row.margin_list1_pct) !== null ? parseNumber(row.margin_list1_pct)! / 100 : null,
                price_list1_net: parseNumber(row.price_list1_net),
                notes: row.notes || ''
            }];

            await upsertCostsCsv(payload);
            setStatus('Fila actualizada exitosamente.');
            setTimeout(() => setStatus(''), 2000);
        } catch (err: any) {
            setStatus(`Error guardando fila: ${err.message}`);
        } finally {
            setSavingRow(null);
        }
    };

    const handleDownloadTemplate = () => {
        setStatus('Generando plantilla...');
        try {
            const templateData = products.map(prod => {
                const existing = costsMap[prod.id] || {};
                return {
                    'fecha_vigencia': selectedWeek,
                    'cod_proveedor': supplier.external_id,
                    'proveedor': supplier.name,
                    'sku': prod.external_id || prod.id,
                    'producto': prod.name,
                    'precio_compra': existing.purchase_price ?? '',
                    'flete_pct': existing.freight_pct !== undefined && existing.freight_pct !== '' ? existing.freight_pct : 0,
                    'beneficio_final_pct': existing.benefit_pct ?? '',
                    'costo_final': existing.cost_final_unit ?? '',
                    'margen_lista1_pct': existing.margin_list1_pct ?? '',
                    'precio_lista1_neto': existing.price_list1_net ?? '',
                    'observaciones': existing.notes ?? ''
                };
            });

            const worksheet = xlsx.utils.json_to_sheet(templateData);
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Costos');
            xlsx.writeFile(workbook, `Plantilla_Costos_${supplier.name.replace(/[^a-z0-9]/gi, '_')}_${selectedWeek}.xlsx`);
            setStatus('Plantilla descargada. Llénela y súbala aquí.');
        } catch (error: any) {
            setStatus(`Error generando plantilla: ${error.message}`);
        }
    };

    const openImporter = async () => {
        setImporting(true);
        setStatus('Calculando baseline de costos...');
        try {
            const { data, weekUsed } = await getCostsBaseline(supplier.id, selectedWeek);
            setBaselineData(data);
            setBaselineWeek(weekUsed);
            setShowImporter(true);
            setStatus('');
        } catch (err: any) {
            setStatus(`Error cargando baseline para importación: ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    if (loading && !supplier) return <div className="p-8">Cargando...</div>;
    if (!supplier) return <div className="p-8">Proveedor no encontrado</div>;

    const buildInput = (productId: string, field: string, placeholder: string = '') => {
        const val = costsMap[productId]?.[field] ?? '';
        return (
            <input
                type="text"
                value={val}
                onChange={(e) => handleInlineChange(productId, field, e.target.value)}
                placeholder={placeholder}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:border-primary focus:outline-none"
            />
        );
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <MobileHeader />
                <div className="p-8 max-w-[1400px] mx-auto">
                    <div className="mb-4">
                        <Link href="/suppliers" className="text-primary hover:underline font-medium text-sm">
                            &larr; Volver a Proveedores
                        </Link>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">{supplier.name}</h1>
                            <p className="text-slate-500 mt-1">Código: {supplier.external_id}</p>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex items-center gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Semana de Vigencia</label>
                                <input
                                    type="date"
                                    value={selectedWeek}
                                    onChange={(e) => setSelectedWeek(e.target.value)}
                                    className="border border-slate-200 rounded px-2 py-1 text-sm bg-slate-50 focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => setShowBulkModal(true)}
                                    className="bg-emerald-600 text-white rounded-md px-4 py-2 text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
                                >
                                    ⚡ Carga Masiva
                                </button>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800 transition-colors"
                                >
                                    ⬇️ Descargar Plantilla
                                </button>
                                <button
                                    onClick={openImporter}
                                    disabled={importing}
                                    className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-600 transition-colors text-center disabled:opacity-50"
                                >
                                    {importing ? '...' : '⬆️ Importar Excel (Maestro)'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {status && (
                        <div className={`mb-6 p-4 rounded-lg font-medium shadow-sm ${status.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                            {status}
                        </div>
                    )}

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-semibold text-slate-800">Costo Semanal / Productos ({products.length})</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left table-fixed min-w-[1000px]">
                                <thead className="bg-white border-b border-slate-100">
                                    <tr>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[15%]">SKU / Producto</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[12%]">Pr. Compra</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[12%]">Costo Final</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[10%]">Flete %</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[11%]">Beneficio %</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[11%]">Margen L1 %</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[12%]">Prec. L1 Net</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase w-[10%] text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loading ? (
                                        <tr><td colSpan={8} className="p-6 text-center text-slate-500">Cargando productos...</td></tr>
                                    ) : products.length === 0 ? (
                                        <tr><td colSpan={8} className="p-6 text-center text-slate-500">Este proveedor no tiene productos asignados.</td></tr>
                                    ) : (
                                        products.slice(0, 100).map((p) => (
                                            <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="p-3 align-top">
                                                    <div className="font-mono text-[10px] text-slate-400 leading-tight">{p.external_id || p.id}</div>
                                                    <div className="font-medium text-xs text-slate-800 truncate leading-tight" title={p.name}>{p.name}</div>
                                                </td>
                                                <td className="p-2 align-middle">{buildInput(p.id, 'purchase_price', '0.00')}</td>
                                                <td className="p-2 align-middle">{buildInput(p.id, 'cost_final_unit', '0.00')}</td>
                                                <td className="p-2 align-middle">{buildInput(p.id, 'freight_pct', '0')}</td>
                                                <td className="p-2 align-middle">{buildInput(p.id, 'benefit_pct', '')}</td>
                                                <td className="p-2 align-middle">{buildInput(p.id, 'margin_list1_pct', '')}</td>
                                                <td className="p-2 align-middle">{buildInput(p.id, 'price_list1_net', '')}</td>
                                                <td className="p-2 align-middle text-right">
                                                    <button
                                                        disabled={savingRow === p.id}
                                                        onClick={() => handleInlineSave(p.id)}
                                                        className="text-xs bg-primary text-white px-3 py-1.5 rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                                                    >
                                                        {savingRow === p.id ? '...' : 'Guardar'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                    {products.length > 100 && (
                                        <tr>
                                            <td colSpan={8} className="p-4 text-center text-xs text-slate-400 font-medium bg-slate-50/50">
                                                Mostrando los primeros 100 de {products.length} productos en la UI. Para cargar masivos, use la plantilla.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {showBulkModal && supplier && (
                <BulkCostModal
                    supplierId={supplier.id}
                    supplierName={supplier.name}
                    products={products}
                    selectedWeek={selectedWeek}
                    onClose={() => {
                        setShowBulkModal(false);
                        loadData();
                    }}
                />
            )}

            {showImporter && supplier && (
                <SupplierXlsxImporter
                    supplierId={supplier.id}
                    supplierName={supplier.name}
                    products={products}
                    selectedWeek={selectedWeek}
                    baselineCosts={baselineData}
                    baselineWeek={baselineWeek}
                    onClose={() => {
                        setShowImporter(false);
                        loadData();
                    }}
                />
            )}
        </div>
    );
}

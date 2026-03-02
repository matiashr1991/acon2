"use client";

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import { getCurrentPeriod } from '@/lib/data/periods';
import { getSalesSummary } from '@/lib/data/sales';
import { getCoverage } from '@/lib/data/coverage';

export default function Dashboard() {
    const [period, setPeriod] = useState<any>(null);
    const [metrics, setMetrics] = useState({ net: 0, qty: 0, bonific: 0 });
    const [coverage, setCoverage] = useState({ costPercent: 0, commPercent: 0, costCovered: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        setLoading(true);
        try {
            const currentPeriod = await getCurrentPeriod();
            if (currentPeriod) {
                setPeriod(currentPeriod);
                const { totalNet, totalQty, avgBonific } = await getSalesSummary(currentPeriod.id);
                const covData = await getCoverage(currentPeriod.id, currentPeriod.month_start);

                setMetrics({ net: totalNet, qty: totalQty, bonific: avgBonific });
                setCoverage({
                    costPercent: covData.costCoveragePct,
                    commPercent: covData.commissionCoveragePct,
                    costCovered: covData.salesWithCost
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <MobileHeader />
                <div className="p-8">
                    <div className="flex items-center justify-between mb-8">
                        <h1 className="text-3xl font-bold text-slate-900">Panel Overview</h1>
                        <div className="px-4 py-2 bg-white rounded-lg shadow-sm border border-slate-200 font-medium text-slate-700">
                            Período Actual: {period ? period.label : 'Ninguno'}
                        </div>
                    </div>

                    {loading ? (
                        <p className="text-slate-500">Cargando métricas...</p>
                    ) : !period ? (
                        <div className="p-8 bg-blue-50 border border-blue-100 rounded-xl text-center text-blue-700">
                            Aún no hay períodos importados. Diríjase a <span className="font-bold">Importar Ventas</span> para comenzar.
                        </div>
                    ) : (
                        <>
                            {/* KPIs */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <p className="text-sm text-slate-500 mb-1">Ventas Netas</p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        ${metrics.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <p className="text-sm text-slate-500 mb-1">Unidades (Cantidades)</p>
                                    <p className="text-2xl font-bold text-slate-900">{metrics.qty.toLocaleString()}</p>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <p className="text-sm text-slate-500 mb-1">Bonificación Media</p>
                                    <p className="text-2xl font-bold text-amber-600">
                                        {(metrics.bonific * 100).toFixed(2)}%
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <p className="text-sm text-slate-500 mb-1">Cobertura de Costos (Neto)</p>
                                    <p className={`text-2xl font-bold ${coverage.costPercent < 80 ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {coverage.costPercent.toFixed(1)}%
                                    </p>
                                </div>
                            </div>

                            {/* Status Section */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <h3 className="text-lg font-bold mb-4">Progreso Master Data</h3>
                                    <div className="flex justify-between text-sm mb-2 text-slate-600">
                                        <span>Ventas procesables para rentabilidad (con costo)</span>
                                        <span className="font-bold">${coverage.costCovered.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="bg-emerald-500 h-full"
                                            style={{ width: `${Math.min(coverage.costPercent, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-xl border border-slate-200 text-center flex flex-col items-center justify-center">
                                    <p className="text-slate-500">
                                        Las pantallas de <span className="font-semibold text-slate-700">Rentabilidad</span> y <span className="font-semibold text-slate-700">Análisis Comercial</span> dependen de los costos y reglas de comisión importados.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

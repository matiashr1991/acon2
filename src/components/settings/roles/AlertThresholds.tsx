import React from 'react';
import { BellRing } from 'lucide-react';

export function AlertThresholds() {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 lg:col-span-2">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600">
                    <BellRing className="w-6 h-6" />
                </div>
                <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Umbrales de Alerta
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Establezca disparadores automáticos para anomalías en márgenes y
                        bonificaciones.
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Alerta Margen Bajo
                        </label>
                        <span className="text-xs font-bold px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            Crítico
                        </span>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-slate-400 text-sm">&lt;</span>
                        </div>
                        <input
                            className="block w-full pl-8 pr-12 py-2.5 sm:text-sm border-slate-300 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary dark:bg-slate-800 dark:text-white"
                            placeholder="5"
                            type="number"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-slate-500 sm:text-sm">%</span>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Transacciones por debajo de este margen serán marcadas para revisión.
                    </p>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Alerta Bonif. Alta
                        </label>
                        <span className="text-xs font-bold px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            Advertencia
                        </span>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-slate-400 text-sm">&gt;</span>
                        </div>
                        <input
                            className="block w-full pl-8 pr-12 py-2.5 sm:text-sm border-slate-300 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary dark:bg-slate-800 dark:text-white"
                            placeholder="20"
                            type="number"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-slate-500 sm:text-sm">%</span>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Las bonificaciones que superen este porcentaje activarán una
                        notificación.
                    </p>
                </div>
            </div>
        </div>
    );
}

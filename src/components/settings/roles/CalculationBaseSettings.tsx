import React from 'react';
import { Banknote } from 'lucide-react';

export function CalculationBaseSettings() {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-emerald-600">
                    <Banknote className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Base de Cálculo
                </h2>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Seleccione la métrica utilizada para calcular las comisiones de ventas.
            </p>
            <div className="space-y-3">
                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="size-4 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center peer-checked:border-primary">
                            <div className="size-2 rounded-full bg-primary hidden"></div>
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Ventas Netas (Sin Impuestos)
                        </span>
                    </div>
                    <input
                        defaultChecked
                        className="text-primary focus:ring-primary border-slate-300"
                        name="commission_base"
                        type="radio"
                    />
                </label>
                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="size-4 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center"></div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Ventas Brutas
                        </span>
                    </div>
                    <input
                        className="text-primary focus:ring-primary border-slate-300"
                        name="commission_base"
                        type="radio"
                    />
                </label>
            </div>
        </div>
    );
}

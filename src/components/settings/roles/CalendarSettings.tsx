import React from 'react';
import { CalendarDays } from 'lucide-react';

export function CalendarSettings() {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-primary">
                    <CalendarDays className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Definición de Calendario
                </h2>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Defina cómo los informes semanales agregan datos en la plataforma.
            </p>
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg relative">
                <label className="flex-1 cursor-pointer">
                    <input
                        defaultChecked
                        className="peer sr-only"
                        name="calendar_start"
                        type="radio"
                    />
                    <div className="w-full text-center py-2 text-sm font-medium rounded-md text-slate-500 dark:text-slate-400 peer-checked:bg-white dark:peer-checked:bg-slate-700 peer-checked:text-primary peer-checked:shadow-sm transition-all">
                        Estándar ISO (Dom)
                    </div>
                </label>
                <label className="flex-1 cursor-pointer">
                    <input className="peer sr-only" name="calendar_start" type="radio" />
                    <div className="w-full text-center py-2 text-sm font-medium rounded-md text-slate-500 dark:text-slate-400 peer-checked:bg-white dark:peer-checked:bg-slate-700 peer-checked:text-primary peer-checked:shadow-sm transition-all">
                        Inicio Lunes
                    </div>
                </label>
            </div>
        </div>
    );
}

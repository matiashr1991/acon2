import React from 'react';
import { Save } from 'lucide-react';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import { CalendarSettings } from '@/components/settings/roles/CalendarSettings';
import { CalculationBaseSettings } from '@/components/settings/roles/CalculationBaseSettings';
import { AlertThresholds } from '@/components/settings/roles/AlertThresholds';
import { UserManagement } from '@/components/settings/roles/UserManagement';

export default function SettingsAndRolesPage() {
    return (
        <>
            <Sidebar />
            <main className="flex-1 flex flex-col h-screen overflow-y-auto">
                <MobileHeader />

                <div className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 pb-24">
                    <div className="mb-8">
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                            Configuración del Sistema y Roles
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-lg">
                            Configure los parámetros globales y gestione los permisos de
                            acceso de los usuarios.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <CalendarSettings />
                        <CalculationBaseSettings />
                        <AlertThresholds />
                    </div>

                    <UserManagement />
                </div>
            </main>

            <div className="fixed bottom-8 right-8 z-30">
                <button className="group flex items-center gap-2 bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 rounded-full px-6 py-4 transition-all hover:scale-105 active:scale-95">
                    <Save className="w-5 h-5" />
                    <span className="font-bold text-sm">Guardar Configuración</span>
                </button>
            </div>
        </>
    );
}

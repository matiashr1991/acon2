import React from 'react';
import { Plus, MoreVertical } from 'lucide-react';

export function UserManagement() {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Gestión de Usuarios
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Gestione el control de acceso basado en roles.
                    </p>
                </div>
                <button className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors">
                    <Plus className="w-5 h-5" />
                    Agregar Usuario
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Usuario
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Rol
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Estado
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                                Último Acceso
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                        JD
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                            John Doe
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            john.doe@chesserp.com
                                        </p>
                                    </div>
                                </div>
                            </td>
                            <td className="py-4 px-6">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                                    Admin
                                </span>
                            </td>
                            <td className="py-4 px-6">
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    Activo
                                </span>
                            </td>
                            <td className="py-4 px-6 text-right text-sm text-slate-500 dark:text-slate-400">
                                Ahora mismo
                            </td>
                            <td className="py-4 px-6 text-right">
                                <button className="text-slate-400 hover:text-primary transition-colors">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </td>
                        </tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 flex items-center justify-center font-bold text-sm">
                                        AS
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                            Alice Smith
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            alice.s@chesserp.com
                                        </p>
                                    </div>
                                </div>
                            </td>
                            <td className="py-4 px-6">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                    Gerencia
                                </span>
                            </td>
                            <td className="py-4 px-6">
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    Activo
                                </span>
                            </td>
                            <td className="py-4 px-6 text-right text-sm text-slate-500 dark:text-slate-400">
                                Hace 2 horas
                            </td>
                            <td className="py-4 px-6 text-right">
                                <button className="text-slate-400 hover:text-primary transition-colors">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </td>
                        </tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                    <img
                                        className="size-9 rounded-full object-cover"
                                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZet1xS0-gSUSnhWjX4SJ2u-0mE6Mhb__W0h4Zpxq26pJYczUAz-Z-dyidBEnqeReQIn9CcDeDrkDO_5TxapCyMGZk3skKLRA62zx76zcO-qQRFIbP70mGxrLFlstbSrk-Er1JqqNRb6yOnMtJXDFK8wv7GXAFJcC5cvsXaZYAP9NOEtnM9xd_HUwqXBjC6_2CW07ALEH73Ebewe89RdnDBxVERE81XBQbKBV5jyrvNuJ84dd1oO9vVMkhwmxnX066YNoF-B7-Qg"
                                        alt="Robert Fox"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                            Robert Fox
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            r.fox@chesserp.com
                                        </p>
                                    </div>
                                </div>
                            </td>
                            <td className="py-4 px-6">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                    Comercial
                                </span>
                            </td>
                            <td className="py-4 px-6">
                                <span className="text-xs font-medium text-slate-400">
                                    Offline
                                </span>
                            </td>
                            <td className="py-4 px-6 text-right text-sm text-slate-500 dark:text-slate-400">
                                Ayer
                            </td>
                            <td className="py-4 px-6 text-right">
                                <button className="text-slate-400 hover:text-primary transition-colors">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </td>
                        </tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-full bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400 flex items-center justify-center font-bold text-sm">
                                        EL
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                            Eleanor Light
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            e.light@chesserp.com
                                        </p>
                                    </div>
                                </div>
                            </td>
                            <td className="py-4 px-6">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                                    Compras
                                </span>
                            </td>
                            <td className="py-4 px-6">
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    Activo
                                </span>
                            </td>
                            <td className="py-4 px-6 text-right text-sm text-slate-500 dark:text-slate-400">
                                Hace 3 días
                            </td>
                            <td className="py-4 px-6 text-right">
                                <button className="text-slate-400 hover:text-primary transition-colors">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-center">
                <button className="text-sm text-primary font-medium hover:underline">
                    Ver Todos los Usuarios
                </button>
            </div>
        </div>
    );
}

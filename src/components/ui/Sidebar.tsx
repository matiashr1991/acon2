'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    PieChart, BarChart3, DollarSign, Upload, Settings,
    Briefcase, FileSpreadsheet, TrendingUp, LogOut, Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { NAV_ITEMS, type Role } from '@/lib/auth/roles';

const ICON_MAP: Record<string, React.ElementType> = {
    PieChart, BarChart3, TrendingUp, DollarSign,
    Upload, Briefcase, FileSpreadsheet, Settings,
};

const ROLE_LABELS: Record<Role, string> = {
    admin: 'Administrador',
    importador: 'Importador',
    gerencia: 'Gerencia',
};

export function Sidebar() {
    const pathname = usePathname();
    const { user, loading, signOut } = useAuth();

    const visibleItems = NAV_ITEMS.filter(item =>
        !user?.role || item.roles.includes(user.role)
    );

    const initials = user?.fullName
        ? user.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : (user?.email?.[0]?.toUpperCase() ?? '?');

    return (
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 lg:flex sticky top-0 h-screen overflow-y-auto">
            <div className="flex h-full flex-col justify-between p-4">
                <div className="flex flex-col gap-4">
                    {/* Logo */}
                    <div className="flex gap-3 items-center mb-6">
                        <div className="bg-primary/10 rounded-xl p-2 shrink-0">
                            <TrendingUp className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-slate-900 dark:text-white text-base font-bold leading-normal">
                                SalesProfit
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 text-xs font-normal leading-normal">
                                Chess ERP Analytics
                            </p>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="flex flex-col gap-1">
                        {visibleItems.map(item => {
                            const Icon = ICON_MAP[item.icon] ?? PieChart;
                            const isSettings = item.href === '/settings/roles';
                            const isActive = pathname === item.href ||
                                (item.href !== '/' && pathname.startsWith(item.href));

                            if (isSettings) {
                                return (
                                    <React.Fragment key={item.href}>
                                        <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
                                        <NavLink href={item.href} label={item.label} Icon={Icon} isActive={isActive} />
                                    </React.Fragment>
                                );
                            }
                            return (
                                <NavLink key={item.href} href={item.href} label={item.label} Icon={Icon} isActive={isActive} />
                            );
                        })}
                    </nav>
                </div>

                {/* User footer */}
                <div className="flex items-center gap-3 px-3 py-4 mt-auto border-t border-slate-200 dark:border-slate-800">
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
                    ) : (
                        <>
                            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {initials}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <p className="text-slate-900 dark:text-white text-sm font-medium truncate">
                                    {user?.fullName ?? user?.email ?? '—'}
                                </p>
                                <p className="text-slate-500 dark:text-slate-400 text-xs">
                                    {user?.role ? ROLE_LABELS[user.role] : '—'}
                                </p>
                            </div>
                            <button
                                onClick={signOut}
                                title="Cerrar sesión"
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}

function NavLink({
    href, label, Icon, isActive,
}: {
    href: string;
    label: string;
    Icon: React.ElementType;
    isActive: boolean;
}) {
    return (
        <Link
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group
                ${isActive
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
        >
            <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-primary' : 'text-slate-500 group-hover:text-primary'}`} />
            <span className="text-sm font-medium">{label}</span>
        </Link>
    );
}

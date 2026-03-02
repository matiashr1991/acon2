// Roles, permissions, and route guards — single source of truth for RBAC

export type Role = 'admin' | 'importador' | 'gerencia';

export const ROLES: Role[] = ['admin', 'importador', 'gerencia'];

/** What actions each role can perform */
export const PERMISSIONS: Record<Role, string[]> = {
    admin: [
        'view:dashboard',
        'view:rentabilidad', 'export:rentabilidad',
        'view:costs', 'edit:costs',
        'view:suppliers', 'edit:suppliers',
        'view:imports', 'run:imports',
        'view:commissions', 'edit:commissions',
        'view:settings', 'manage:users',
    ],
    importador: [
        'view:dashboard',
        'view:rentabilidad', 'export:rentabilidad',
        'view:costs',
        'view:suppliers',
        'view:imports', 'run:imports',
    ],
    gerencia: [
        'view:dashboard',
        'view:rentabilidad', 'export:rentabilidad',
        'view:costs', 'edit:costs',
        'view:suppliers', 'edit:suppliers',
        'view:commissions', 'edit:commissions',
    ],
};

export function can(role: Role | null | undefined, action: string): boolean {
    if (!role) return false;
    return PERMISSIONS[role]?.includes(action) ?? false;
}

/** Routes that require specific roles (checked in middleware) */
export const ROUTE_ROLES: { pattern: RegExp; roles: Role[] }[] = [
    { pattern: /^\/imports/, roles: ['admin', 'importador'] },
    { pattern: /^\/settings/, roles: ['admin'] },
    { pattern: /^\/sellers/, roles: ['admin', 'gerencia'] },
    // all other routes: any authenticated user
];

/** Sidebar nav items with role gating */
export const NAV_ITEMS = [
    { href: '/', label: 'Panel de Control', icon: 'PieChart', roles: ['admin', 'importador', 'gerencia'] as Role[] },
    { href: '/rentabilidad', label: 'Rentabilidad', icon: 'TrendingUp', roles: ['admin', 'importador', 'gerencia'] as Role[] },
    { href: '/imports/sales', label: 'Importar Ventas', icon: 'Upload', roles: ['admin', 'importador'] as Role[] },
    { href: '/suppliers', label: 'Proveedores', icon: 'Briefcase', roles: ['admin', 'importador', 'gerencia'] as Role[] },
    { href: '/sellers', label: 'Vendedores', icon: 'Users', roles: ['admin', 'gerencia'] as Role[] },
    { href: '/imports/suppliers', label: 'Importar Proveedores', icon: 'FileSpreadsheet', roles: ['admin', 'importador'] as Role[] },
    { href: '/settings/roles', label: 'Configuración', icon: 'Settings', roles: ['admin'] as Role[] },
] as const;

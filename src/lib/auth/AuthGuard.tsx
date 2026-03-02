'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ROUTE_ROLES } from '@/lib/auth/roles';

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (loading) return;

        // Si no está logueado y no está en /login, redirigir
        if (!user && pathname !== '/login') {
            router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
        }

        // Si está logueado, verificar roles para rutas específicas
        if (user && pathname !== '/login' && pathname !== '/unauthorized') {
            const routeRule = ROUTE_ROLES.find(r => r.pattern.test(pathname));
            if (routeRule && (!user.role || !routeRule.roles.includes(user.role))) {
                router.push('/unauthorized');
            }
        }
    }, [user, loading, pathname, router]);

    // Mientras carga la sesión de Supabase
    if (loading) {
        return (
            <div className="min-h-screen flex w-full items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );
    }

    // Si no está logueado y no es la página de login, no renderizar nada (esperando redirect)
    if (!user && pathname !== '/login') {
        return null;
    }

    // Si la ruta no está permitida, tampoco renderizamos nada mientras redirige a /unauthorized
    if (user && pathname !== '/login' && pathname !== '/unauthorized') {
        const routeRule = ROUTE_ROLES.find(r => r.pattern.test(pathname));
        if (routeRule && (!user.role || !routeRule.roles.includes(user.role))) {
            return null;
        }
    }

    return <>{children}</>;
}

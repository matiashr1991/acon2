'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Role } from '@/lib/auth/roles';

interface AuthUser {
    id: string;
    email: string | undefined;
    fullName: string | null;
    role: Role | null;
    companyId: string | null;
}

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    async function loadProfile(userId: string, email: string | undefined) {
        console.log('[AuthContext] loadProfile START', { userId, email });
        // Reads own profile via "user reads own profile" policy — no service_role needed
        const { data, error } = await supabase
            .from('profiles')
            .select('role, full_name, company_id')
            .eq('id', userId)
            .single();

        console.log('[AuthContext] loadProfile END', { data, error });

        setUser({
            id: userId,
            email,
            fullName: data?.full_name ?? null,
            role: (data?.role as Role) ?? null,
            companyId: data?.company_id ?? null,
        });
    }

    useEffect(() => {
        // Initial session check
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            console.log('[AuthContext] getSession result', { session });
            if (session?.user) {
                try {
                    await loadProfile(session.user.id, session.user.email);
                } catch (err) {
                    console.error('[AuthContext] loadProfile failed on initial session check:', err);
                }
            }
            console.log('[AuthContext] getSession setting loading false');
            setLoading(false);
        }).catch(err => {
            console.error('[AuthContext] getSession failed:', err);
            setLoading(false);
        });

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[AuthContext] onAuthStateChange event', event, { session });
                if (session?.user) {
                    try {
                        await loadProfile(session.user.id, session.user.email);
                    } catch (err) {
                        console.error('[AuthContext] loadProfile failed on auth state change:', err);
                    }
                } else {
                    setUser(null);
                }
                console.log('[AuthContext] onAuthStateChange setting loading false');
                setLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

/** Convenience hook: returns true if user has the given permission */
export function useCan(action: string): boolean {
    const { user } = useAuth();
    if (!user?.role) return false;
    const { PERMISSIONS } = require('@/lib/auth/roles');
    return PERMISSIONS[user.role]?.includes(action) ?? false;
}

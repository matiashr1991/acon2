'use client';

import React, { Suspense, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { TrendingUp, LogIn, Loader2 } from 'lucide-react';

// Inner component uses useSearchParams — must be wrapped in Suspense
function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const params = useSearchParams();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }
        const redirect = params.get('redirect') || '/';
        router.push(redirect);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Correo</label>
                <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="usuario@empresa.com"
                />
            </div>
            <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Contraseña</label>
                <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="••••••••"
                />
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
                {/* Logo */}
                <div className="flex items-center gap-2 mb-8">
                    <div className="bg-primary/10 rounded-xl p-2">
                        <TrendingUp className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-slate-900 font-bold text-base leading-none">SalesProfit</h1>
                        <p className="text-slate-500 text-xs">Chess ERP Analytics</p>
                    </div>
                </div>

                <h2 className="text-xl font-bold text-slate-900 mb-1">Iniciar sesión</h2>
                <p className="text-slate-500 text-sm mb-6">Ingresá tu correo y contraseña</p>

                <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />}>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    );
}

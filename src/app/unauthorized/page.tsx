'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

export default function UnauthorizedPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center max-w-sm">
                <div className="bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <ShieldOff className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">Sin acceso</h1>
                <p className="text-slate-500 text-sm mb-6">
                    Tu rol no tiene permiso para ver esta página.
                    Contactá al administrador si creés que es un error.
                </p>
                <Link href="/" className="text-sm font-semibold text-primary hover:underline">
                    ← Volver al inicio
                </Link>
            </div>
        </div>
    );
}

"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Sidebar } from '@/components/ui/Sidebar';
import { MobileHeader } from '@/components/ui/MobileHeader';
import { listSuppliers } from '@/lib/data/master';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

function SuppliersList() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    const qParam = searchParams.get('q') || '';
    const pageParam = parseInt(searchParams.get('page') || '1', 10);

    const [searchInput, setSearchInput] = useState(qParam);

    const PAGE_SIZE = 50;

    const loadData = useCallback(async (search: string, page: number) => {
        setLoading(true);
        try {
            const offset = (page - 1) * PAGE_SIZE;
            const res = await listSuppliers({ search, limit: PAGE_SIZE, offset });
            setSuppliers(res.data);
            setTotalCount(res.count);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData(qParam, pageParam);
        setSearchInput(qParam);
    }, [qParam, pageParam, loadData]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchInput !== qParam) {
                const params = new URLSearchParams(searchParams);
                if (searchInput) {
                    params.set('q', searchInput);
                } else {
                    params.delete('q');
                }
                params.set('page', '1');
                router.replace(`${pathname}?${params.toString()}`);
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [searchInput, qParam, pathname, router, searchParams]);

    const handleClear = () => {
        setSearchInput('');
        const params = new URLSearchParams(searchParams);
        params.delete('q');
        params.set('page', '1');
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchInput !== qParam) {
            const params = new URLSearchParams(searchParams);
            if (searchInput) params.set('q', searchInput);
            else params.delete('q');
            params.set('page', '1');
            router.replace(`${pathname}?${params.toString()}`);
        }
    };

    return (
        <div className="flex h-screen w-full overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <MobileHeader />
                <div className="p-8">
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="text-3xl font-bold text-slate-900">Proveedores</h1>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Toolbar */}
                        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 justify-between items-center bg-slate-50">
                            <div className="relative w-full max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Buscar por código o nombre (ej: 105 o ALGABO)"
                                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-shadow"
                                />
                                {searchInput && (
                                    <button
                                        onClick={handleClear}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                            <div className="text-sm font-medium text-slate-500">
                                Mostrando {suppliers.length} de {totalCount}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Código</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Nombre</th>
                                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr><td colSpan={3} className="p-4 text-center text-slate-500">Cargando...</td></tr>
                                    ) : suppliers.length === 0 ? (
                                        <tr><td colSpan={3} className="p-4 text-center text-slate-500">No hay proveedores registrados.</td></tr>
                                    ) : (
                                        suppliers.map((s) => (
                                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 font-mono text-sm text-slate-500">{s.external_id}</td>
                                                <td className="p-4 font-medium text-slate-900">{s.name}</td>
                                                <td className="p-4 text-right">
                                                    <Link
                                                        href={`/suppliers/${s.id}`}
                                                        className="text-primary hover:text-blue-700 font-medium text-sm bg-blue-50 px-3 py-1.5 rounded-md transition-colors"
                                                    >
                                                        Gestionar Costos
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        {totalCount > PAGE_SIZE && (
                            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                                <div className="text-xs font-medium text-slate-500">
                                    Página {pageParam} de {Math.ceil(totalCount / PAGE_SIZE)}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const params = new URLSearchParams(searchParams);
                                            params.set('page', String(pageParam - 1));
                                            router.push(`${pathname}?${params.toString()}`);
                                        }}
                                        disabled={pageParam <= 1 || loading}
                                        className="px-3 py-1.5 flex items-center gap-1 text-sm bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors shadow-sm"
                                    >
                                        <ChevronLeft className="w-4 h-4" /> Anterior
                                    </button>
                                    <button
                                        onClick={() => {
                                            const params = new URLSearchParams(searchParams);
                                            params.set('page', String(pageParam + 1));
                                            router.push(`${pathname}?${params.toString()}`);
                                        }}
                                        disabled={pageParam >= Math.ceil(totalCount / PAGE_SIZE) || loading}
                                        className="px-3 py-1.5 flex items-center gap-1 text-sm bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors shadow-sm"
                                    >
                                        Siguiente <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function SuppliersPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen overflow-hidden bg-slate-50 items-center justify-center">
                <div className="text-slate-500 font-medium">Cargando...</div>
            </div>
        }>
            <SuppliersList />
        </Suspense>
    );
}

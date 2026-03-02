import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { AuthGuard } from '@/lib/auth/AuthGuard';

export const metadata: Metadata = {
    title: 'Configuración del Sistema - Chess ERP Analytics',
    description: 'Sistema administrativo y configuraciones de Chess ERP Analytics',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <AuthProvider>
                    <AuthGuard>
                        <div className="relative flex min-h-screen w-full flex-row overflow-x-hidden">
                            {children}
                        </div>
                    </AuthGuard>
                </AuthProvider>
            </body>
        </html>
    );
}



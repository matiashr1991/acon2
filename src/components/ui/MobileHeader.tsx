import React from 'react';
import { Menu } from 'lucide-react';

export function MobileHeader() {
    return (
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 px-6 py-4 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-3">
                <div
                    className="bg-center bg-no-repeat bg-cover rounded-full size-8"
                    style={{
                        backgroundImage:
                            'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDfCft-HULysqWvrhBmXRUvmAM4LQc7qLVtf5kJ6zXG--Ke6F1tItzlbGikoYvFrvt3HSHswhYs9SfoXcQoqN8mZJhEF2gqGmiGYP8m_qtgcmHWz0682UMbMPknRYmcbwcxkytpA2JEcxlp3R4iJRNegjXF9dHxvVTNuF8UlMs0xqQ8QAu-9xFyShzhMWMp_I_A8QnwabSU09Tuqrfeh2YH-HNrsSa8tieFlavU9eY3fx8TRV9gkrYqGwQkTVWEcUIaBm251pRSPQ")',
                    }}
                ></div>
                <span className="font-bold text-slate-900 dark:text-white">
                    SalesProfit
                </span>
            </div>
            <button className="text-slate-500">
                <Menu className="w-6 h-6" />
            </button>
        </header>
    );
}

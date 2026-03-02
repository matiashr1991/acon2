import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertCostsCsv } from '@/lib/data/costs';
import { logImportJob } from '@/lib/data/master';
import { DEFAULT_COMPANY_ID } from '@/lib/data/constants';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        const body = await req.json();
        const { rows, week_start_date, mode, isFinalChunk, stats, errorDetails } = body;

        if (!rows || !Array.isArray(rows)) {
            return NextResponse.json({ error: 'Missing rows array' }, { status: 400 });
        }
        if (!week_start_date) {
            return NextResponse.json({ error: 'Missing week_start_date' }, { status: 400 });
        }

        // Apply upsert based on mode
        // mode: 'only_changes' (default via UI filter), 'only_missing', 'overwrite'
        // If mode === 'only_missing', the frontend shouldn't send rows that already exist and haven't changed, 
        // or we need to filter them out based on the baseline sent. We rely on the frontend 
        // passing strictly what needs to be saved. The UI filter handles the business logic of `only_differences`.
        // So here we assume whatever we get, we upsert.

        if (rows.length > 0) {
            // Batch size 1000
            const BATCH_SIZE = 1000;
            const payload = rows.map((r: any) => {
                const supplierIdToUse = r.dbSupplierId || r.supplierId;
                if (!supplierIdToUse) {
                    throw new Error(`Falta el identificador del proveedor para el producto ${r.productId || r.sku}`);
                }
                return {
                    supplier_id: supplierIdToUse,
                    product_id: r.productId,
                    week_start_date: week_start_date,
                    purchase_price: r.purchase,
                    cost_final_unit: r.cost,
                    margin_list1_pct: r.margen,
                    price_list1_net: r.calcList1,
                    freight_pct: 0,
                    benefit_pct: r.benefit,
                    notes: `Massive Import`
                };
            });

            for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                await upsertCostsCsv(payload.slice(i, i + BATCH_SIZE), supabase);
            }
        }

        // If this is the final chunk, log the global job
        if (isFinalChunk && stats) {
            await logImportJob({
                company_id: DEFAULT_COMPANY_ID,
                job_type: 'massive_xlsx_master',
                week_start_date: week_start_date,
                status: Object.keys(errorDetails || {}).length > 0 ? 'completed_with_errors' : 'completed',
                stats: stats,
                error_details: errorDetails
            }, supabase);
        }

        return NextResponse.json({ success: true, savedCount: rows.length });

    } catch (err: any) {
        console.error("Massive Commit error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

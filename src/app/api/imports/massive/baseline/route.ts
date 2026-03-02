import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_COMPANY_ID } from '@/lib/data/constants';

// Limit max execution
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
        const { product_ids, week_start_date } = body;

        if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
            return NextResponse.json({ error: 'Missing product_ids array' }, { status: 400 });
        }
        if (!week_start_date) {
            return NextResponse.json({ error: 'Missing week_start_date' }, { status: 400 });
        }

        const baselineMap: Record<string, any> = {};

        // 1. Fetch exact week costs for all these products
        // Supabase `select().in()` generates a GET query string. To avoid 
        // Header/URL Overflow errors, chunk sizes must be small (e.g. 100)
        const BATCH_SIZE = 100;
        const missingProductsFromTargetWeek = new Set<string>(product_ids);

        for (let i = 0; i < product_ids.length; i += BATCH_SIZE) {
            const batch = product_ids.slice(i, i + BATCH_SIZE);
            const { data, error } = await supabase
                .from('product_cost_week')
                .select('*')
                .eq('company_id', DEFAULT_COMPANY_ID)
                .eq('week_start_date', week_start_date)
                .in('product_id', batch);

            if (error) throw error;
            if (data) {
                data.forEach(cost => {
                    baselineMap[cost.product_id] = { ...cost, baseline_week: week_start_date };
                    missingProductsFromTargetWeek.delete(cost.product_id);
                });
            }
        }

        // 2. For products that didn't have costs in the target week, find their latest previous week cost
        if (missingProductsFromTargetWeek.size > 0) {
            const missingArr = Array.from(missingProductsFromTargetWeek);

            for (let i = 0; i < missingArr.length; i += BATCH_SIZE) {
                const batch = missingArr.slice(i, i + BATCH_SIZE);

                // Supabase doesn't easily let us say "latest per product_id" in a simple IN query.
                // But we can use a serverless function approach, or a view, or do multiple queries.
                // Since it's a batch importer, the cleanest way without a custom SQL function (RPC)
                // might be an RPC. Let's see if we can just get the immediate past costs for them by sorting.
                // A simpler, slightly heavier approach: fetch ALL past costs for these SKUs, then group in memory.
                // If the dataset is huge, this is bad. 
                // Alternatively, find the max week BEFORE the target week that has ANY of these products, 
                // though they might have different prev weeks.
                // The most robust way is to just fetch the latest for each, but we can't `DISTINCT ON` easily via current JS client unless we use `RPC` or custom.
                // Let's just fetch all costs < week_start_date for these products, ordered by week DESC, and take the first we see per product.

                const { data, error } = await supabase
                    .from('product_cost_week')
                    .select('*')
                    .eq('company_id', DEFAULT_COMPANY_ID)
                    .lt('week_start_date', week_start_date)
                    .in('product_id', batch)
                    .order('week_start_date', { ascending: false });

                if (error) throw error;

                if (data) {
                    data.forEach(cost => {
                        // Only set if we haven't seen one yet (since ordered DESC, the first we see is the latest)
                        if (!baselineMap[cost.product_id]) {
                            baselineMap[cost.product_id] = { ...cost, baseline_week: cost.week_start_date };
                        }
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            baselineMap
        });

    } catch (err: any) {
        console.error("Baseline fetch error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

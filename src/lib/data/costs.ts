import { supabase } from '../supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COMPANY_ID } from './constants';
import { formatISO, subWeeks, startOfWeek } from 'date-fns';

export async function getCostsForPeriod(weekStartDate: string) {
    const { data, error } = await supabase
        .from('product_cost_week')
        .select(`
      *,
      supplier:supplier_id (id, name, external_id),
      product:product_id (id, name, external_id)
    `)
        .eq('company_id', DEFAULT_COMPANY_ID)
        .lte('week_start_date', weekStartDate)
        .order('week_start_date', { ascending: false });

    if (error) throw error;
    // Resolve unique per product (as-of latest week)
    const uniqueCosts = new Map();
    for (const row of data || []) {
        if (!uniqueCosts.has(row.product_id)) {
            uniqueCosts.set(row.product_id, row);
        }
    }
    return Array.from(uniqueCosts.values());
}

export async function getCostHistoryBySku(productId: string) {
    const { data, error } = await supabase
        .from('product_cost_week')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('product_id', productId)
        .order('week_start_date', { ascending: false });

    if (error) throw error;
    return data;
}

export async function getCostsForSupplierWeek(supplierId: string, weekStartDate: string) {
    const { data, error } = await supabase
        .from('product_cost_week')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('supplier_id', supplierId)
        .eq('week_start_date', weekStartDate);

    if (error) throw error;
    return data || [];
}

export async function getCostsBaseline(
    supplierId: string,
    targetWeek: string,
    supabaseClient: SupabaseClient = supabase
): Promise<{ data: any[], weekUsed: string | null }> {
    // 1. Try to get costs for the target week
    let { data, error } = await supabaseClient
        .from('product_cost_week')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('supplier_id', supplierId)
        .eq('week_start_date', targetWeek);

    if (error) throw error;

    if (data && data.length > 0) {
        return { data, weekUsed: targetWeek };
    }

    // 2. If no costs, get the immediately preceding week's costs to use as baseline
    const { data: prevData, error: prevError } = await supabaseClient
        .from('product_cost_week')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('supplier_id', supplierId)
        .lt('week_start_date', targetWeek)
        .order('week_start_date', { ascending: false })
        .limit(1); // We only want the most recent previous week, but we need all rows for that week, so this approach requires 2 queries

    if (prevError) throw prevError;

    if (!prevData || prevData.length === 0) {
        return { data: [], weekUsed: null };
    }

    const prevWeek = prevData[0].week_start_date;

    const { data: baselineData, error: baselineError } = await supabaseClient
        .from('product_cost_week')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('supplier_id', supplierId)
        .eq('week_start_date', prevWeek);

    if (baselineError) throw baselineError;

    return { data: baselineData || [], weekUsed: prevWeek };
}

export async function upsertCostsCsv(
    rows: Array<{
        supplier_id: string;
        product_id: string;
        week_start_date: string;
        purchase_price?: number | null;
        cost_final_unit?: number | null;
        benefit_pct?: number | null;
        freight_pct?: number | null;
        margin_list1_pct?: number | null;
        price_list1_net?: number | null;
        notes?: string;
    }>,
    supabaseClient: SupabaseClient = supabase
) {
    const payload = rows.map((r) => ({ ...r, company_id: DEFAULT_COMPANY_ID }));

    const { data, error } = await supabaseClient
        .from('product_cost_week')
        .upsert(payload, { onConflict: 'company_id,product_id,week_start_date' })
        .select();

    if (error) throw error;
    return data;
}

// ─── Supplier cost defaults (per supplier + week) ─────────────────────────

export async function getSupplierDefaults(supplierId: string, weekStartDate: string) {
    const { data, error } = await supabase
        .from('supplier_cost_week_defaults')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('supplier_id', supplierId)
        .eq('week_start_date', weekStartDate)
        .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no row, that's ok
    return data ?? null;
}

export async function upsertSupplierDefaults(
    supplierId: string,
    weekStartDate: string,
    flete_pct: number,
    margen_lista1_pct: number | null
) {
    const { data, error } = await supabase
        .from('supplier_cost_week_defaults')
        .upsert(
            {
                company_id: DEFAULT_COMPANY_ID,
                supplier_id: supplierId,
                week_start_date: weekStartDate,
                flete_pct,
                margen_lista1_pct,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'company_id,supplier_id,week_start_date' }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
}

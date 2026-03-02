import { supabase } from '../supabase/client';
import { DEFAULT_COMPANY_ID } from './constants';

export async function getCoverage(periodId: string, weekStartDate: string) {
    // Since we don't have a view right now, we do a client-side join approximation for MVP
    // Get all sales for the period
    const { data: sales, error: salesError } = await supabase
        .from('fact_sales_month')
        .select('product_id, amount_net')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('period_id', periodId);

    if (salesError) throw salesError;

    // Get active costs
    const { data: costs, error: costError } = await supabase
        .from('product_cost_week')
        .select('product_id')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .lte('week_start_date', weekStartDate)
        .order('week_start_date', { ascending: false });

    if (costError) throw costError;

    const costProducts = new Set(costs?.map(c => c.product_id));

    let totalSales = 0;
    let salesWithCost = 0;

    for (const s of sales || []) {
        const amt = Number(s.amount_net) || 0;
        totalSales += amt;
        if (costProducts.has(s.product_id)) {
            salesWithCost += amt;
        }
    }

    const costCoveragePct = totalSales > 0 ? (salesWithCost / totalSales) * 100 : 0;

    return {
        costCoveragePct,
        commissionCoveragePct: 100, // Rules can cover all by default, or implement similarly
        salesWithCost,
        totalSales
    };
}

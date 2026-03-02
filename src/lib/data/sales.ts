import { supabase } from '../supabase/client';
import { DEFAULT_COMPANY_ID } from './constants';

export async function getSalesSummary(periodId: string) {
    const { data, error } = await supabase
        .from('fact_sales_month')
        .select(`
      amount_net,
      qty_total,
      bonific
    `)
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('period_id', periodId);

    if (error) throw error;

    let totalNet = 0;
    let totalQty = 0;
    let totalBonific = 0;

    for (const row of data || []) {
        totalNet += Number(row.amount_net) || 0;
        totalQty += Number(row.qty_total) || 0;
        totalBonific += (Number(row.bonific) || 0) * (Number(row.amount_net) || 0); // we will weighted avg it later
    }

    const avgBonific = totalNet > 0 ? totalBonific / totalNet : 0;

    return { totalNet, totalQty, avgBonific };
}

export async function importSalesXlsx(periodId: string, records: any[]) {
    // Batch inserts if too large
    const batchSize = 1000;
    for (let i = 0; i < records.length; i += batchSize) {
        const chunk = records.slice(i, i + batchSize).map(r => ({ ...r, company_id: DEFAULT_COMPANY_ID, period_id: periodId }));
        const { error } = await supabase.from('fact_sales_month').insert(chunk);
        if (error) throw error;
    }
}

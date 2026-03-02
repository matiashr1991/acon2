import { supabase } from '../supabase/client';
import { DEFAULT_COMPANY_ID } from './constants';

export interface ProfitFilters {
    period_id: string;
    week_date: string;
    group_by: 'supplier' | 'seller' | 'sku' | 'customer';
    supplier_ids?: string[];
    seller_ids?: string[];
    customer_ids?: string[];
    sku_search?: string;
    solo_con_costo?: boolean;
    solo_sin_costo?: boolean;
    solo_margen_neg?: boolean;
}

export interface ProfitTableRow {
    group_key: string;
    group_name: string;
    group_external_id: string | null;   // external code (SKU, proveedor code, etc.)
    ventas_netas: number;
    unidades: number;
    costo_total: number;
    margen_pesos: number;
    margen_pct: number;
    cobertura_pct: number;
    rows_with_cost: number;
    rows_total: number;
    // SKU-mode only
    supplier_name?: string;
    cost_final_unit?: number;
    purchase_price?: number;
    freight_pct?: number;
    margin_list1_pct?: number;
    price_list1_net?: number;
    benefit_pct?: number;
    cost_status?: 'CON_COSTO' | 'SIN_COSTO';
    cost_week_used?: string | null;    // ISO date of the actual cost row used
    total_count: number;
}

export interface CoverageData {
    sales_total: number;
    sales_with_cost: number;
    sales_without_cost: number;
    coverage_pct: number;
}

export interface ChartSupplier {
    supplier_id: string;
    supplier_name: string;
    sales_net: number;
    margin_amount: number;
    coverage_pct: number;
}

export interface ChartSeller {
    seller_id: string;
    seller_name: string;
    sales_net: number;
    margin_amount: number;
    coverage_pct: number;
}

export interface ChartSku {
    sku: string;
    product_name: string;
    supplier_name: string;
    sales_net: number;
    margin_amount: number;
    margin_pct: number;
    cost_status: string;
}

export interface ProfitChartsData {
    top_suppliers: ChartSupplier[];
    top_sellers: ChartSeller[];
    top_skus: ChartSku[];
    coverage: CoverageData;
}

export async function getProfitTable(
    filters: ProfitFilters,
    page: number = 0,
    pageSize: number = 50
): Promise<{ rows: ProfitTableRow[]; total: number }> {
    const { data, error } = await supabase.rpc('report_profit_table', {
        p_company_id: DEFAULT_COMPANY_ID,
        p_period_id: filters.period_id,
        p_week_date: filters.week_date,
        p_group_by: filters.group_by,
        p_supplier_ids: filters.supplier_ids?.length ? filters.supplier_ids : null,
        p_seller_ids: filters.seller_ids?.length ? filters.seller_ids : null,
        p_customer_ids: filters.customer_ids?.length ? filters.customer_ids : null,
        p_sku_search: filters.sku_search || null,
        p_solo_con_costo: filters.solo_con_costo ?? false,
        p_solo_sin_costo: filters.solo_sin_costo ?? false,
        p_solo_margen_neg: filters.solo_margen_neg ?? false,
        p_limit: pageSize,
        p_offset: page * pageSize,
    });
    if (error) throw error;
    const rows = (data || []) as ProfitTableRow[];
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    return { rows, total };
}

export async function getProfitCharts(filters: ProfitFilters): Promise<ProfitChartsData> {
    const { data, error } = await supabase.rpc('report_profit_charts', {
        p_company_id: DEFAULT_COMPANY_ID,
        p_period_id: filters.period_id,
        p_week_date: filters.week_date,
        p_supplier_ids: filters.supplier_ids?.length ? filters.supplier_ids : null,
        p_seller_ids: filters.seller_ids?.length ? filters.seller_ids : null,
        p_customer_ids: filters.customer_ids?.length ? filters.customer_ids : null,
        p_sku_search: filters.sku_search || null,
        p_solo_con_costo: filters.solo_con_costo ?? false,
    });
    if (error) throw error;
    return data as ProfitChartsData;
}

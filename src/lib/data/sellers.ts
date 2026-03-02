import { supabase } from '@/lib/supabase/client';
import { DEFAULT_COMPANY_ID } from '@/lib/data/constants';

export interface SellerSummaryRow {
    seller_id: string;
    seller_name: string;
    sales_net: number;
    units: number;
    customers_count: number;
    invoices_count: number;
    coverage_cost_pct: number;
    margin_amount: number;
    margin_pct: number;
    rank_sales: number;
    rank_margin: number;
}

export interface SellerCustomerRow {
    customer_id: string;
    customer_name: string;
    address: string | null;
    sales_net: number;
    units: number;
    invoices_count: number;
}

export interface SellerSupplierRow {
    supplier_id: string;
    supplier_name: string;
    sales_net: number;
    units: number;
    margin_amount: number;
    margin_pct: number;
    coverage_pct: number;
}

export interface SellerProductRow {
    product_id: string;
    sku: string;
    product_name: string;
    sales_net: number;
    units: number;
    cost_unit_asof: number;
    cost_total: number;
    margin_amount: number;
    margin_pct: number;
    cost_status: 'CON_COSTO' | 'SIN_COSTO';
}

export interface SellersFilterParams {
    periodIds?: string[];
    weekDate: string; // YYYY-MM-DD
    supplierId?: string;
    customerId?: string;
    skuSearch?: string;
}

export async function getSellersSummary(
    params: SellersFilterParams
): Promise<SellerSummaryRow[]> {
    const { periodIds = [], weekDate, supplierId, customerId, skuSearch } = params;

    const { data, error } = await supabase.rpc('rpc_report_sellers_summary', {
        p_company_id: DEFAULT_COMPANY_ID,
        p_period_ids: periodIds.length > 0 ? periodIds : null,
        p_week_date: weekDate,
        p_supplier_id: supplierId || null,
        p_customer_id: customerId || null,
        p_sku_search: skuSearch || null,
    });

    if (error) {
        console.error('getSellersSummary Error:', error);
        throw error;
    }

    return data as SellerSummaryRow[];
}

export async function getSellerCustomers(
    sellerId: string,
    params: Omit<SellersFilterParams, 'weekDate' | 'customerId'>
): Promise<SellerCustomerRow[]> {
    const { periodIds = [], supplierId, skuSearch } = params;

    const { data, error } = await supabase.rpc('rpc_report_seller_customers', {
        p_company_id: DEFAULT_COMPANY_ID,
        p_seller_id: sellerId,
        p_period_ids: periodIds.length > 0 ? periodIds : null,
        p_supplier_id: supplierId || null,
        p_sku_search: skuSearch || null,
    });

    if (error) {
        console.error('getSellerCustomers Error:', error);
        throw error;
    }

    return data as SellerCustomerRow[];
}

export async function getSellerSuppliers(
    sellerId: string,
    params: Omit<SellersFilterParams, 'supplierId'>
): Promise<SellerSupplierRow[]> {
    const { periodIds = [], weekDate, customerId, skuSearch } = params;

    const { data, error } = await supabase.rpc('rpc_report_seller_suppliers', {
        p_company_id: DEFAULT_COMPANY_ID,
        p_seller_id: sellerId,
        p_period_ids: periodIds.length > 0 ? periodIds : null,
        p_week_date: weekDate,
        p_customer_id: customerId || null,
        p_sku_search: skuSearch || null,
    });

    if (error) {
        console.error('getSellerSuppliers Error:', error);
        throw error;
    }

    return data as SellerSupplierRow[];
}

export async function getSellerProducts(
    sellerId: string,
    params: SellersFilterParams
): Promise<SellerProductRow[]> {
    const { periodIds = [], weekDate, supplierId, customerId, skuSearch } = params;

    const { data, error } = await supabase.rpc('rpc_report_seller_products', {
        p_company_id: DEFAULT_COMPANY_ID,
        p_seller_id: sellerId,
        p_period_ids: periodIds.length > 0 ? periodIds : null,
        p_week_date: weekDate,
        p_supplier_id: supplierId || null,
        p_customer_id: customerId || null,
        p_sku_search: skuSearch || null,
    });

    if (error) {
        console.error('getSellerProducts Error:', error);
        throw error;
    }

    return data as SellerProductRow[];
}

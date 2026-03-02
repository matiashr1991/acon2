import { supabase } from '../supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COMPANY_ID } from './constants';

export async function logImportJob(payload: {
    company_id: string;
    job_type: string;
    week_start_date: string;
    status: string;
    stats: any;
    error_details?: any;
    storage_path?: string;
    created_by?: string;
}, supabaseClient: SupabaseClient = supabase) {
    const { data, error } = await supabaseClient
        .from('import_job')
        .insert({
            company_id: payload.company_id,
            job_type: payload.job_type,
            week_start_date: payload.week_start_date,
            status: payload.status,
            stats: payload.stats,
            error: payload.error_details,
            storage_path: payload.storage_path || 'massive_import_memory_streams',
            created_by: payload.created_by,
        })
        .select()
        .single();
    if (error) console.error("Error logging import job:", error);
    return data;
}

export async function getCustomers() {
    const { data, error } = await supabase
        .from('dim_customer')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .order('name');
    if (error) throw error;
    return data;
}

export async function getSellers() {
    const { data, error } = await supabase
        .from('dim_seller')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .order('name');
    if (error) throw error;
    return data;
}

export async function getSuppliers() {
    const { data, error } = await supabase
        .from('dim_supplier')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .order('name');
    if (error) throw error;
    return data;
}

export async function listSuppliers(options: { search?: string, limit?: number, offset?: number } = {}) {
    const { search, limit = 50, offset = 0 } = options;

    let query = supabase
        .from('dim_supplier')
        .select('*', { count: 'exact' })
        .eq('company_id', DEFAULT_COMPANY_ID);

    if (search) {
        const cleanSearch = search.trim();
        const isNumeric = /^\d+$/.test(cleanSearch);
        if (isNumeric) {
            // If numeric, might be external_id or part of name
            query = query.or(`external_id.ilike.%${cleanSearch}%,name.ilike.%${cleanSearch}%`);
        } else {
            // Text search, just name
            query = query.ilike('name', `%${cleanSearch}%`);
        }
    }

    query = query.order('name');

    if (limit) {
        query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
}

export async function getProducts() {
    const { data, error } = await supabase
        .from('dim_product')
        .select(`
      *,
      supplier:supplier_id (id, name, external_id)
    `)
        .eq('company_id', DEFAULT_COMPANY_ID)
        .order('name');
    if (error) throw error;
    return data;
}

export async function getSupplierById(id: string) {
    const { data, error } = await supabase
        .from('dim_supplier')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function getProductsBySupplier(supplierId: string) {
    // Primary approach: products directly linked via dim_product.supplier_id
    const { data: directProducts, error } = await supabase
        .from('dim_product')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('supplier_id', supplierId)
        .order('name');
    if (error) throw error;

    // Fallback approach: search distinct product_ids in fact_sales_month linked to this supplier_id
    // Since Supabase REST doesn't easily let us do DISTINCT on joined queries in one shot without RPC, 
    // we query fact_sales_month grouped by product to infer it.
    // However, if the backfill worked perfectly, directProducts should contain them all.
    // Just in case, we can fetch distinct from fact_sales_month, but we will do finding distinct product_id
    const { data: salesFacts, error: fError } = await supabase
        .from('fact_sales_month')
        .select('product_id')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .eq('supplier_id', supplierId);

    if (fError) throw fError;

    const unlinkedIds = new Set<string>();
    const knownIds = new Set((directProducts || []).map(p => p.id));

    (salesFacts || []).forEach(f => {
        if (!knownIds.has(f.product_id)) {
            unlinkedIds.add(f.product_id);
        }
    });

    let allProducts = Array.isArray(directProducts) ? [...directProducts] : [];

    if (unlinkedIds.size > 0) {
        // Fetch missing products
        const { data: inferredProducts, error: infError } = await supabase
            .from('dim_product')
            .select('*')
            .in('id', Array.from(unlinkedIds));

        if (!infError && inferredProducts) {
            allProducts = allProducts.concat(inferredProducts);
        }
    }

    return allProducts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertMasterEntities(
    table: 'dim_customer' | 'dim_seller' | 'dim_supplier' | 'dim_branch',
    rows: Array<{ external_id: string; name?: string; label?: string; phone?: string; address?: string; ramo_code?: string; ramo_label?: string }>
) {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ ...r, company_id: DEFAULT_COMPANY_ID }));

    const { data, error } = await supabase
        .from(table)
        .upsert(payload, { onConflict: 'company_id,external_id' })
        .select();

    if (error) throw error;
    return data;
}

export async function upsertProducts(
    rows: Array<{ external_id: string; name: string; supplier_id?: string; raw_description?: string; unit_business_code?: string; unit_business_label?: string }>
) {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ ...r, company_id: DEFAULT_COMPANY_ID }));

    const { data, error } = await supabase
        .from('dim_product')
        .upsert(payload, { onConflict: 'company_id,external_id' })
        .select();

    if (error) {
        console.error('Error in upsertProducts:', error);
        throw error;
    }
    return data;
}

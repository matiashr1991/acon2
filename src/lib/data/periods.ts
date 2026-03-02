import { supabase } from '../supabase/client';
import { DEFAULT_COMPANY_ID } from './constants';

export async function getPeriods() {
    const { data, error } = await supabase
        .from('dim_period')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .order('month_start', { ascending: false });

    if (error) throw error;
    return data;
}

export async function getCurrentPeriod() {
    const { data, error } = await supabase
        .from('dim_period')
        .select('*')
        .eq('company_id', DEFAULT_COMPANY_ID)
        .order('month_start', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows
        throw error;
    }
    return data;
}

export async function createPeriod(external_id: string, label: string, month_start: string) {
    const { data, error } = await supabase
        .from('dim_period')
        .upsert(
            { company_id: DEFAULT_COMPANY_ID, external_id, label, month_start },
            { onConflict: 'company_id,external_id' }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
}

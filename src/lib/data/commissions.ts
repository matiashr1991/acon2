import { supabase } from '../supabase/client';
import { DEFAULT_COMPANY_ID } from './constants';

export async function listRules() {
    const { data, error } = await supabase
        .from('commission_rule')
        .select(`
      *,
      scopes:commission_rule_scope (*)
    `)
        .eq('company_id', DEFAULT_COMPANY_ID)
        .order('priority', { ascending: true });

    if (error) throw error;
    return data;
}

export async function createRule(rule: any, scopes: any[]) {
    const { data: ruleData, error: ruleError } = await supabase
        .from('commission_rule')
        .insert({ ...rule, company_id: DEFAULT_COMPANY_ID })
        .select()
        .single();

    if (ruleError) throw ruleError;

    if (scopes && scopes.length > 0) {
        const scopesPayload = scopes.map((s) => ({
            ...s,
            rule_id: ruleData.id,
        }));
        await supabase.from('commission_rule_scope').insert(scopesPayload);
    }

    return ruleData;
}

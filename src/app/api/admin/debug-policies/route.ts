import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, serviceKey);

        const { data, error } = await supabase.rpc('exec_sql', { query: 'SELECT policyname, tablename, cmd, roles FROM pg_policies WHERE schemaname = \'public\';' });

        // Fallback to fetch via REST API
        if (error) {
            const res = await fetch(`${supabaseUrl}/rest/v1/pg_policies?select=policyname,tablename,cmd,roles`, {
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`
                }
            });
            const altData = await res.json();
            return NextResponse.json({ policies: altData });
        }

        return NextResponse.json({ policies: data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_COMPANY_ID } from '@/lib/data/constants';
import * as xlsx from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // 1. Get the latest import_job
        const { data: job, error: jobError } = await supabase
            .from('import_job')
            .select('*')
            .eq('job_type', 'sales_xlsx')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (jobError || !job) {
            return NextResponse.json({ error: 'No import job found' }, { status: 404 });
        }

        // 2. Download from Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('imports')
            .download(job.storage_path);

        if (downloadError || !fileData) {
            return NextResponse.json({ error: 'Failed to download file', details: downloadError }, { status: 500 });
        }

        // 3. Parse XLSX
        const buffer = await fileData.arrayBuffer();
        const wb = xlsx.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

        if (rawData.length < 2) {
            return NextResponse.json({ error: 'Empty file' }, { status: 400 });
        }

        const headers = rawData[0];
        const rows = rawData.slice(1);

        const idxProductCode = headers.indexOf('Código');
        let idxProductName = headers.indexOf('Descripción.2');
        if (idxProductName === -1) idxProductName = idxProductCode !== -1 ? idxProductCode + 1 : -1;

        if (idxProductCode === -1 || idxProductName === -1) {
            return NextResponse.json({ error: 'No se encontraron las columnas Código o Descripción.2' }, { status: 400 });
        }

        // 4. Build map mapping SKU -> Real Product Name
        const productMap = new Map<string, string>();
        for (const row of rows) {
            const code = String(row[idxProductCode] || '').trim();
            const name = String(row[idxProductName] || '').trim();
            if (code && name) {
                productMap.set(code, name);
            }
        }

        if (productMap.size === 0) {
            return NextResponse.json({ error: 'No valid products found in file' }, { status: 400 });
        }

        // 5. Update DB (chunked to avoid huge payloads if needed, or individually)
        const { data: existingProducts, error: fetchError } = await supabase
            .from('dim_product')
            .select('*')
            .eq('company_id', DEFAULT_COMPANY_ID);

        if (fetchError) throw fetchError;

        let updatedCount = 0;
        const updates = [];

        for (const p of existingProducts || []) {
            const correctName = productMap.get(p.external_id);
            // Only update if we have a name in the sheet and it's different from the DB
            if (correctName && correctName !== p.name) {
                updates.push({
                    ...p, // We must include all existing columns so upsert doesn't null them out
                    name: correctName
                });
                updatedCount++;
            }
        }

        // Upsert all at once
        if (updates.length > 0) {
            // chunk it to prevent payload issues
            const chunkSize = 500;
            for (let i = 0; i < updates.length; i += chunkSize) {
                const chunk = updates.slice(i, i + chunkSize);
                const { error: upsertError } = await supabase
                    .from('dim_product')
                    .upsert(chunk, { onConflict: 'company_id,external_id' });
                if (upsertError) throw upsertError;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Product names repaired.`,
            updatedCount,
            totalInMap: productMap.size,
            fileEvaluated: job.storage_path
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

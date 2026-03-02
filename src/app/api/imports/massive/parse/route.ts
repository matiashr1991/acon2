import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_COMPANY_ID } from '@/lib/data/constants';

// Limit max body size if needed, though Vercel has limits. 
// We expect chunks of ~5 files, each < 1MB.
export const maxDuration = 60; // Max execution time for Next.js

const ALIASES = {
    sku: ['COD ART', 'COD. ART', 'COD ARTICULO', 'COD ARTÍCULO'],
    name: ['DESCRIPCION'],
    purchase: ['PRECIO DE COMPRA', 'PRECIO COMPRA', 'PR. COMPRA', 'PR COMPRA', 'PRECIO BASE', 'PRECIO LISTA', 'PRECIO LISTA 1'],
    cost: ['COSTO FINAL', 'COSTO S/IVA', 'COSTO S/IVA S/MARGEN'],
    margen: ['MARGEN INT LISTA 1', 'MARGEN LISTA 1'],
    benefit: ['% FINAL TOTAL', 'FINAL TOTAL']
};

const normalizeHeader = (s: string) => s ? String(s).trim().toUpperCase().replace(/\s+/g, ' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
const matchHeader = (normalizedHeader: string, aliases: string[]) => aliases.some(alias => normalizedHeader === normalizeHeader(alias));

const parseNumber = (val: any): number | null => {
    if (val == null || val === '') return null;
    let s = String(val).replace(/[$\s]/g, '').trim();
    if (/\d\.\d{3},/.test(s) || (s.includes(',') && !s.includes('.'))) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        s = s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
};

const normalizePct = (val: any): number | null => {
    if (val == null || val === '') return null;
    const isExplicitPct = String(val).includes('%');
    const n = parseNumber(val);
    if (n === null) return null;
    if (isExplicitPct || n > 1) return n / 100;
    return n;
};

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        const formData = await req.formData();
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        const allParsedRows: any[] = [];
        const fileStats: Record<string, any> = {};
        const extractedSkus = new Set<string>();

        // 1. Read files and extract robustly
        for (const file of files) {
            const buffer = await file.arrayBuffer();
            const workbook = xlsx.read(buffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            const rawRows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

            let headerRowIndex = -1;
            let headerIndeces = { sku: -1, name: -1, purchase: -1, cost: -1, margen: -1, benefit: -1 };

            for (let i = 0; i < rawRows.length; i++) {
                const row = rawRows[i];
                if (!Array.isArray(row)) continue;

                let foundSku = -1;
                for (let j = 0; j < row.length; j++) {
                    const cell = normalizeHeader(row[j]);
                    if (matchHeader(cell, ALIASES.sku)) { foundSku = j; break; }
                }

                if (foundSku >= 0) {
                    headerRowIndex = i;
                    headerIndeces.sku = foundSku;
                    for (let j = 0; j < row.length; j++) {
                        const cell = normalizeHeader(row[j]);
                        if (matchHeader(cell, ALIASES.name)) headerIndeces.name = j;
                        if (matchHeader(cell, ALIASES.purchase)) headerIndeces.purchase = j;
                        if (matchHeader(cell, ALIASES.cost)) headerIndeces.cost = j;
                        if (matchHeader(cell, ALIASES.margen)) headerIndeces.margen = j;
                        if (matchHeader(cell, ALIASES.benefit)) headerIndeces.benefit = j;
                    }
                    break;
                }
            }

            let validRows = 0;
            if (headerRowIndex !== -1 && headerIndeces.sku !== -1) {
                for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!Array.isArray(row) || row.length === 0) continue;

                    const rawSku = row[headerIndeces.sku];
                    const cleanSku = String(rawSku).trim();

                    if (!cleanSku || isNaN(Number(rawSku))) continue;
                    if (matchHeader(normalizeHeader(rawSku), ALIASES.sku)) continue;

                    const cost = headerIndeces.cost >= 0 ? parseNumber(row[headerIndeces.cost]) : null;

                    // We extract it, we don't deduplicate yet across the whole batch natively, 
                    // we just collect it here. Deduplication logic by SKU + cost > 0 will happen in UI or at the end of API
                    allParsedRows.push({
                        fileName: file.name,
                        _rawIndex: i + 1,
                        sku: cleanSku,
                        xlsxName: headerIndeces.name >= 0 ? String(row[headerIndeces.name]).trim() : undefined,
                        purchase: headerIndeces.purchase >= 0 ? parseNumber(row[headerIndeces.purchase]) : null,
                        cost: cost,
                        margen: headerIndeces.margen >= 0 ? normalizePct(row[headerIndeces.margen]) : null,
                        benefit: headerIndeces.benefit >= 0 ? normalizePct(row[headerIndeces.benefit]) : null,
                    });

                    extractedSkus.add(cleanSku);
                    validRows++;
                }
            }

            fileStats[file.name] = {
                status: validRows > 0 ? 'parsed' : 'no_data',
                rowsRead: validRows
            };
        }

        // 2. Resolve SKUs against dim_product
        const skuArray = Array.from(extractedSkus);
        const resolvedProducts = new Map<string, any>();

        // Fetch in batches of 300 to avoid giant IN clauses
        const BATCH_SIZE = 300;
        for (let i = 0; i < skuArray.length; i += BATCH_SIZE) {
            const batch = skuArray.slice(i, i + BATCH_SIZE);
            const { data: prods, error } = await supabase
                .from('dim_product')
                .select('id, external_id, name, supplier_id')
                .eq('company_id', DEFAULT_COMPANY_ID)
                .in('external_id', batch);

            if (!error && prods) {
                prods.forEach(p => resolvedProducts.set(p.external_id, p));
            }
        }

        // 3. Enrich parsed rows with DB Info and classify
        const enrichedRows = allParsedRows.map(row => {
            const prod = resolvedProducts.get(row.sku);

            let status = 'OK';
            let errorMsg = undefined;

            if (!prod) {
                status = 'ERROR';
                errorMsg = 'NO EN REGISTROS';
            } else if (row.cost === null || row.cost < 0) {
                status = 'ERROR';
                errorMsg = 'COSTO INVALIDO';
            }
            // Mismatch with supplier mapping is computed aggregately per file, but we can store the DB supplier_id

            return {
                ...row,
                productId: prod?.id || null,
                officialName: prod?.name || null,
                dbSupplierId: prod?.supplier_id || null,
                status,
                errorMsg
            };
        });

        // 4. File-Level "MIXTO" evaluation
        // A file is MIXTO if the valid products inside it belong to > 1 unique supplier_id
        const fileSupplierMap = new Map<string, Set<string>>();
        enrichedRows.forEach(r => {
            if (r.dbSupplierId && r.status === 'OK') {
                if (!fileSupplierMap.has(r.fileName)) {
                    fileSupplierMap.set(r.fileName, new Set());
                }
                fileSupplierMap.get(r.fileName)!.add(r.dbSupplierId);
            }
        });

        fileSupplierMap.forEach((supplierSet, fName) => {
            if (fileStats[fName]) {
                fileStats[fName].suppliersCount = supplierSet.size;
                if (supplierSet.size > 1) {
                    fileStats[fName].isMixed = true;
                }
            }
        });

        return NextResponse.json({
            success: true,
            rows: enrichedRows,
            fileStats
        });

    } catch (err: any) {
        console.error("Export parse error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

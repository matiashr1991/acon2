"use client";

import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { read, utils } from 'xlsx';
import { supabase } from '@/lib/supabase/client';
import { DEFAULT_COMPANY_ID } from '@/lib/data/constants';
import { Sidebar } from '@/components/ui/Sidebar';
import { importSalesXlsx } from '@/lib/data/sales';
import { createPeriod } from '@/lib/data/periods';
import { upsertMasterEntities, upsertProducts } from '@/lib/data/master';

export default function SalesImportPage() {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [preview, setPreview] = useState<any[]>([]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = e.target.files[0];
            setFile(selected);
            // read preview
            const buffer = await selected.arrayBuffer();
            const wb = read(buffer);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = utils.sheet_to_json(ws, { header: 1, defval: "" }).slice(0, 6);
            setPreview(data);
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setLoading(true);
        setStatus('Subiendo a Supabase Storage...');

        try {
            // 1. Upload to Storage
            const periodExtId = '2026-02'; // simplified extraction from filename or content
            const safeFilename = `${Date.now()}_${file.name}`;
            const storagePath = `${DEFAULT_COMPANY_ID}/sales/${periodExtId}/${safeFilename}`;

            const { error: uploadError } = await supabase.storage
                .from('imports')
                .upload(storagePath, file);

            if (uploadError) throw uploadError;

            setStatus('Creando Import Job...');
            const { data: job, error: jobError } = await supabase
                .from('import_job')
                .insert({
                    company_id: DEFAULT_COMPANY_ID,
                    job_type: 'sales_xlsx',
                    period_external_id: periodExtId,
                    storage_path: storagePath,
                    status: 'staging'
                })
                .select()
                .single();
            if (jobError) throw jobError;

            setStatus('Procesando datos (Preview)...');
            // For MVP, parse in browser instead of Edge Function
            const buffer = await file.arrayBuffer();
            const wb = read(buffer);
            const ws = wb.Sheets[wb.SheetNames[0]];

            // Convert to JSON with array of arrays to handle duplicated headers
            const rawData = utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

            if (rawData.length < 2) throw new Error('El archivo está vacío o no tiene encabezados.');

            setStatus('Mapeando columnas y normalizando...');

            const headers = rawData[0];
            const rows = rawData.slice(1);

            // Helper: find header index by exact match first, then starts-with (handles truncated names)
            const findHeader = (exact: string, ...fallbacks: string[]): number => {
                let idx = headers.indexOf(exact);
                if (idx !== -1) return idx;
                for (const fb of fallbacks) {
                    idx = headers.indexOf(fb);
                    if (idx !== -1) return idx;
                }
                // Last resort: starts-with match for truncated headers (e.g. "Vende" for "Vendedor")
                idx = (headers as string[]).findIndex((h: string) =>
                    typeof h === 'string' && exact.startsWith(h.replace(/\.*$/, '').trim())
                );
                return idx;
            };

            // ─── YELLOW COLUMNS (confirmed from Chess sábana layout) ───────────────
            //
            // The XLSX has 9 repeated 'Descripción' columns. In array mode (header:1)
            // they are ALL literally 'Descripción' with NO .2/.3 suffixes.
            // Each is found by offset from its unique anchor column.
            //
            // Col B  = Cod. Período
            // Col C  = Descripción Período
            // Col E  = Cod. Cliente
            // Col F  = Descripción (customer_name  → Cod. Cliente + 1)
            // Col G  = Sucursal
            // Col K  = Domicilio
            // Col M  = Ramo
            // Col N  = Descripción Ramo(s)
            // Col O  = Vendedor
            // Col P  = Descripción Vendedor
            // Col R  = Código  (SKU – unique header)
            // Col S  = Descripción (product_name   → Código + 1)
            // Col T  = Marca
            // Col U  = Descripción (supplier_name  → Marca + 1)
            // Col AI = Unidad de Negocio
            // Col AJ = Descripción (unit_name      → Unidad de Negocio + 1)
            // Col AL = Precio
            // Col AM = Bonif / Bonific
            // Col AN = Pr Neto
            // Col AO = Cantidades Totales / Cantidades Tot.
            // Col AQ = Importes Netos
            // Col AR = Importes Fin / Importes Finales

            const idxPeriodCode = findHeader('Cod. Período', 'Cod. Periodo');
            const idxPeriodLabel = findHeader('Descripción Período', 'Descripción Periodo');
            const idxCustomerCode = findHeader('Cod. Cliente');
            const idxCustomerName = idxCustomerCode !== -1 ? idxCustomerCode + 1 : -1;  // Col F (Descripción #1)

            const idxBranch = findHeader('Sucursal');
            const idxAddress = findHeader('Domicilio');
            const idxRamoCode = findHeader('Ramo');
            const idxRamoLabel = findHeader('Descripción Ramos', 'Descripción Ramo');
            const idxSellerCode = findHeader('Vendedor');
            const idxSellerName = findHeader('Descripción Vendedor');

            const idxProductCode = findHeader('Código');                                // Col R (unique)
            const idxProductName = idxProductCode !== -1 ? idxProductCode + 1 : -1;   // Col S (Descripción #3)

            const idxSupplierCode = findHeader('Marca');                                 // Col T (unique)
            const idxSupplierName = idxSupplierCode !== -1 ? idxSupplierCode + 1 : -1;  // Col U (Descripción #4)

            const idxUnitCode = findHeader('Unidad de Negocio');                        // Col AI (unique)
            const idxUnitLabel = idxUnitCode !== -1 ? idxUnitCode + 1 : -1;             // Col AJ (Descripción #9)

            const idxPrice = findHeader('Precio');
            const idxBonific = findHeader('Bonific', 'Bonif');
            const idxPriceNet = findHeader('Pr Neto');
            const idxQtyTotal = findHeader('Cantidades Totales', 'Cantidades Tot.');
            const idxAmountNet = findHeader('Importes Netos');
            const idxAmountFinal = findHeader('Importes Finales', 'Importes Fin');
            const idxInvoicesCount = findHeader('Cantidad de Facturas', 'Cantidad de Fact');
            const idxBultosAvg = findHeader('Bultos Promedio', 'Bultos P');

            // --- GUARDRAIL 1: Validate required anchor headers (unique names only) ---
            // 'Descripción' appears 9× — we validate its unique anchors instead
            const REQUIRED_UNIQUE_HEADERS = ['Código', 'Cod. Cliente', 'Marca', 'Unidad de Negocio'];
            const missingHeaders = REQUIRED_UNIQUE_HEADERS.filter(h => !headers.includes(h));
            if (missingHeaders.length > 0) {
                throw new Error(
                    `Headers requeridos no encontrados: ${missingHeaders.join(', ')}. ` +
                    `Verificar que el XLSX sea la sábana Chess correcta.\n` +
                    `Headers encontrados: ${(headers as string[]).filter(Boolean).slice(0, 15).join(', ')}...`
                );
            }

            // Validate other required numeric columns
            const requiredIdxs = { idxPeriodCode, idxCustomerCode, idxSellerCode, idxProductCode, idxSupplierCode, idxPrice, idxBonific, idxPriceNet, idxQtyTotal, idxAmountNet, idxAmountFinal };
            for (const [key, val] of Object.entries(requiredIdxs)) {
                if (val === -1) throw new Error(`Columna requerida no encontrada. Revisar mapeo para: ${key}`);
            }

            const parseNumber = (val: any) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                // Handle comma as decimal separator and dots as thousands
                const cleaned = String(val).replace(/\./g, '').replace(',', '.');
                const parsed = parseFloat(cleaned);
                return isNaN(parsed) ? 0 : parsed;
            };

            const parseBonific = (val: any) => {
                if (typeof val === 'number') {
                    return val > 1 ? val / 100 : val;
                }
                if (!val) return 0;
                const str = String(val).trim();
                let num = parseNumber(str.replace('%', ''));
                if (str.includes('%') || num > 1) {
                    num = num / 100;
                }
                return num;
            };

            const formatDate = (val: any) => {
                if (typeof val === 'number') {
                    // Excel date
                    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                    return date.toISOString().split('T')[0];
                }
                return String(val);
            };

            const mappedData = rows.map(r => {
                // A helper to safely get values or fallback to empty string
                const get = (idx: number) => idx !== -1 ? r[idx] : null;

                return {
                    period_code: String(get(idxPeriodCode) || ''),
                    period_label: formatDate(get(idxPeriodLabel)),
                    customer_code: String(get(idxCustomerCode) || ''),
                    customer_name: String(get(idxCustomerName) || ''),
                    branch: String(get(idxBranch) || ''),
                    address: String(get(idxAddress) || ''),
                    ramo_code: String(get(idxRamoCode) || ''),
                    ramo_label: String(get(idxRamoLabel) || ''),
                    seller_code: String(get(idxSellerCode) || 'V0'),
                    seller_name: String(get(idxSellerName) || ''),
                    product_code: String(get(idxProductCode) || ''),
                    product_name: String(get(idxProductName) || ''),
                    supplier_code: String(get(idxSupplierCode) || ''),
                    supplier_name: String(get(idxSupplierName) || ''),
                    unit_business_code: String(get(idxUnitCode) || ''),
                    unit_business_label: String(get(idxUnitLabel) || ''),
                    price: parseNumber(get(idxPrice)),
                    bonific: parseBonific(get(idxBonific)),
                    price_net: parseNumber(get(idxPriceNet)),
                    qty_total: parseNumber(get(idxQtyTotal)),
                    amount_net: parseNumber(get(idxAmountNet)),
                    amount_final: parseNumber(get(idxAmountFinal)),
                    invoices_count: parseNumber(get(idxInvoicesCount)),
                    bultos_avg: parseNumber(get(idxBultosAvg))
                };
            }).filter(d => Boolean(d.period_code) && Boolean(d.customer_code));

            if (mappedData.length === 0) throw new Error('No se encontraron filas válidas en el archivo.');

            // --- GUARDRAIL 2: SKU must not equal customer_code ---
            const skuEqCustomer = mappedData.filter(
                r => r.product_code && r.product_code === r.customer_code
            ).length;
            if (skuEqCustomer / mappedData.length > 0.05) {
                throw new Error(
                    `Mapeo de columnas incorrecto: ${skuEqCustomer} filas (${(skuEqCustomer / mappedData.length * 100).toFixed(1)}%) ` +
                    `tienen sku == customer_code. El XLSX parece estar tomando columnas equivocadas.`
                );
            }

            // --- GUARDRAIL 3: product_name must not equal customer_name ---
            const nameCollision = mappedData.filter(
                r => r.product_name && r.customer_name && r.product_name === r.customer_name
            ).length;
            if (nameCollision / mappedData.length > 0.05) {
                throw new Error(
                    `Mapeo de columnas incorrecto: ${nameCollision} filas (${(nameCollision / mappedData.length * 100).toFixed(1)}%) ` +
                    `tienen product_name == customer_name. Verificar columna 'Descripción.2' en el XLSX.`
                );
            }

            setStatus('Upsert de Dimensiones...');

            // Upsert period (assuming period_code is identical for the batch or picking the first valid one)
            const firstPeriodCode = mappedData[0].period_code;
            const firstPeriodLabel = mappedData[0].period_label;
            // use periodExtId (e.g. '2026-02') to construct a valid ISO date for PostgreSQL instead of '2-01'
            const period = await createPeriod(firstPeriodCode, firstPeriodLabel, `${periodExtId}-01`);

            const deduplicate = (arr: any[], key: string) => {
                const map = new Map();
                for (const item of arr) {
                    if (item[key] && item[key] !== 'undefined' && item[key] !== 'null') {
                        map.set(item[key], item);
                    }
                }
                return Array.from(map.values());
            };

            const customers = deduplicate(mappedData.map(r => ({ external_id: r.customer_code, name: r.customer_name, address: r.address, ramo_code: r.ramo_code, ramo_label: r.ramo_label })), 'external_id');
            const sellers = deduplicate(mappedData.map(r => ({ external_id: r.seller_code, name: r.seller_name })), 'external_id');
            const suppliers = deduplicate(mappedData.map(r => ({ external_id: r.supplier_code, name: r.supplier_name })), 'external_id');
            const suppliersDb = await upsertMasterEntities('dim_supplier', suppliers);
            const suppMap = new Map(suppliersDb.map((c: any) => [c.external_id, c.id]));

            const products = deduplicate(mappedData.map(r => ({
                external_id: r.product_code,
                name: r.product_name,
                unit_business_code: r.unit_business_code,
                unit_business_label: r.unit_business_label,
                supplier_id: suppMap.get(r.supplier_code) || undefined
            })), 'external_id');

            // Upsert dims (batched to prevent too large payloads, though usually < 1000 unique)
            const customersDb = await upsertMasterEntities('dim_customer', customers);
            const sellersDb = await upsertMasterEntities('dim_seller', sellers);
            const productsDb = await upsertProducts(products);

            setStatus('Mapeando y Guardando Ventas...');

            // Map Db UUIDs mapped by external_id
            const custMap = new Map(customersDb.map((c: any) => [c.external_id, c.id]));
            const sellMap = new Map(sellersDb.map((c: any) => [c.external_id, c.id]));
            const prodMap = new Map(productsDb.map((c: any) => [c.external_id, c.id]));

            const salesRecords = mappedData.map(r => {
                return {
                    customer_id: custMap.get(r.customer_code) || null,
                    seller_id: sellMap.get(r.seller_code) || null,
                    supplier_id: suppMap.get(r.supplier_code) || null,
                    product_id: prodMap.get(r.product_code) || null,
                    amount_net: r.amount_net,
                    qty_total: r.qty_total,
                    price_net: r.price_net,
                    bonific: r.bonific,
                    price: r.price,
                    amount_final: r.amount_final,
                    invoices_count: r.invoices_count,
                    bultos_avg: r.bultos_avg
                };
            }).filter(r => r.amount_net !== 0 || r.qty_total !== 0);

            await importSalesXlsx(period.id, salesRecords);

            setStatus('Completado.');

            // Update Job
            await supabase.from('import_job').update({ status: 'committed' }).eq('id', job.id);

        } catch (err: any) {
            console.error(err);
            setStatus(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">
                <h1 className="text-3xl font-bold mb-4">Importar Ventas (XLSX)</h1>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <label className="block mb-4">
                        <span className="sr-only">Seleccionar Archivo</span>
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20"
                        />
                    </label>

                    {preview.length > 0 && (
                        <div className="mb-4 overflow-x-auto text-xs">
                            <table className="min-w-full text-left">
                                <tbody>
                                    {preview.map((row, i) => (
                                        <tr key={i} className="border-b">
                                            {row.map((cell: any, j: number) => (
                                                <td key={j} className="p-2 whitespace-nowrap">{String(cell)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <button
                        onClick={handleImport}
                        disabled={!file || loading}
                        className="flex items-center gap-2 bg-primary text-white border-0 px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                        <Upload className="w-5 h-5" />
                        {loading ? 'Procesando...' : 'Confirmar Importación'}
                    </button>

                    {status && <p className="mt-4 text-sm text-slate-600">{status}</p>}
                </div>
            </main>
        </div>
    );
}

/**
 * Textos centralizados para el popover "Cómo se calculó este margen".
 * Lenguaje simple, no técnico, consistente en toda la app.
 */

export const MARGIN_COPY = {
    /** Título del popover */
    popoverTitle: '📐 Cómo se calculó este margen',

    /** Sección de fórmulas */
    formulasTitle: 'Fórmulas',
    formulas: [
        'Precio unitario = ventas netas ÷ unidades',
        'Costo total = unidades × costo aplicado',
        'Margen $ = ventas netas − costo total',
        'Margen % = Margen $ ÷ ventas netas',
    ],

    /** Sección de valores aplicados */
    valuesTitle: 'Valores aplicados',
    valueLabels: {
        ventas_netas: 'Ventas netas',
        unidades: 'Unidades vendidas',
        precio_unit_net: 'Precio unitario neto',
        costo_unit_asof: 'Costo aplicado',
        costo_total: 'Costo total',
        margen_pesos: 'Margen $',
        margen_pct: 'Margen %',
    } as const,

    /** Pie del popover: fechas */
    weekSelectedLabel: 'Semana seleccionada',
    weekCostUsedLabel: 'Costo aplicado (último cargado)',

    /** Tooltip del selector de semana en los filtros */
    weekSelectorTooltip:
        'Para calcular el margen usamos el último costo que tengas cargado hasta esta semana.',

    /** Label del selector de semana en los filtros */
    weekSelectorLabel: 'Semana de costos (referencia)',

    /** Bloque de margen negativo */
    negativeTitle: 'Posibles causas del margen negativo',
    negativeCauses: (costWeekLabel: string): string[] => [
        'El costo cargado es más alto que el precio de venta (se vendió por debajo del costo).',
        'La unidad puede no coincidir: el costo puede ser de una caja/pack y la venta es por unidad (o al revés).',
        'Hubo mucha bonificación/descuento y el precio neto quedó muy bajo.',
        `El costo aplicado es de otra semana: se usó el último costo disponible (${costWeekLabel}) y puede no coincidir con la semana real.`,
    ],

    /** Estado sin costo */
    noCost: {
        badge: 'Sin costo cargado',
        value: 'N/A',
        cause: 'No hay costo cargado para este producto en semanas anteriores.',
    },
} as const;

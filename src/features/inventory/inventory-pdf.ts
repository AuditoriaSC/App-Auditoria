import { supabase } from '../../supabaseClient';

type InventoryReportPdfSummary = {
  id: string;
  local_codigo: string | null;
  local_name_snapshot: string | null;
  inventory_cutoff_label: string | null;
  inventory_date: string | null;
  front_regularization_date: string | null;
  start_time: string | null;
  end_time: string | null;
  has_second_time_range: boolean | null;
  second_start_time: string | null;
  second_end_time: string | null;
  assigned_auditor_name_snapshot: string | null;
  responsible_name_snapshot: string | null;
  status: string | null;
};

type InventoryResultPdfRow = {
  result_type: string;
  sku: string | null;
  item_description: string | null;
  cross_name: string | null;
  manual_comment: string | null;
  is_manual_adjusted: boolean | null;
  final_result: number | string | null;
  component_skus?: string[];
  component_items?: InventoryResultComponentPdfRow[];
  physical_stock?: number | string | null;
  system_stock?: number | string | null;
};

type InventoryItemPdfRow = {
  sku: string;
  item_description: string | null;
  physical_stock: number | string | null;
  system_stock: number | string | null;
  difference: number | string | null;
};

type InventoryCrossPdfRow = {
  sku: string;
  cross_name: string;
  conversion_factor: number | string | null;
  is_active: boolean | null;
};

type InventoryResultComponentPdfRow = {
  sku: string;
  item_description: string | null;
  physical_stock: number | string | null;
  system_stock: number | string | null;
  difference: number | string | null;
  converted_difference: number | string | null;
};

type ManualInvoicePdfRow = {
  last_system_invoice: number | null;
  last_physical_block_invoice: number | null;
  block_expiration_date?: string | null;
  calculated_difference: number | null;
};

type RecountPdfRow = {
  sku: string | null;
  item_description: string | null;
  initial_count: number | string | null;
  final_recount: number | string | null;
  difference: number | string | null;
  status: string | null;
};

type FinishedProductPdfRow = {
  item_description: string | null;
  system_stock: number | string | null;
  physical_stock: number | string | null;
  difference: number | string | null;
};

type CashClosurePdfRow = {
  cash_register: string | null;
  cash_register_number?: string | null;
  cashier_name: string | null;
  cash_value: number | string | null;
  system_value?: number | string | null;
  cash_difference: number | string | null;
};

type EvidencePdfRow = {
  category: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  uploaded_at: string | null;
};

const bucketName = 'inventory-report-evidences';
const displayAsIndependentMarker = '[display_as_independent]';
const evidenceCategoryOrder = [
  'tirillas-de-cierre-de-caja',
  'facturas-manuales',
  'traspasos-pendientes',
  'albaranes-de-compra-pendientes',
  'imagen-del-extracto-de-movimientos',
  'imagen-de-regularizacion-de-bodega-de-diferencias',
  'otro',
];

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return [day, month, year].filter(Boolean).join('/');
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  return value.slice(0, 5);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isImageEvidence(evidence: EvidencePdfRow) {
  const mime = String(evidence.mime_type || '').toLowerCase();
  const name = evidence.file_name.toLowerCase();
  return mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(name);
}

function normalizeSku(value: string | null | undefined) {
  return String(value || '').trim();
}

function normalizeCrossName(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isCostCross(value: string | null | undefined) {
  return normalizeCrossName(value) === 'COSTO';
}

function isExpenseCross(value: string | null | undefined) {
  return normalizeCrossName(value) === 'GASTO';
}

function isDisplayAsIndependent(result: InventoryResultPdfRow) {
  return Boolean(result.cross_name && result.manual_comment?.includes(displayAsIndependentMarker));
}

function classifyResult(result: Pick<InventoryResultPdfRow, 'cross_name' | 'final_result'>) {
  if (toNumber(result.final_result) >= 0) {
    return result.cross_name ? 'surplus_cross' : 'surplus_without_cross';
  }

  return result.cross_name ? 'shortage_cross' : 'shortage_without_cross';
}

function groupResults(results: InventoryResultPdfRow[]) {
  const visibleResults = results.filter((row) => !isExpenseCross(row.cross_name));
  return {
    surplus: visibleResults.filter((row) => row.result_type === 'surplus_without_cross' || row.result_type === 'surplus_cross'),
    shortage: visibleResults.filter((row) => row.result_type === 'shortage_without_cross' || row.result_type === 'shortage_cross'),
  };
}

function getStockDifference(item: InventoryItemPdfRow) {
  return toNumber(item.physical_stock) - toNumber(item.system_stock);
}

function getConvertedDifference(item: InventoryItemPdfRow, conversionFactor: number) {
  if (conversionFactor === 1) {
    return toNumber(item.difference);
  }

  return getStockDifference(item) * conversionFactor;
}

function calculatePdfResultDetails(items: InventoryItemPdfRow[], crosses: InventoryCrossPdfRow[]) {
  const activeCrossesBySku = new Map<string, InventoryCrossPdfRow[]>();
  crosses
    .filter((cross) => cross.is_active)
    .forEach((cross) => {
      const sku = normalizeSku(cross.sku);
      const current = activeCrossesBySku.get(sku) || [];
      current.push(cross);
      activeCrossesBySku.set(sku, current);
    });

  const withoutCross: InventoryResultPdfRow[] = [];
  const crossGroups = new Map<string, InventoryResultPdfRow & { component_skus: string[] }>();

  items.forEach((item) => {
    const sku = normalizeSku(item.sku);
    const itemCrosses = activeCrossesBySku.get(sku) || [];
    const stockDifference = getStockDifference(item);

    if (itemCrosses.length === 0) {
      withoutCross.push({
        result_type: stockDifference >= 0 ? 'surplus_without_cross' : 'shortage_without_cross',
        sku,
        item_description: item.item_description,
        cross_name: null,
        manual_comment: null,
        is_manual_adjusted: false,
        final_result: stockDifference,
        component_skus: [sku],
        physical_stock: item.physical_stock,
        system_stock: item.system_stock,
      });
      return;
    }

    itemCrosses.forEach((cross) => {
      if (isExpenseCross(cross.cross_name)) return;

      if (isCostCross(cross.cross_name)) {
        withoutCross.push({
          result_type: stockDifference >= 0 ? 'surplus_without_cross' : 'shortage_without_cross',
          sku,
          item_description: item.item_description,
          cross_name: null,
          manual_comment: null,
          is_manual_adjusted: false,
          final_result: stockDifference,
          component_skus: [sku],
          physical_stock: item.physical_stock,
          system_stock: item.system_stock,
        });
        return;
      }

      const conversionFactor = toNumber(cross.conversion_factor);
      const calculated = getConvertedDifference(item, conversionFactor);
      const originalDifference = conversionFactor === 1 ? toNumber(item.difference) : stockDifference;
      const current = crossGroups.get(cross.cross_name);
      const component = {
        sku,
        item_description: item.item_description,
        physical_stock: item.physical_stock,
        system_stock: item.system_stock,
        difference: originalDifference,
        converted_difference: calculated,
      };

      if (current) {
        current.final_result = toNumber(current.final_result) + calculated;
        current.component_skus = Array.from(new Set([...current.component_skus, sku]));
        current.component_items = [...(current.component_items || []), component];
      } else {
        crossGroups.set(cross.cross_name, {
          result_type: calculated >= 0 ? 'surplus_cross' : 'shortage_cross',
          sku,
          item_description: item.item_description,
          cross_name: cross.cross_name,
          manual_comment: null,
          is_manual_adjusted: false,
          final_result: calculated,
          component_skus: [sku],
          physical_stock: item.physical_stock,
          system_stock: item.system_stock,
          component_items: [component],
        });
      }
    });
  });

  return [...withoutCross, ...Array.from(crossGroups.values())].map((result) => ({
    ...result,
    result_type: classifyResult(result),
  }));
}

function mergeSavedResultsWithCalculatedDetails(savedResults: InventoryResultPdfRow[], calculatedResults: InventoryResultPdfRow[]) {
  return savedResults.map((savedResult) => {
    const recalculatedType = classifyResult(savedResult);
    const normalizedSavedSku = normalizeSku(savedResult.sku);

    if (!savedResult.cross_name || isDisplayAsIndependent(savedResult)) {
      const calculatedDetail = calculatedResults.find((calculatedResult) =>
        normalizeSku(calculatedResult.sku) === normalizedSavedSku
        || calculatedResult.component_skus?.some((sku) => normalizeSku(sku) === normalizedSavedSku)
      );

      return {
        ...savedResult,
        result_type: recalculatedType,
        component_skus: calculatedDetail?.component_skus || savedResult.component_skus,
        component_items: calculatedDetail?.component_items || savedResult.component_items,
        physical_stock: calculatedDetail?.physical_stock ?? savedResult.physical_stock,
        system_stock: calculatedDetail?.system_stock ?? savedResult.system_stock,
      };
    }

    const calculatedDetail = calculatedResults.find((calculatedResult) =>
      calculatedResult.cross_name === savedResult.cross_name
      && !isDisplayAsIndependent(calculatedResult)
    );

    return {
      ...savedResult,
      result_type: recalculatedType,
      component_skus: calculatedDetail?.component_skus || savedResult.component_skus,
      component_items: calculatedDetail?.component_items || savedResult.component_items,
      physical_stock: calculatedDetail?.physical_stock ?? savedResult.physical_stock,
      system_stock: calculatedDetail?.system_stock ?? savedResult.system_stock,
    };
  });
}

async function evidenceToSignedUrl(evidence: EvidencePdfRow) {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(evidence.file_path, 60 * 60);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function evidenceCategoryLabel(category: string) {
  return category
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w|\s\w/g, (letter) => letter.toUpperCase());
}

function signedImageHtml(evidence: EvidencePdfRow, signedUrl: string | null) {
  if (!signedUrl) {
    return `<div class="evidence-missing">Imagen no disponible: ${escapeHtml(evidence.file_name)}</div>`;
  }

  return `
    <figure class="evidence-image">
      <img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(evidence.file_name)}" loading="eager" />
      <figcaption>${escapeHtml(evidence.file_name)}</figcaption>
    </figure>
  `;
}

function evidenceImageGroupsHtml(groups: Record<string, string[]>) {
  const sortedEntries = Object.entries(groups).sort(([left], [right]) => {
    const leftIndex = evidenceCategoryOrder.indexOf(left);
    const rightIndex = evidenceCategoryOrder.indexOf(right);
    const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const safeRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (safeLeftIndex !== safeRightIndex) return safeLeftIndex - safeRightIndex;
    return evidenceCategoryLabel(left).localeCompare(evidenceCategoryLabel(right), 'es');
  });

  const categoryBlocks = sortedEntries
    .filter(([, images]) => images.length > 0)
    .map(([category, images]) => `
      <div class="evidence-category-block">
        <h3>${escapeHtml(evidenceCategoryLabel(category))}</h3>
        <div class="evidence-grid">
          ${images.join('')}
        </div>
      </div>
    `)
    .join('');

  if (!categoryBlocks) {
    return '<p class="muted">No hay imágenes adjuntas para insertar en el informe.</p>';
  }

  return categoryBlocks;
}

function table(headers: string[], rows: string[][]) {
  const body = rows.length > 0
    ? rows.map((row) => `
      <tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>
    `).join('')
    : `<tr><td colspan="${headers.length}" class="muted">Sin registros.</td></tr>`;

  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function section(title: string, content: string) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${content}
    </section>
  `;
}

function statusTable(rows: string[][]) {
  return table(['Detalle de validaciones', 'Estado'], rows.map(([detail, status]) => [
    escapeHtml(detail),
    `<strong>${escapeHtml(status)}</strong>`,
  ]));
}

function noNoveltiesTable(title: string) {
  return table([title, 'Estado'], [[
    'No se registran novedades.',
    '<strong>OK</strong>',
  ]]);
}

function recountSummaryRows(recounts: RecountPdfRow[]) {
  const ok = recounts.filter((row) => row.status === 'Recuento OK').length;
  const modified = recounts.filter((row) => row.status === 'Recuento Modificado').length;
  return [
    ['Recuento OK', String(ok)],
    ['Recuento Modificado', String(modified)],
    ['Total de recuentos', String(recounts.length)],
  ];
}

function resultValue(value: unknown) {
  const number = toNumber(value);
  const valueClass = number < 0 ? 'negative' : number > 0 ? 'positive' : 'neutral';
  return `<span class="${valueClass}">${formatNumber(number)}</span>`;
}

function independentDisplayData(result: InventoryResultPdfRow) {
  const movedFromCross = isDisplayAsIndependent(result);
  const firstComponent = result.component_items?.[0];

  return {
    sku: movedFromCross ? firstComponent?.sku || result.component_skus?.[0] || result.sku : result.sku,
    description: movedFromCross ? firstComponent?.item_description || result.item_description : result.item_description,
    physicalStock: movedFromCross ? firstComponent?.physical_stock ?? result.physical_stock : result.physical_stock,
    systemStock: movedFromCross ? firstComponent?.system_stock ?? result.system_stock : result.system_stock,
    difference: movedFromCross ? firstComponent?.converted_difference ?? result.final_result : result.final_result,
    note: movedFromCross ? `<div class="row-note">Cruce original: ${escapeHtml(result.cross_name || '-')}</div>` : '',
  };
}

function resultTableRows(results: InventoryResultPdfRow[]) {
  const independentResults = results
    .filter((result) => !result.cross_name || isDisplayAsIndependent(result))
    .sort((left, right) => Math.abs(toNumber(independentDisplayData(right).difference)) - Math.abs(toNumber(independentDisplayData(left).difference)));
  const crossResults = results
    .filter((result) => result.cross_name && !isDisplayAsIndependent(result))
    .sort((left, right) => Math.abs(toNumber(right.final_result)) - Math.abs(toNumber(left.final_result)));
  const rows: string[] = [];

  independentResults.forEach((result) => {
    const display = independentDisplayData(result);
    rows.push(`
      <tr>
        <td class="article-cell"><strong>${escapeHtml(display.sku || 'sin SKU')} · ${escapeHtml(display.description || 'Sin descripción')}</strong>${display.note}</td>
        <td class="number-cell">${formatNumber(display.physicalStock)}</td>
        <td class="number-cell">${formatNumber(display.systemStock)}</td>
        <td class="number-cell">${resultValue(display.difference)}</td>
      </tr>
    `);
  });

  if (independentResults.length > 0 && crossResults.length > 0) {
    rows.push('<tr class="spacer-row"><td colspan="4"></td></tr>');
  }

  crossResults.forEach((result) => {
    const components = result.component_items || [];

    if (components.length > 0) {
      components.forEach((item) => {
        rows.push(`
          <tr>
            <td class="article-cell"><strong>${escapeHtml(item.sku)} · ${escapeHtml(item.item_description || 'Sin descripción')}</strong></td>
            <td class="number-cell">${formatNumber(item.physical_stock)}</td>
            <td class="number-cell">${formatNumber(item.system_stock)}</td>
            <td class="number-cell">${resultValue(item.converted_difference)}</td>
          </tr>
        `);
      });
    } else {
      rows.push(`
        <tr>
          <td class="article-cell"><strong>SKUs: ${escapeHtml((result.component_skus || []).join(', ') || 'sin detalle guardado')}</strong></td>
          <td class="number-cell">-</td>
          <td class="number-cell">-</td>
          <td class="number-cell">${resultValue(result.final_result)}</td>
        </tr>
      `);
    }

    const totalClass = toNumber(result.final_result) < 0 ? 'total-shortage-row' : 'total-surplus-row';
    rows.push(`
      <tr class="${totalClass}">
        <td></td>
        <td class="number-cell">-</td>
        <td><strong>TOTAL DE CRUCE ${escapeHtml(result.cross_name || '-')}</strong></td>
        <td class="number-cell"><strong>${resultValue(result.final_result)}</strong></td>
      </tr>
      <tr class="spacer-row"><td colspan="4"></td></tr>
    `);
  });

  if (rows.length === 0) {
    rows.push('<tr><td colspan="4" class="muted">Sin registros para este bloque.</td></tr>');
  }

  return rows.join('');
}

function resultsTable(results: InventoryResultPdfRow[]) {
  return `
    <table class="results-table">
      <thead>
        <tr>
          <th>Artículo</th>
          <th class="number-cell">Stock físico</th>
          <th class="number-cell">Stock actual</th>
          <th class="number-cell">Diferencia</th>
        </tr>
      </thead>
      <tbody>${resultTableRows(results)}</tbody>
    </table>
  `;
}

function buildPrintableHtml(params: {
  report: InventoryReportPdfSummary;
  items: InventoryItemPdfRow[];
  results: InventoryResultPdfRow[];
  invoice: ManualInvoicePdfRow | null;
  recounts: RecountPdfRow[];
  finishedProducts: FinishedProductPdfRow[];
  cashClosures: CashClosurePdfRow[];
  observation: string | null;
  evidences: EvidencePdfRow[];
  imageHtml: string;
}) {
  const { report, items, results, invoice, recounts, finishedProducts, cashClosures, observation, evidences, imageHtml } = params;
  const grouped = groupResults(results);

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Informe de Inventario ${escapeHtml(report.local_codigo || '')}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 11px; background: #fff; }
          .page { max-width: 980px; margin: 0 auto; padding: 14px; }
          header { background: #165034; color: #fff; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; }
          .brand { font-size: 18px; font-weight: 900; color: #fff; }
          h1 { margin: 8px 0 4px; font-size: 18px; text-transform: uppercase; }
          .header-subtitle { color: #f7f1e7; }
          h2 { margin: 18px 0 0; padding: 7px 9px; background: #165034; color: #fff; font-size: 12px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
          th { background: #165034; color: #fff; font-size: 10px; text-align: left; padding: 5px; border: 1px solid #9ca3af; }
          td { padding: 5px; border: 1px solid #9ca3af; vertical-align: top; }
          .article-cell { width: 48%; }
          .number-cell { text-align: right; white-space: nowrap; }
          .row-note { color: #6b7280; font-size: 9px; margin-top: 2px; }
          .spacer-row td { border-left: 0; border-right: 0; height: 8px; padding: 0; }
          .total-shortage-row td { background: #f6d8d5; }
          .total-surplus-row td { background: #dff2e8; }
          .meta th { width: 32%; background: #e7f1ec; color: #165034; }
          .positive { color: #165034; font-weight: 900; }
          .negative { color: #b91c1c; font-weight: 900; }
          .neutral { color: #374151; font-weight: 900; }
          .muted { color: #6b7280; }
          .note { border: 1px solid #9ca3af; min-height: 42px; padding: 8px; }
          .evidence-category-block { margin-top: 12px; page-break-inside: avoid; }
          .evidence-category-block h3 { margin: 0 0 8px; color: #165034; font-size: 12px; text-transform: uppercase; }
          .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }
          .evidence-image { margin: 0; page-break-inside: avoid; border: 1px solid #9ca3af; padding: 6px; background: #fff; }
          .evidence-image figcaption { font-size: 9px; font-weight: 700; margin-top: 5px; color: #374151; overflow-wrap: anywhere; }
          .evidence-image img { display: block; width: 100%; max-height: 360px; object-fit: contain; background: #f9fafb; }
          .evidence-missing { border: 1px dashed #9ca3af; padding: 8px; color: #6b7280; margin: 8px 0; }
          .actions { margin: 12px 0; }
          .print-button { background: #165034; color: white; border: 0; padding: 10px 14px; border-radius: 6px; font-weight: 900; cursor: pointer; }
          @media print {
            .actions { display: none; }
            .page { padding: 0; max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="actions">
            <button class="print-button" onclick="window.print()">Guardar / imprimir PDF</button>
          </div>
          <header>
            <div class="brand">Sweet & Coffee</div>
            <h1>Informe de Visita por Inventario General</h1>
            <div class="header-subtitle">${escapeHtml(report.local_name_snapshot || '-')} (${escapeHtml(report.local_codigo || '-')})</div>
          </header>

          ${section('Datos principales', table(['Campo', 'Detalle'], [
            ['Local', `${escapeHtml(report.local_codigo || '-')} - ${escapeHtml(report.local_name_snapshot || '-')}`],
            ['Código local / almacén', escapeHtml(report.local_codigo || '-')],
            ['Corte de Inventario', escapeHtml(report.inventory_cutoff_label || 'Sin corte asignado')],
            ['Fecha inventario', formatDate(report.inventory_date)],
            ['Fecha regularización', formatDate(report.front_regularization_date)],
            ['Horario principal', `${formatTime(report.start_time)} - ${formatTime(report.end_time)}`],
            ['Segundo horario', report.has_second_time_range ? `${formatTime(report.second_start_time)} - ${formatTime(report.second_end_time)}` : 'No aplica'],
            ['Auditor encargado', escapeHtml(report.assigned_auditor_name_snapshot || '-')],
            ['Responsable / líder', escapeHtml(report.responsible_name_snapshot || '-')],
          ]))}

          ${section('4.1 Faltantes', resultsTable(grouped.shortage))}

          ${section('4.2 Sobrantes', resultsTable(grouped.surplus))}

          ${section('4.3 Recuento de ítems', `
            ${table(['Detalle', 'Cantidad'], recountSummaryRows(recounts))}
            ${table(['SKU', 'Descripción', 'Conteo inicial', 'Nuevo reconteo', 'Diferencia', 'Estado'], recounts.map((row) => [
              escapeHtml(row.sku || '-'),
              escapeHtml(row.item_description || '-'),
              formatNumber(row.initial_count),
              formatNumber(row.final_recount),
              formatNumber(row.difference),
              escapeHtml(row.status || '-'),
            ]))}
          `)}

          ${section('4.4 Producto terminado', finishedProducts.length > 0
            ? table(['Producto terminado', 'Sistema', 'Físico', 'Diferencia'], finishedProducts.map((row) => [
                escapeHtml(row.item_description || '-'),
                formatNumber(row.system_stock),
                formatNumber(row.physical_stock),
                formatNumber(row.difference),
              ]))
            : noNoveltiesTable('Producto terminado'))}

          ${section('5. Validaciones', statusTable([
            ['Resultado de inventario general revisado', 'OK'],
            ['Reconteos ingresados y revisados', 'OK'],
            ['Producto terminado revisado', finishedProducts.length > 0 ? 'CON NOVEDAD' : 'OK'],
            ['Cierres de caja revisados', cashClosures.length > 0 ? 'OK' : 'SIN REGISTROS'],
            ['Facturas manuales revisadas', invoice ? 'OK' : 'SIN REGISTROS'],
          ]))}

          ${section('6. Cierres de caja', cashClosures.length > 0 ? table(['Caja', 'Número', 'Cajero', 'Físico', 'Sistema', 'Diferencia'], cashClosures.map((row) => [
            escapeHtml(row.cash_register || '-'),
            escapeHtml(row.cash_register_number || '-'),
            escapeHtml(row.cashier_name || '-'),
            formatNumber(row.cash_value),
            formatNumber(row.system_value),
            formatNumber(row.cash_difference),
          ])) : noNoveltiesTable('Cierres de caja'))}

          ${section('7. Facturas manuales', invoice ? table(['Detalle', 'Número / fecha'], [
            ['Última factura registrada en sistema', String(invoice.last_system_invoice ?? '-')],
            ['Última factura en block físico', String(invoice.last_physical_block_invoice ?? '-')],
            ['Fecha de caducidad del block', formatDate(invoice.block_expiration_date)],
            ['Diferencia calculada', String(invoice.calculated_difference ?? '-')],
          ]) : noNoveltiesTable('Facturas manuales'))}

          ${section('8. Observaciones', `<div class="note">${observation ? escapeHtml(observation) : 'Sin observaciones adicionales registradas.'}</div>`)}

          ${section('9. Evidencias', `
            ${imageHtml}
          `)}

          ${section('Resumen final', table(['Campo', 'Detalle'], [
            ['Estado del informe', escapeHtml(report.status || '-')],
            ['Fecha de generación', new Date().toLocaleString('es-EC')],
          ]))}
        </div>
        <script>
          function waitForImages() {
            var images = Array.prototype.slice.call(document.images || []);
            if (!images.length) return Promise.resolve();
            var waits = images.map(function (image) {
              if (image.complete) return Promise.resolve();
              return new Promise(function (resolve) {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              });
            });
            return Promise.race([
              Promise.all(waits),
              new Promise(function (resolve) { setTimeout(resolve, 7000); })
            ]);
          }

          window.addEventListener('load', function () {
            waitForImages().then(function () {
              setTimeout(function () { window.print(); }, 300);
            });
          });
        </script>
      </body>
    </html>
  `;
}

function createPrintablePdfWindow() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Permite ventanas emergentes para generar el PDF.');
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Generando informe de inventario</title>
        <style>
          body {
            align-items: center;
            color: #00402a;
            display: flex;
            font-family: Arial, sans-serif;
            height: 100vh;
            justify-content: center;
            margin: 0;
          }
        </style>
      </head>
      <body>Generando informe de inventario…</body>
    </html>
  `);
  printWindow.document.close();

  return printWindow;
}

function writePrintablePdfWindow(printWindow: Window, html: string) {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export async function downloadInventoryReportPdf(inventoryReportId: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('La descarga de PDF está disponible solo en Web.');
  }

  const printWindow = createPrintablePdfWindow();

  const [
    reportResult,
    itemsResult,
    resultsResult,
    invoiceResult,
    recountsResult,
    finishedResult,
    cashResult,
    observationResult,
    evidencesResult,
  ] = await Promise.all([
    supabase
      .from('inventory_reports')
      .select('id, local_codigo, local_name_snapshot, inventory_cutoff_label, inventory_date, front_regularization_date, start_time, end_time, has_second_time_range, second_start_time, second_end_time, assigned_auditor_name_snapshot, responsible_name_snapshot, status')
      .eq('id', inventoryReportId)
      .single<InventoryReportPdfSummary>(),
    supabase
      .from('inventory_report_items')
      .select('sku, item_description, physical_stock, system_stock, difference')
      .eq('inventory_report_id', inventoryReportId),
    supabase
      .from('inventory_report_results')
      .select('result_type, sku, item_description, cross_name, manual_comment, is_manual_adjusted, final_result')
      .eq('inventory_report_id', inventoryReportId)
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_manual_invoice_checks')
      .select('last_system_invoice, last_physical_block_invoice, block_expiration_date, calculated_difference')
      .eq('inventory_report_id', inventoryReportId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('inventory_recounts')
      .select('sku, item_description, initial_count, final_recount, difference, status')
      .eq('inventory_report_id', inventoryReportId)
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_finished_product_differences')
      .select('item_description, system_stock, physical_stock, difference')
      .eq('inventory_report_id', inventoryReportId)
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_cash_closures')
      .select('cash_register, cash_register_number, cashier_name, cash_value, system_value, cash_difference')
      .eq('inventory_report_id', inventoryReportId)
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_additional_observations')
      .select('observation')
      .eq('inventory_report_id', inventoryReportId)
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('inventory_report_evidences')
      .select('category, file_name, file_path, mime_type, uploaded_at')
      .eq('inventory_report_id', inventoryReportId)
      .order('uploaded_at', { ascending: true }),
  ]);

  if (reportResult.error || !reportResult.data) {
    printWindow.close();
    throw new Error('No se pudo cargar el encabezado del informe.');
  }

  const blockingError = [
    itemsResult.error,
    resultsResult.error,
    invoiceResult.error,
    recountsResult.error,
    finishedResult.error,
    cashResult.error,
    observationResult.error,
    evidencesResult.error,
  ].find(Boolean);

  if (blockingError) {
    printWindow.close();
    throw new Error(`No se pudo cargar toda la información del informe: ${blockingError.message}`);
  }

  const items = (itemsResult.data || []) as InventoryItemPdfRow[];
  const skus = Array.from(new Set(items.map((item) => normalizeSku(item.sku)).filter(Boolean)));
  const crossesResult = skus.length > 0
    ? await supabase
        .from('inventory_crosses')
        .select('sku, cross_name, conversion_factor, is_active')
        .in('sku', skus)
        .eq('is_active', true)
    : { data: [], error: null };

  if (crossesResult.error) {
    printWindow.close();
    throw new Error(`No se pudieron cargar los cruces del informe: ${crossesResult.error.message}`);
  }

  const calculatedResults = calculatePdfResultDetails(items, (crossesResult.data || []) as InventoryCrossPdfRow[]);
  const savedResults = (resultsResult.data || []) as InventoryResultPdfRow[];
  const mergedResults = savedResults.length > 0
    ? mergeSavedResultsWithCalculatedDetails(savedResults, calculatedResults)
    : calculatedResults;
  const evidences = (evidencesResult.data || []) as EvidencePdfRow[];
  const imageGroups: Record<string, string[]> = {};
  await Promise.all(
    evidences
      .filter(isImageEvidence)
      .map(async (evidence) => {
        const html = signedImageHtml(evidence, await evidenceToSignedUrl(evidence));
        const key = evidence.category || 'Otro';
        imageGroups[key] = [...(imageGroups[key] || []), html];
      }),
  );
  const imageHtml = evidenceImageGroupsHtml(imageGroups);

  const html = buildPrintableHtml({
    report: reportResult.data,
    items,
    results: mergedResults,
    invoice: ((invoiceResult.data || []) as ManualInvoicePdfRow[])[0] || null,
    recounts: (recountsResult.data || []) as RecountPdfRow[],
    finishedProducts: (finishedResult.data || []) as FinishedProductPdfRow[],
    cashClosures: (cashResult.data || []) as CashClosurePdfRow[],
    observation: (observationResult.data?.[0] as { observation?: string | null } | undefined)?.observation || null,
    evidences,
    imageHtml,
  });

  writePrintablePdfWindow(printWindow, html);
}

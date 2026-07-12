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
  final_result: number | string | null;
};

type InventoryItemPdfRow = {
  sku: string;
  item_description: string | null;
  physical_stock: number | string | null;
  system_stock: number | string | null;
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

function sortByImpact(left: InventoryResultPdfRow, right: InventoryResultPdfRow) {
  return Math.abs(toNumber(right.final_result)) - Math.abs(toNumber(left.final_result));
}

function groupResults(results: InventoryResultPdfRow[]) {
  return {
    surplusWithoutCross: results.filter((row) => row.result_type === 'surplus_without_cross').sort(sortByImpact),
    surplusCross: results.filter((row) => row.result_type === 'surplus_cross').sort(sortByImpact),
    shortageWithoutCross: results.filter((row) => row.result_type === 'shortage_without_cross').sort(sortByImpact),
    shortageCross: results.filter((row) => row.result_type === 'shortage_cross').sort(sortByImpact),
  };
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
  const categoryBlocks = Object.entries(groups)
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

function resultRows(rows: InventoryResultPdfRow[], itemsBySku: Map<string, InventoryItemPdfRow>) {
  return rows.map((row) => {
    const item = row.sku ? itemsBySku.get(String(row.sku).trim()) : null;
    const value = toNumber(row.final_result);
    const valueClass = value < 0 ? 'negative' : value > 0 ? 'positive' : 'neutral';
    const label = row.cross_name
      ? `TOTAL DE CRUCE ${escapeHtml(row.cross_name)}`
      : `${escapeHtml(row.sku || '-')} - ${escapeHtml(row.item_description || '-')}`;

    return [
      label,
      formatNumber(item?.physical_stock),
      formatNumber(item?.system_stock),
      `<span class="${valueClass}">${formatNumber(value)}</span>`,
    ];
  });
}

function section(title: string, content: string) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${content}
    </section>
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
  const itemsBySku = new Map(items.map((item) => [String(item.sku).trim(), item]));
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
          header { border-bottom: 4px solid #165034; padding-bottom: 10px; margin-bottom: 14px; }
          .brand { font-size: 18px; font-weight: 900; color: #165034; }
          h1 { margin: 8px 0 4px; font-size: 18px; text-transform: uppercase; }
          h2 { margin: 18px 0 0; padding: 7px 9px; background: #165034; color: #fff; font-size: 12px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
          th { background: #165034; color: #fff; font-size: 10px; text-align: left; padding: 5px; border: 1px solid #9ca3af; }
          td { padding: 5px; border: 1px solid #9ca3af; vertical-align: top; }
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
            <div>${escapeHtml(report.local_name_snapshot || '-')} (${escapeHtml(report.local_codigo || '-')})</div>
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

          ${section('4.1 Faltantes', table(['Artículo', 'Stock físico', 'Stock actual', 'Diferencia'], [
            ...resultRows(grouped.shortageWithoutCross, itemsBySku),
            ...resultRows(grouped.shortageCross, itemsBySku),
          ]))}

          ${section('4.2 Sobrantes', table(['Artículo', 'Stock físico', 'Stock actual', 'Diferencia'], [
            ...resultRows(grouped.surplusWithoutCross, itemsBySku),
            ...resultRows(grouped.surplusCross, itemsBySku),
          ]))}

          ${section('4.3 Facturas manuales', table(['Última sistema', 'Última block', 'Caducidad block', 'Diferencia'], invoice ? [[
            String(invoice.last_system_invoice ?? '-'),
            String(invoice.last_physical_block_invoice ?? '-'),
            formatDate(invoice.block_expiration_date),
            String(invoice.calculated_difference ?? '-'),
          ]] : []))}

          ${section('4.4 Reconteo de ítems', table(['SKU', 'Descripción', 'Inicial', 'Reconteo', 'Diferencia', 'Estado'], recounts.map((row) => [
            escapeHtml(row.sku || '-'),
            escapeHtml(row.item_description || '-'),
            formatNumber(row.initial_count),
            formatNumber(row.final_recount),
            formatNumber(row.difference),
            escapeHtml(row.status || '-'),
          ])))}

          ${section('4.5 Producto terminado', table(['Producto terminado', 'Sistema', 'Físico', 'Diferencia'], finishedProducts.map((row) => [
            escapeHtml(row.item_description || '-'),
            formatNumber(row.system_stock),
            formatNumber(row.physical_stock),
            formatNumber(row.difference),
          ])))}

          ${section('4.6 Cierres de caja', table(['Caja', 'Número', 'Cajero', 'Físico', 'Sistema', 'Diferencia'], cashClosures.map((row) => [
            escapeHtml(row.cash_register || '-'),
            escapeHtml(row.cash_register_number || '-'),
            escapeHtml(row.cashier_name || '-'),
            formatNumber(row.cash_value),
            formatNumber(row.system_value),
            formatNumber(row.cash_difference),
          ])))}

          ${section('9. Observaciones', `<div class="note">${observation ? escapeHtml(observation) : 'Sin observaciones adicionales registradas.'}</div>`)}

          ${section('10. Evidencias', `
            ${table(['Categoría', 'Archivo', 'Referencia'], evidences.map((evidence) => [
              escapeHtml(evidenceCategoryLabel(evidence.category)),
              escapeHtml(evidence.file_name),
              escapeHtml(evidence.file_path),
            ]))}
            <h3 style="margin:14px 0 8px;color:#165034;font-size:12px;text-transform:uppercase;">Evidencias fotográficas</h3>
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
      .select('sku, item_description, physical_stock, system_stock')
      .eq('inventory_report_id', inventoryReportId),
    supabase
      .from('inventory_report_results')
      .select('result_type, sku, item_description, cross_name, final_result')
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
    items: (itemsResult.data || []) as InventoryItemPdfRow[],
    results: (resultsResult.data || []) as InventoryResultPdfRow[],
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

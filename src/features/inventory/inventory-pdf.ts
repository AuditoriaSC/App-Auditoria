import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { supabase } from '../../supabaseClient';

type PdfLibModule = typeof import('pdf-lib');

let pdfLibPromise: Promise<PdfLibModule> | null = null;

function loadPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib');
  }
  return pdfLibPromise;
}

function createPdfColors(rgb: PdfLibModule['rgb']) {
  return {
    greenDark: rgb(0, 0.294, 0.184),
    greenSoft: rgb(0.874, 0.953, 0.91),
    cream: rgb(0.969, 0.957, 0.929),
    border: rgb(0.82, 0.76, 0.67),
    text: rgb(0.08, 0.2, 0.18),
    muted: rgb(0.37, 0.44, 0.41),
    white: rgb(1, 1, 1),
  };
}

type InventoryReportPdfSummary = {
  id: string;
  local_codigo: string | null;
  local_name_snapshot: string | null;
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
const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 36;

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

function safeFilePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function isImageEvidence(evidence: EvidencePdfRow) {
  const mime = String(evidence.mime_type || '').toLowerCase();
  const name = evidence.file_name.toLowerCase();
  return mime.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(name);
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

async function evidenceToBytes(evidence: EvidencePdfRow) {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(evidence.file_path, 60 * 5);

  if (error || !data?.signedUrl) return null;

  try {
    const response = await fetch(data.signedUrl);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

class InventoryPdfBuilder {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private regular!: PDFFont;
  private bold!: PDFFont;
  private colors!: ReturnType<typeof createPdfColors>;
  private y = pageHeight - margin;

  async init(pdfLib: PdfLibModule) {
    this.colors = createPdfColors(pdfLib.rgb);
    this.doc = await pdfLib.PDFDocument.create();
    this.regular = await this.doc.embedFont(pdfLib.StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
    this.addPage(true);
  }

  async save(fileName: string) {
    this.addFooters();
    const bytes = await this.doc.save();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  section(title: string) {
    this.ensureSpace(34);
    this.page.drawRectangle({
      x: margin,
      y: this.y - 20,
      width: pageWidth - margin * 2,
      height: 24,
      color: this.colors.greenDark,
    });
    this.page.drawText(title, { x: margin + 8, y: this.y - 12, size: 10, font: this.bold, color: this.colors.white });
    this.y -= 36;
  }

  textLine(label: string, value: string) {
    this.ensureSpace(16);
    this.page.drawText(`${label}:`, { x: margin, y: this.y, size: 9, font: this.bold, color: this.colors.text });
    this.page.drawText(this.truncate(value, 86), { x: margin + 130, y: this.y, size: 9, font: this.regular, color: this.colors.text });
    this.y -= 15;
  }

  note(value: string) {
    this.ensureSpace(15);
    this.page.drawText(this.truncate(value, 112), { x: margin, y: this.y, size: 8, font: this.regular, color: this.colors.muted });
    this.y -= 14;
  }

  table(headers: string[], rows: string[][], widths: number[]) {
    this.ensureSpace(28);
    this.row(headers, widths, 18, true);
    this.y -= 18;

    if (rows.length === 0) {
      this.ensureSpace(18);
      this.page.drawText('Sin registros.', { x: margin + 6, y: this.y - 12, size: 8, font: this.regular, color: this.colors.muted });
      this.y -= 20;
      return;
    }

    rows.forEach((row) => {
      const height = Math.max(18, ...row.map((cell, index) => this.wrap(cell, widths[index] - 8, 7.2).length * 8 + 8));
      this.ensureSpace(height + 2);
      this.row(row, widths, height, false);
      this.y -= height;
    });
    this.y -= 8;
  }

  async imageEvidence(evidence: EvidencePdfRow) {
    const bytes = await evidenceToBytes(evidence);
    if (!bytes) return;

    try {
      const image = evidence.file_name.toLowerCase().endsWith('.png')
        ? await this.doc.embedPng(bytes)
        : await this.doc.embedJpg(bytes);
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = 190;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      this.ensureSpace(height + 34);
      this.note(`${evidence.category} - ${evidence.file_name}`);
      this.page.drawImage(image, { x: margin, y: this.y - height, width, height });
      this.y -= height + 14;
    } catch {
      this.note(`No se pudo insertar imagen: ${evidence.file_name}`);
    }
  }

  private row(cells: string[], widths: number[], height: number, header: boolean) {
    let x = margin;
    cells.forEach((cell, index) => {
      const width = widths[index];
      this.page.drawRectangle({
        x,
        y: this.y - height,
        width,
        height,
        color: header ? this.colors.greenSoft : this.colors.white,
        borderColor: this.colors.border,
        borderWidth: 0.5,
      });
      const font = header ? this.bold : this.regular;
      const color = header ? this.colors.greenDark : this.colors.text;
      const lines = this.wrap(cell, width - 8, 7.2).slice(0, 4);
      lines.forEach((line, lineIndex) => {
        this.page.drawText(line, {
          x: x + 4,
          y: this.y - 11 - lineIndex * 8,
          size: 7.2,
          font,
          color,
        });
      });
      x += width;
    });
  }

  private addPage(withHeader = false) {
    this.page = this.doc.addPage([pageWidth, pageHeight]);
    this.y = pageHeight - margin;
    if (withHeader) this.drawHeader();
  }

  private drawHeader() {
    this.page.drawRectangle({ x: 0, y: pageHeight - 84, width: pageWidth, height: 84, color: this.colors.greenDark });
    this.page.drawText('Sweet & Coffee', { x: margin, y: pageHeight - 34, size: 18, font: this.bold, color: this.colors.white });
    this.page.drawText('Informe de Inventario', { x: margin, y: pageHeight - 58, size: 14, font: this.bold, color: this.colors.cream });
    this.y = pageHeight - 112;
  }

  private ensureSpace(required: number) {
    if (this.y - required >= margin + 18) return;
    this.addPage();
  }

  private addFooters() {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: margin, y: 30 },
        end: { x: pageWidth - margin, y: 30 },
        thickness: 0.5,
        color: this.colors.border,
      });
      page.drawText(`Página ${index + 1} de ${pages.length}`, {
        x: pageWidth - margin - 70,
        y: 15,
        size: 8,
        font: this.regular,
        color: this.colors.muted,
      });
    });
  }

  private wrap(value: string, maxWidth: number, size: number) {
    const words = String(value || '-').split(/\s+/);
    const lines: string[] = [];
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (this.regular.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines.length > 0 ? lines : ['-'];
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
  }
}

export async function downloadInventoryReportPdf(inventoryReportId: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('La descarga de PDF está disponible solo en Web.');
  }

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
      .select('id, local_codigo, local_name_snapshot, inventory_date, front_regularization_date, start_time, end_time, has_second_time_range, second_start_time, second_end_time, assigned_auditor_name_snapshot, responsible_name_snapshot, status')
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
    throw new Error(`No se pudo cargar toda la información del informe: ${blockingError.message}`);
  }

  const report = reportResult.data;
  const items = (itemsResult.data || []) as InventoryItemPdfRow[];
  const results = (resultsResult.data || []) as InventoryResultPdfRow[];
  const evidences = (evidencesResult.data || []) as EvidencePdfRow[];
  const itemsBySku = new Map(items.map((item) => [String(item.sku).trim(), item]));
  const groupedResults = groupResults(results);
  const pdfLib = await loadPdfLib();
  const pdf = new InventoryPdfBuilder();
  await pdf.init(pdfLib);

  pdf.section('1. Encabezado');
  pdf.textLine('Local', `${report.local_codigo || '-'} - ${report.local_name_snapshot || '-'}`);
  pdf.textLine('Código local / almacén', report.local_codigo || '-');
  pdf.textLine('Fecha inventario', formatDate(report.inventory_date));
  pdf.textLine('Fecha regularización', formatDate(report.front_regularization_date));
  pdf.textLine('Hora inicio', formatTime(report.start_time));
  pdf.textLine('Hora finalización', formatTime(report.end_time));
  if (report.has_second_time_range) {
    pdf.textLine('Segundo tramo', `${formatTime(report.second_start_time)} - ${formatTime(report.second_end_time)}`);
  }
  pdf.textLine('Auditor encargado', report.assigned_auditor_name_snapshot || '-');
  pdf.textLine('Responsable / líder', report.responsible_name_snapshot || '-');

  pdf.section('2. Resultados de inventario');
  drawResultsTable(pdf, 'Sobrantes sin cruce', groupedResults.surplusWithoutCross, itemsBySku);
  drawResultsTable(pdf, 'Cruces con resultado >= 0', groupedResults.surplusCross, itemsBySku);
  drawResultsTable(pdf, 'Faltantes sin cruce', groupedResults.shortageWithoutCross, itemsBySku);
  drawResultsTable(pdf, 'Cruces con resultado < 0', groupedResults.shortageCross, itemsBySku);

  pdf.section('3. Validaciones manuales');
  const invoice = ((invoiceResult.data || []) as ManualInvoicePdfRow[])[0];
  pdf.note('Facturas manuales');
  pdf.table(
    ['Última sistema', 'Última block', 'Caducidad block', 'Diferencia'],
    invoice ? [[
      String(invoice.last_system_invoice ?? '-'),
      String(invoice.last_physical_block_invoice ?? '-'),
      formatDate(invoice.block_expiration_date),
      String(invoice.calculated_difference ?? '-'),
    ]] : [],
    [110, 110, 130, 110],
  );
  pdf.note('Reconteos realizados');
  pdf.table(
    ['SKU', 'Descripción', 'Inicial', 'Reconteo', 'Dif.', 'Estado'],
    ((recountsResult.data || []) as RecountPdfRow[]).map((row) => [
      row.sku || '-',
      row.item_description || '-',
      formatNumber(row.initial_count),
      formatNumber(row.final_recount),
      formatNumber(row.difference),
      row.status || '-',
    ]),
    [70, 180, 70, 70, 55, 105],
  );
  pdf.note('Producto terminado');
  pdf.table(
    ['Producto terminado', 'Sistema', 'Físico', 'Diferencia'],
    ((finishedResult.data || []) as FinishedProductPdfRow[]).map((row) => [
      row.item_description || '-',
      formatNumber(row.system_stock),
      formatNumber(row.physical_stock),
      formatNumber(row.difference),
    ]),
    [250, 90, 90, 90],
  );
  pdf.note('Cierres de caja');
  pdf.table(
    ['Caja', 'Número', 'Cajero', 'Físico', 'Sistema', 'Diferencia'],
    ((cashResult.data || []) as CashClosurePdfRow[]).map((row) => [
      row.cash_register || '-',
      row.cash_register_number || '-',
      row.cashier_name || '-',
      formatNumber(row.cash_value),
      formatNumber(row.system_value),
      formatNumber(row.cash_difference),
    ]),
    [70, 70, 150, 80, 80, 80],
  );
  const observation = (observationResult.data?.[0] as { observation?: string | null } | undefined)?.observation;
  if (observation) pdf.textLine('Observación adicional', observation);

  pdf.section('4. Evidencias');
  pdf.table(
    ['Categoría', 'Archivo', 'Referencia'],
    evidences.map((evidence) => [evidence.category, evidence.file_name, evidence.file_path]),
    [155, 180, 195],
  );
  for (const evidence of evidences.filter(isImageEvidence)) {
    await pdf.imageEvidence(evidence);
  }

  pdf.section('5. Resumen final');
  pdf.textLine('Estado del informe', report.status || '-');
  pdf.textLine('Fecha de generación', new Date().toLocaleString('es-EC'));
  pdf.note('Este PDF fue generado desde el módulo web de Informes de Inventario. No fue enviado por correo.');

  const fileName = `informe-inventario-${safeFilePart(report.local_codigo || 'local')}-${formatDate(report.inventory_date).replace(/\//g, '-')}.pdf`;
  await pdf.save(fileName);
}

function drawResultsTable(
  pdf: InventoryPdfBuilder,
  title: string,
  rows: InventoryResultPdfRow[],
  itemsBySku: Map<string, InventoryItemPdfRow>,
) {
  pdf.note(title);
  pdf.table(
    ['Artículo / Cruce', 'Stock físico', 'Stock actual', 'Diferencia'],
    rows.map((row) => {
      const item = row.sku ? itemsBySku.get(String(row.sku).trim()) : null;
      return [
        row.cross_name ? `TOTAL DE CRUCE ${row.cross_name}` : `${row.sku || '-'} - ${row.item_description || '-'}`,
        formatNumber(item?.physical_stock),
        formatNumber(item?.system_stock),
        formatNumber(row.final_result),
      ];
    }),
    [260, 90, 90, 90],
  );
}

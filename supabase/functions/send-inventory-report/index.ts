import { createClient } from "npm:@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const FROM_EMAIL = Deno.env.get('INVENTORY_REPORT_FROM_EMAIL') || Deno.env.get('REPORT_FROM_EMAIL') || Deno.env.get('RESEND_FROM') || ''
const INVENTORY_TO_EMAILS = Deno.env.get('INVENTORY_REPORT_TO_EMAILS') || Deno.env.get('REPORT_TO_EMAILS') || Deno.env.get('RESEND_TEST_TO') || ''
const INVENTORY_CC_EMAILS = Deno.env.get('INVENTORY_REPORT_CC_EMAILS') || Deno.env.get('REPORT_CC_EMAILS') || ''
const INVENTORY_BCC_EMAILS = Deno.env.get('INVENTORY_REPORT_BCC_EMAILS') || Deno.env.get('REPORT_BCC_EMAILS') || ''
const REPORT_HORIZONTAL_LOGO_URL = Deno.env.get('REPORT_HORIZONTAL_LOGO_URL') || ''
const REPORT_LOGO_URL = Deno.env.get('REPORT_LOGO_URL') || Deno.env.get('COMPANY_LOGO_URL') || ''
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || ''
const EVIDENCE_BUCKET = 'inventory-report-evidences'
const EVIDENCE_CATEGORY_ORDER = [
  'tirillas-de-cierre-de-caja',
  'facturas-manuales',
  'traspasos-pendientes',
  'albaranes-de-compra-pendientes',
  'imagen-del-extracto-de-movimientos',
  'imagen-de-regularizacion-de-bodega-de-diferencias',
  'otro',
]

const colors = {
  greenDark: '#165034',
  green: '#1F6B47',
  greenSoft: '#E7F1EC',
  cream: '#F7F1E7',
  creamSoft: '#FBF8F1',
  coffee: '#6B4A32',
  white: '#FFFFFF',
  border: '#DED2C2',
  textPrimary: '#2B2118',
  textSecondary: '#6B5B4B',
  danger: '#B23B32',
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  region: string | null
}

type InventoryReportRow = {
  id: string
  local_codigo: string | null
  local_name_snapshot: string | null
  inventory_date: string | null
  front_regularization_date: string | null
  start_time: string | null
  end_time: string | null
  has_second_time_range: boolean | null
  second_start_time: string | null
  second_end_time: string | null
  assigned_auditor_id: string | null
  assigned_auditor_name_snapshot: string | null
  responsible_name_snapshot: string | null
  inventory_cutoff_label: string | null
  status: string | null
}

type ResultRow = {
  result_type: string | null
  sku: string | null
  item_description: string | null
  cross_name: string | null
  manual_comment: string | null
  is_manual_adjusted: boolean | null
  final_result: number | string | null
  component_skus?: string[]
  component_items?: ResultComponentRow[]
  physical_stock?: number | string | null
  system_stock?: number | string | null
}

type InventoryItemRow = {
  sku: string
  item_description: string | null
  physical_stock: number | string | null
  system_stock: number | string | null
  difference: number | string | null
}

type InventoryCrossRow = {
  sku: string
  cross_name: string
  conversion_factor: number | string | null
  is_active: boolean | null
}

type ResultComponentRow = {
  sku: string
  item_description: string | null
  physical_stock: number | string | null
  system_stock: number | string | null
  difference: number | string | null
  converted_difference: number | string | null
}

type InvoiceRow = {
  last_system_invoice: number | null
  last_physical_block_invoice: number | null
  block_expiration_date?: string | null
  calculated_difference: number | null
}

type RecountRow = {
  sku: string | null
  item_description: string | null
  initial_count: number | string | null
  final_recount: number | string | null
  difference: number | string | null
  status: string | null
}

type FinishedProductRow = {
  item_description: string | null
  system_stock: number | string | null
  physical_stock: number | string | null
  difference: number | string | null
}

type CashClosureRow = {
  cash_register: string | null
  cash_register_number?: string | null
  cashier_name: string | null
  cash_value: number | string | null
  system_value?: number | string | null
  cash_difference: number | string | null
}

type ObservationRow = {
  observation: string | null
}

type EvidenceRow = {
  id: string
  category: string
  file_name: string
  file_path: string
  mime_type: string | null
  size_bytes: number | string | null
  delete_after_send: boolean | null
  attached_to_email: boolean | null
  deleted_after_send: boolean | null
  cleanup_error: string | null
}

type ResendAttachment = {
  filename: string
  content: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseEmailList(value?: string | null) {
  return String(value || '')
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean)
}

function uniqueEmails(values: string[]) {
  return Array.from(new Set(values.map((email) => email.trim()).filter(Boolean)))
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return String(value).slice(0, 5)
}

function formatNumber(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '0,00'
  return new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed)
}

function isPositive(value: unknown) {
  return Number(value) >= 0
}

const DISPLAY_AS_INDEPENDENT_MARKER = '[display_as_independent]'

function normalizeSku(value: string | null | undefined) {
  return String(value || '').trim()
}

function normalizeCrossName(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isCostCross(value: string | null | undefined) {
  return normalizeCrossName(value) === 'COSTO'
}

function isExpenseCross(value: string | null | undefined) {
  return normalizeCrossName(value) === 'GASTO'
}

function isDisplayAsIndependent(result: ResultRow) {
  return Boolean(result.cross_name && result.manual_comment?.includes(DISPLAY_AS_INDEPENDENT_MARKER))
}

function classifyResult(result: Pick<ResultRow, 'cross_name' | 'final_result'>) {
  if (Number(result.final_result || 0) >= 0) {
    return result.cross_name ? 'surplus_cross' : 'surplus_without_cross'
  }

  return result.cross_name ? 'shortage_cross' : 'shortage_without_cross'
}

function getStockDifference(item: InventoryItemRow) {
  return Number(item.physical_stock || 0) - Number(item.system_stock || 0)
}

function getConvertedDifference(item: InventoryItemRow, conversionFactor: number) {
  if (conversionFactor === 1) return Number(item.difference || 0)
  return getStockDifference(item) * conversionFactor
}

function calculateResultDetails(items: InventoryItemRow[], crosses: InventoryCrossRow[]) {
  const activeCrossesBySku = new Map<string, InventoryCrossRow[]>()
  crosses
    .filter((cross) => cross.is_active)
    .forEach((cross) => {
      const sku = normalizeSku(cross.sku)
      const current = activeCrossesBySku.get(sku) || []
      current.push(cross)
      activeCrossesBySku.set(sku, current)
    })

  const withoutCross: ResultRow[] = []
  const crossGroups = new Map<string, ResultRow & { component_skus: string[] }>()

  items.forEach((item) => {
    const sku = normalizeSku(item.sku)
    const itemCrosses = activeCrossesBySku.get(sku) || []
    const stockDifference = getStockDifference(item)

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
      })
      return
    }

    itemCrosses.forEach((cross) => {
      if (isExpenseCross(cross.cross_name)) return

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
        })
        return
      }

      const conversionFactor = Number(cross.conversion_factor || 0)
      const calculated = getConvertedDifference(item, conversionFactor)
      const originalDifference = conversionFactor === 1 ? Number(item.difference || 0) : stockDifference
      const component = {
        sku,
        item_description: item.item_description,
        physical_stock: item.physical_stock,
        system_stock: item.system_stock,
        difference: originalDifference,
        converted_difference: calculated,
      }
      const current = crossGroups.get(cross.cross_name)

      if (current) {
        current.final_result = Number(current.final_result || 0) + calculated
        current.component_skus = Array.from(new Set([...current.component_skus, sku]))
        current.component_items = [...(current.component_items || []), component]
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
        })
      }
    })
  })

  return [...withoutCross, ...Array.from(crossGroups.values())].map((result) => ({
    ...result,
    result_type: classifyResult(result),
  }))
}

function mergeSavedResultsWithCalculatedDetails(savedResults: ResultRow[], calculatedResults: ResultRow[]) {
  return savedResults.map((savedResult) => {
    const recalculatedType = classifyResult(savedResult)
    const normalizedSavedSku = normalizeSku(savedResult.sku)

    if (!savedResult.cross_name || isDisplayAsIndependent(savedResult)) {
      const calculatedDetail = calculatedResults.find((calculatedResult) =>
        normalizeSku(calculatedResult.sku) === normalizedSavedSku
        || calculatedResult.component_skus?.some((sku) => normalizeSku(sku) === normalizedSavedSku)
      )

      return {
        ...savedResult,
        result_type: recalculatedType,
        component_skus: calculatedDetail?.component_skus || savedResult.component_skus,
        component_items: calculatedDetail?.component_items || savedResult.component_items,
        physical_stock: calculatedDetail?.physical_stock ?? savedResult.physical_stock,
        system_stock: calculatedDetail?.system_stock ?? savedResult.system_stock,
      }
    }

    const calculatedDetail = calculatedResults.find((calculatedResult) =>
      calculatedResult.cross_name === savedResult.cross_name
      && !isDisplayAsIndependent(calculatedResult)
    )

    return {
      ...savedResult,
      result_type: recalculatedType,
      component_skus: calculatedDetail?.component_skus || savedResult.component_skus,
      component_items: calculatedDetail?.component_items || savedResult.component_items,
      physical_stock: calculatedDetail?.physical_stock ?? savedResult.physical_stock,
      system_stock: calculatedDetail?.system_stock ?? savedResult.system_stock,
    }
  })
}

function isImageEvidence(evidence: EvidenceRow) {
  const mime = String(evidence.mime_type || '').toLowerCase()
  const name = evidence.file_name.toLowerCase()
  return mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(name)
}

function isDocumentEvidence(evidence: EvidenceRow) {
  return !isImageEvidence(evidence)
}

function shouldAttachEvidence(evidence: EvidenceRow) {
  if (evidence.deleted_after_send) return false
  return isDocumentEvidence(evidence)
}

function shouldCleanupEvidence(evidence: EvidenceRow) {
  return isDocumentEvidence(evidence) && !evidence.deleted_after_send
}

function evidenceCategoryOrderIndex(category: string) {
  const index = EVIDENCE_CATEGORY_ORDER.indexOf(String(category || '').trim().toLowerCase())
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function sortEvidencesByReportOrder(left: EvidenceRow, right: EvidenceRow) {
  const leftIndex = evidenceCategoryOrderIndex(left.category)
  const rightIndex = evidenceCategoryOrderIndex(right.category)
  if (leftIndex !== rightIndex) return leftIndex - rightIndex
  return left.file_name.localeCompare(right.file_name, 'es')
}

function evidenceCategoryLabel(category: string) {
  return String(category || 'otro')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w|\s\w/g, (letter) => letter.toUpperCase())
}

function renderLogo() {
  const logoUrl = REPORT_HORIZONTAL_LOGO_URL || REPORT_LOGO_URL
  if (!logoUrl) return `<div style="font-weight:800; font-size:18px; letter-spacing:.02em;">Sweet & Coffee</div>`
  return `<img src="${escapeHtml(logoUrl)}" alt="Sweet & Coffee" style="display:block; width:220px; max-width:100%; height:auto;" />`
}

function table(title: string, headers: string[], rows: string[][]) {
  const bodyRows = rows.length > 0
    ? rows.map((row) => `
      <tr>
        ${row.map((cell) => `<td style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; vertical-align:top;">${cell}</td>`).join('')}
      </tr>
    `).join('')
    : `<tr><td colspan="${headers.length}" style="padding:10px; border:1px solid ${colors.border}; color:${colors.textSecondary}; font-size:12px;">Sin registros.</td></tr>`

  return `
    <h3 style="background:${colors.greenDark}; color:${colors.white}; margin:22px 0 0 0; padding:8px 10px; font-size:13px; line-height:1.2; text-transform:uppercase;">${escapeHtml(title)}</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; border:1px solid ${colors.border}; border-top:0;">
      <thead>
        <tr style="background:${colors.greenDark};">
          ${headers.map((header) => `<th align="left" style="padding:7px 8px; font-size:11px; color:${colors.white}; border:1px solid ${colors.border};">${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `
}

function buildSubject(report: InventoryReportRow) {
  return `INFORME DE INVENTARIO GENERAL LOCAL ${report.local_name_snapshot || 'LOCAL'} (${report.local_codigo || '-'}) - CORTE ${report.inventory_cutoff_label || 'SIN CORTE ASIGNADO'}`
}

function resultValue(value: unknown) {
  const color = isPositive(value) ? colors.greenDark : colors.danger
  return `<strong style="color:${color};">${formatNumber(value)}</strong>`
}

function independentDisplayData(result: ResultRow) {
  const movedFromCross = isDisplayAsIndependent(result)
  const firstComponent = result.component_items?.[0]

  return {
    sku: movedFromCross ? firstComponent?.sku || result.component_skus?.[0] || result.sku : result.sku,
    description: movedFromCross ? firstComponent?.item_description || result.item_description : result.item_description,
    physicalStock: movedFromCross ? firstComponent?.physical_stock ?? result.physical_stock : result.physical_stock,
    systemStock: movedFromCross ? firstComponent?.system_stock ?? result.system_stock : result.system_stock,
    difference: movedFromCross ? firstComponent?.converted_difference ?? result.final_result : result.final_result,
    note: movedFromCross ? `<div style="font-size:11px; color:${colors.textSecondary}; margin-top:2px;">Cruce original: ${escapeHtml(result.cross_name || '-')}</div>` : '',
  }
}

function resultTableRows(results: ResultRow[]) {
  const independentResults = results
    .filter((result) => !result.cross_name || isDisplayAsIndependent(result))
    .sort((left, right) => Math.abs(Number(independentDisplayData(right).difference || 0)) - Math.abs(Number(independentDisplayData(left).difference || 0)))
  const crossResults = results
    .filter((result) => result.cross_name && !isDisplayAsIndependent(result))
    .sort((left, right) => Math.abs(Number(right.final_result || 0)) - Math.abs(Number(left.final_result || 0)))
  const rows: string[] = []

  independentResults.forEach((result) => {
    const display = independentDisplayData(result)
    rows.push(`
      <tr>
        <td style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; vertical-align:top;"><strong>${escapeHtml(display.sku || 'sin SKU')} · ${escapeHtml(display.description || 'Sin descripción')}</strong>${display.note}</td>
        <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; white-space:nowrap;">${formatNumber(display.physicalStock)}</td>
        <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; white-space:nowrap;">${formatNumber(display.systemStock)}</td>
        <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; white-space:nowrap;">${resultValue(display.difference)}</td>
      </tr>
    `)
  })

  if (independentResults.length > 0 && crossResults.length > 0) {
    rows.push(`<tr><td colspan="4" style="height:8px; padding:0; border:0;"></td></tr>`)
  }

  crossResults.forEach((result) => {
    const components = result.component_items || []

    if (components.length > 0) {
      components.forEach((item) => {
        rows.push(`
          <tr>
            <td style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; vertical-align:top;"><strong>${escapeHtml(item.sku)} · ${escapeHtml(item.item_description || 'Sin descripción')}</strong></td>
            <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; white-space:nowrap;">${formatNumber(item.physical_stock)}</td>
            <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; white-space:nowrap;">${formatNumber(item.system_stock)}</td>
            <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px; white-space:nowrap;">${resultValue(item.converted_difference)}</td>
          </tr>
        `)
      })
    } else {
      rows.push(`
        <tr>
          <td style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px;"><strong>SKUs: ${escapeHtml((result.component_skus || []).join(', ') || 'sin detalle guardado')}</strong></td>
          <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px;">-</td>
          <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px;">-</td>
          <td align="right" style="padding:7px 8px; border:1px solid ${colors.border}; font-size:12px;">${resultValue(result.final_result)}</td>
        </tr>
      `)
    }

    const totalBackground = Number(result.final_result || 0) < 0 ? '#F6D8D5' : '#DFF2E8'
    rows.push(`
      <tr style="background:${totalBackground};">
        <td style="padding:8px; border:1px solid ${colors.border};"></td>
        <td align="right" style="padding:8px; border:1px solid ${colors.border};">-</td>
        <td style="padding:8px; border:1px solid ${colors.border}; font-size:12px;"><strong>TOTAL DE CRUCE ${escapeHtml(result.cross_name || '-')}</strong></td>
        <td align="right" style="padding:8px; border:1px solid ${colors.border}; font-size:12px; white-space:nowrap;">${resultValue(result.final_result)}</td>
      </tr>
      <tr><td colspan="4" style="height:8px; padding:0; border:0;"></td></tr>
    `)
  })

  if (rows.length === 0) {
    rows.push(`<tr><td colspan="4" style="padding:10px; color:${colors.textSecondary}; font-size:12px;">Sin registros para este bloque.</td></tr>`)
  }

  return rows.join('')
}

function resultsTable(title: string, results: ResultRow[]) {
  return `
    <h3 style="background:${colors.greenDark}; color:${colors.white}; margin:22px 0 0 0; padding:8px 10px; font-size:13px; line-height:1.2; text-transform:uppercase;">${escapeHtml(title)}</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; border:1px solid ${colors.border}; border-top:0;">
      <thead>
        <tr style="background:${colors.greenDark};">
          <th align="left" style="padding:7px 8px; font-size:11px; color:${colors.white}; border:1px solid ${colors.border};">Articulo</th>
          <th align="right" style="padding:7px 8px; font-size:11px; color:${colors.white}; border:1px solid ${colors.border};">Stock fisico</th>
          <th align="right" style="padding:7px 8px; font-size:11px; color:${colors.white}; border:1px solid ${colors.border};">Stock actual</th>
          <th align="right" style="padding:7px 8px; font-size:11px; color:${colors.white}; border:1px solid ${colors.border};">Diferencia</th>
        </tr>
      </thead>
      <tbody>${resultTableRows(results)}</tbody>
    </table>
  `
}

function evidenceImagesHtml(groups: Record<string, string[]>) {
  const orderedGroups = Object.entries(groups).sort(([left], [right]) => {
    const leftIndex = evidenceCategoryOrderIndex(left)
    const rightIndex = evidenceCategoryOrderIndex(right)
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return evidenceCategoryLabel(left).localeCompare(evidenceCategoryLabel(right), 'es')
  })

  if (orderedGroups.length === 0) {
    return table('9. Evidencias', ['Categoria', 'Detalle'], [['Evidencias fotograficas', 'Sin imagenes adjuntas para mostrar.']])
  }

  return `
    <h3 style="background:${colors.greenDark}; color:${colors.white}; margin:22px 0 0 0; padding:8px 10px; font-size:13px; line-height:1.2; text-transform:uppercase;">9. Evidencias</h3>
    ${orderedGroups.map(([category, images]) => `
      <div style="border:1px solid ${colors.border}; border-top:0; padding:10px; margin:0 0 10px 0;">
        <div style="font-size:12px; font-weight:900; color:${colors.greenDark}; text-transform:uppercase; margin-bottom:8px;">${escapeHtml(evidenceCategoryLabel(category))}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
          <tbody>
            ${images.reduce((rows, image, index) => {
              if (index % 2 === 0) rows.push([])
              rows[rows.length - 1].push(image)
              return rows
            }, [] as string[][]).map((row) => `
              <tr>
                <td style="width:50%; padding:6px; vertical-align:top;">${row[0] || ''}</td>
                <td style="width:50%; padding:6px; vertical-align:top;">${row[1] || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  `
}

function statusTable(title: string, rows: string[][]) {
  return table(title, ['Detalle de validaciones', 'Estado'], rows.map(([detail, status]) => [
    escapeHtml(detail),
    `<strong>${escapeHtml(status)}</strong>`,
  ]))
}

function noNoveltiesTable(title: string) {
  return table(title, [title, 'Estado'], [[
    'No se registran novedades.',
    '<strong>OK</strong>',
  ]])
}

function recountSummaryRows(recounts: RecountRow[]) {
  const ok = recounts.filter((row) => row.status === 'Recuento OK').length
  const modified = recounts.filter((row) => row.status === 'Recuento Modificado').length
  return [
    ['Recuento OK', String(ok)],
    ['Recuento Modificado', String(modified)],
    ['Total de recuentos', String(recounts.length)],
  ]
}

function buildHtml(params: {
  report: InventoryReportRow
  results: ResultRow[]
  invoice: InvoiceRow | null
  recounts: RecountRow[]
  finishedProducts: FinishedProductRow[]
  cashClosures: CashClosureRow[]
  observations: ObservationRow[]
  evidenceImages: string
}) {
  const { report, results, invoice, recounts, finishedProducts, cashClosures, observations, evidenceImages } = params
  const visibleResults = results.filter((row) => !isExpenseCross(row.cross_name))
  const surplusResults = visibleResults.filter((row) => row.result_type === 'surplus_without_cross' || row.result_type === 'surplus_cross')
  const shortageResults = visibleResults.filter((row) => row.result_type === 'shortage_without_cross' || row.result_type === 'shortage_cross')
  const observationText = observations.map((row) => row.observation).filter(Boolean).join(' ')

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(buildSubject(report))}</title>
    </head>
    <body style="margin:0; padding:0; background:${colors.cream}; color:${colors.textPrimary}; font-family:Arial, Helvetica, sans-serif;">
      <div style="padding:24px 10px;">
        <div style="max-width:980px; margin:0 auto; background:${colors.white}; border:1px solid ${colors.border}; overflow:hidden;">
          <div style="background:${colors.greenDark}; color:${colors.white}; padding:18px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>
                <td>${renderLogo()}</td>
                <td align="right" style="font-size:13px; color:${colors.creamSoft};">GERENCIA DE AUDITORIA</td>
              </tr>
            </table>
            <h1 style="margin:16px 0 0 0; font-size:22px; line-height:1.25; text-transform:uppercase;">Informe de Visita por Inventario General</h1>
            <p style="margin:8px 0 0 0; color:${colors.creamSoft};">${escapeHtml(report.local_name_snapshot || '-')} (${escapeHtml(report.local_codigo || '-')})</p>
          </div>

          <div style="padding:20px 22px;">
            ${table('Datos principales', ['Campo', 'Detalle'], [
              ['Local', `${escapeHtml(report.local_codigo || '-')} - ${escapeHtml(report.local_name_snapshot || '-')}`],
              ['Codigo local / almacen', escapeHtml(report.local_codigo || '-')],
              ['Corte de Inventario', escapeHtml(report.inventory_cutoff_label || 'Sin corte asignado')],
              ['Fecha inventario', formatDate(report.inventory_date)],
              ['Fecha regularizacion', formatDate(report.front_regularization_date)],
              ['Horario principal', `${formatTime(report.start_time)} - ${formatTime(report.end_time)}`],
              ['Segundo horario', report.has_second_time_range ? `${formatTime(report.second_start_time)} - ${formatTime(report.second_end_time)}` : 'No aplica'],
              ['Auditor encargado', escapeHtml(report.assigned_auditor_name_snapshot || '-')],
              ['Responsable / lider', escapeHtml(report.responsible_name_snapshot || '-')],
            ])}

            ${resultsTable('4.1 Faltantes', shortageResults)}
            ${resultsTable('4.2 Sobrantes', surplusResults)}
            ${table('4.3 Recuento de items - Resumen', ['Detalle', 'Cantidad'], recountSummaryRows(recounts))}
            ${table('4.3 Recuento de items - Detalle', ['SKU', 'Descripcion', 'Conteo inicial', 'Nuevo reconteo', 'Diferencia', 'Estado'], recounts.map((row) => [
              escapeHtml(row.sku || '-'),
              escapeHtml(row.item_description || '-'),
              formatNumber(row.initial_count),
              formatNumber(row.final_recount),
              formatNumber(row.difference),
              escapeHtml(row.status || '-'),
            ]))}
            ${finishedProducts.length > 0
              ? table('4.4 Producto terminado', ['Producto terminado', 'Sistema', 'Fisico', 'Diferencia'], finishedProducts.map((row) => [
                  escapeHtml(row.item_description || '-'),
                  formatNumber(row.system_stock),
                  formatNumber(row.physical_stock),
                  formatNumber(row.difference),
                ]))
              : noNoveltiesTable('4.4 Producto terminado')}
            ${statusTable('5. Validaciones', [
              ['Resultado de inventario general revisado', 'OK'],
              ['Reconteos ingresados y revisados', 'OK'],
              ['Producto terminado revisado', finishedProducts.length > 0 ? 'CON NOVEDAD' : 'OK'],
              ['Cierres de caja revisados', cashClosures.length > 0 ? 'OK' : 'SIN REGISTROS'],
              ['Facturas manuales revisadas', invoice ? 'OK' : 'SIN REGISTROS'],
            ])}
            ${cashClosures.length > 0
              ? table('6. Cierres de caja', ['Caja', 'Numero', 'Cajero', 'Fisico', 'Sistema', 'Diferencia'], cashClosures.map((row) => [
                  escapeHtml(row.cash_register || '-'),
                  escapeHtml(row.cash_register_number || '-'),
                  escapeHtml(row.cashier_name || '-'),
                  formatNumber(row.cash_value),
                  formatNumber(row.system_value),
                  formatNumber(row.cash_difference),
                ]))
              : noNoveltiesTable('6. Cierres de caja')}
            ${invoice ? table('7. Facturas manuales', ['Detalle', 'Numero / fecha'], [
              ['Ultima factura registrada en sistema', String(invoice.last_system_invoice ?? '-')],
              ['Ultima factura en block fisico', String(invoice.last_physical_block_invoice ?? '-')],
              ['Fecha de caducidad del block', formatDate(invoice.block_expiration_date)],
              ['Diferencia calculada', String(invoice.calculated_difference ?? '-')],
            ]) : noNoveltiesTable('7. Facturas manuales')}

            <h3 style="color:${colors.greenDark}; margin:22px 0 8px 0; font-size:16px;">8. Observaciones adicionales</h3>
            <div style="border:1px solid ${colors.border}; border-radius:10px; padding:14px; background:${colors.creamSoft}; font-size:13px; line-height:1.5;">
              ${observationText ? escapeHtml(observationText) : 'Sin observaciones adicionales registradas.'}
            </div>

            ${evidenceImages}

            <div style="margin-top:24px; padding-top:14px; border-top:1px solid ${colors.border}; color:${colors.textSecondary}; font-size:12px;">
              Este correo fue generado automaticamente por el Modulo de Informes de Inventario Sweet & Coffee.
              ${SUPPORT_EMAIL ? `<br>Soporte: ${escapeHtml(SUPPORT_EMAIL)}` : ''}
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function buildInlineEvidenceImages(supabase: ReturnType<typeof createClient>, evidences: EvidenceRow[]) {
  const groups: Record<string, string[]> = {}

  for (const evidence of evidences.filter((item) => isImageEvidence(item) && !item.deleted_after_send).sort(sortEvidencesByReportOrder)) {
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(evidence.file_path, 60 * 60 * 24 * 180)
    if (error || !data?.signedUrl) {
      const key = evidence.category || 'otro'
      groups[key] = [
        ...(groups[key] || []),
        `<div style="border:1px dashed ${colors.border}; padding:10px; color:${colors.textSecondary}; font-size:12px;">No se pudo cargar una imagen de esta categoría.</div>`,
      ]
      continue
    }

    const key = evidence.category || 'otro'
    groups[key] = [
      ...(groups[key] || []),
      `
        <div style="border:1px solid ${colors.border}; padding:6px; background:${colors.white}; text-align:center;">
          <img src="${escapeHtml(data.signedUrl)}" alt="${escapeHtml(evidence.file_name)}" style="display:block; width:100%; max-height:360px; object-fit:contain; margin:0 auto;" />
        </div>
      `,
    ]
  }

  return evidenceImagesHtml(groups)
}

async function buildEmailAttachments(supabase: ReturnType<typeof createClient>, evidences: EvidenceRow[]) {
  const attachments: ResendAttachment[] = []
  const attachedEvidenceIds: string[] = []

  for (const evidence of evidences.filter(shouldAttachEvidence).sort(sortEvidencesByReportOrder)) {
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(evidence.file_path)
    if (error || !data) continue
    const bytes = new Uint8Array(await data.arrayBuffer())
    attachments.push({
      filename: evidence.file_name,
      content: bytesToBase64(bytes),
    })
    attachedEvidenceIds.push(evidence.id)
  }

  return { attachments, attachedEvidenceIds }
}

async function cleanupDeleteAfterSendEvidences(params: {
  supabase: ReturnType<typeof createClient>
  reportId: string
  evidences: EvidenceRow[]
  attachedEvidenceIds: string[]
  sentAt: string
  sentBy: string
}) {
  const { supabase, reportId, evidences, attachedEvidenceIds, sentAt, sentBy } = params
  const attachedIdSet = new Set(attachedEvidenceIds)
  const cleanupCandidates = evidences.filter((evidence) => attachedIdSet.has(evidence.id) && shouldCleanupEvidence(evidence))

  if (attachedEvidenceIds.length > 0) {
    await supabase
      .from('inventory_report_evidences')
      .update({
        attached_to_email: true,
        cleanup_error: null,
      })
      .in('id', attachedEvidenceIds)
  }

  for (const evidence of cleanupCandidates) {
    const logPayload = {
      inventory_report_id: reportId,
      evidence_id: evidence.id,
      file_name: evidence.file_name,
      category: evidence.category,
      file_path: evidence.file_path,
      mime_type: evidence.mime_type,
      size_bytes: evidence.size_bytes === null ? null : Number(evidence.size_bytes),
      attached_to_email: true,
      deleted_after_send: false,
      cleanup_error: null,
      sent_at: sentAt,
      deleted_at: null,
      sent_by: sentBy,
    }

    const { data: logRow } = await supabase
      .from('inventory_email_attachments_log')
      .insert([logPayload])
      .select('id')
      .single()

    const { error: removeError } = await supabase.storage.from(EVIDENCE_BUCKET).remove([evidence.file_path])

    if (removeError) {
      const cleanupError = removeError.message || 'No se pudo eliminar el archivo de Storage.'
      await Promise.all([
        supabase
          .from('inventory_report_evidences')
          .update({
            cleanup_error: cleanupError,
          })
          .eq('id', evidence.id),
        logRow?.id
          ? supabase
              .from('inventory_email_attachments_log')
              .update({
                cleanup_error: cleanupError,
              })
              .eq('id', logRow.id)
          : Promise.resolve(),
      ])
      continue
    }

    const deletedAt = new Date().toISOString()
    await Promise.all([
      supabase
        .from('inventory_report_evidences')
        .update({
          deleted_after_send: true,
          deleted_after_send_at: deletedAt,
          cleanup_error: null,
        })
        .eq('id', evidence.id),
      logRow?.id
        ? supabase
            .from('inventory_email_attachments_log')
            .update({
              deleted_after_send: true,
              deleted_at: deletedAt,
              cleanup_error: null,
            })
            .eq('id', logRow.id)
        : Promise.resolve(),
    ])
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ error: 'Configuración de Supabase incompleta.' }, 500)
  if (!RESEND_API_KEY || !FROM_EMAIL) return jsonResponse({ error: 'Configuración de correo incompleta.' }, 500)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let requestBody: { inventoryReportId?: string; recipients?: unknown } = {}

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'Sesión no válida.' }, 401)

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return jsonResponse({ error: 'Sesión no válida.' }, 401)

    requestBody = await req.json().catch(() => ({}))
    const { inventoryReportId, recipients } = requestBody
    if (!inventoryReportId) return jsonResponse({ error: 'Informe de inventario requerido.' }, 400)

    const [{ data: profile }, { data: accessRow }, { data: report, error: reportError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role, region')
        .eq('id', userData.user.id)
        .single<ProfileRow>(),
      supabase
        .from('inventory_module_access')
        .select('user_id')
        .eq('user_id', userData.user.id)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('inventory_reports')
        .select('id, local_codigo, local_name_snapshot, inventory_cutoff_label, inventory_date, front_regularization_date, start_time, end_time, has_second_time_range, second_start_time, second_end_time, assigned_auditor_id, assigned_auditor_name_snapshot, responsible_name_snapshot, status')
        .eq('id', inventoryReportId)
        .single<InventoryReportRow>(),
    ])

    const hasInventoryAccess = profile?.role === 'super_admin' || Boolean(accessRow);
    if (!profile || !hasInventoryAccess) {
      return jsonResponse({ error: 'No tienes permisos para enviar este informe.' }, 403)
    }
    if (reportError || !report) return jsonResponse({ error: 'Informe de inventario no encontrado.' }, 404)

    const explicitRecipients = Array.isArray(recipients) ? recipients.map(String) : []
    const to = uniqueEmails([
      ...explicitRecipients,
      ...parseEmailList(INVENTORY_TO_EMAILS),
      ...(explicitRecipients.length === 0 && !INVENTORY_TO_EMAILS && profile.email ? [profile.email] : []),
    ])
    const cc = uniqueEmails(parseEmailList(INVENTORY_CC_EMAILS))
    const bcc = uniqueEmails(parseEmailList(INVENTORY_BCC_EMAILS))
    const allRecipients = uniqueEmails([...to, ...cc, ...bcc])

    if (to.length === 0) return jsonResponse({ error: 'No hay destinatarios configurados.' }, 400)

    await supabase
      .from('inventory_reports')
      .update({
        inventory_email_status: 'sending',
        inventory_email_error: null,
        inventory_email_recipients: allRecipients,
        inventory_email_sent_by: userData.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id)

    const [
      itemsResult,
      resultsResult,
      invoiceResult,
      recountsResult,
      finishedResult,
      cashResult,
      observationsResult,
      evidencesResult,
    ] = await Promise.all([
      supabase.from('inventory_report_items').select('sku, item_description, physical_stock, system_stock, difference').eq('inventory_report_id', report.id),
      supabase.from('inventory_report_results').select('result_type, sku, item_description, cross_name, manual_comment, is_manual_adjusted, final_result').eq('inventory_report_id', report.id),
      supabase.from('inventory_manual_invoice_checks').select('last_system_invoice, last_physical_block_invoice, block_expiration_date, calculated_difference').eq('inventory_report_id', report.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('inventory_recounts').select('sku, item_description, initial_count, final_recount, difference, status').eq('inventory_report_id', report.id).order('created_at', { ascending: true }),
      supabase.from('inventory_finished_product_differences').select('item_description, system_stock, physical_stock, difference').eq('inventory_report_id', report.id).order('created_at', { ascending: true }),
      supabase.from('inventory_cash_closures').select('cash_register, cash_register_number, cashier_name, cash_value, system_value, cash_difference').eq('inventory_report_id', report.id).order('created_at', { ascending: true }),
      supabase.from('inventory_additional_observations').select('observation').eq('inventory_report_id', report.id).order('updated_at', { ascending: false }).limit(1),
      supabase.from('inventory_report_evidences').select('id, category, file_name, file_path, mime_type, size_bytes, delete_after_send, attached_to_email, deleted_after_send, cleanup_error').eq('inventory_report_id', report.id).order('uploaded_at', { ascending: true }),
    ])

    const dataError = [itemsResult.error, resultsResult.error, invoiceResult.error, recountsResult.error, finishedResult.error, cashResult.error, observationsResult.error, evidencesResult.error].find(Boolean)
    if (dataError) throw new Error(dataError.message)

    const items = (itemsResult.data || []) as InventoryItemRow[]
    const skus = Array.from(new Set(items.map((item) => normalizeSku(item.sku)).filter(Boolean)))
    const crossesResult = skus.length > 0
      ? await supabase
          .from('inventory_crosses')
          .select('sku, cross_name, conversion_factor, is_active')
          .in('sku', skus)
          .eq('is_active', true)
      : { data: [], error: null }

    if (crossesResult.error) throw new Error(crossesResult.error.message)

    const calculatedResults = calculateResultDetails(items, (crossesResult.data || []) as InventoryCrossRow[])
    const savedResults = (resultsResult.data || []) as ResultRow[]
    const mergedResults = savedResults.length > 0
      ? mergeSavedResultsWithCalculatedDetails(savedResults, calculatedResults)
      : calculatedResults
    const evidences = (evidencesResult.data || []) as EvidenceRow[]
    const [evidenceImages, attachmentResult] = await Promise.all([
      buildInlineEvidenceImages(supabase, evidences),
      buildEmailAttachments(supabase, evidences),
    ])
    const { attachments, attachedEvidenceIds } = attachmentResult
    const subject = buildSubject(report)
    const html = buildHtml({
      report,
      results: mergedResults,
      invoice: ((invoiceResult.data || []) as InvoiceRow[])[0] || null,
      recounts: (recountsResult.data || []) as RecountRow[],
      finishedProducts: (finishedResult.data || []) as FinishedProductRow[],
      cashClosures: (cashResult.data || []) as CashClosureRow[],
      observations: (observationsResult.data || []) as ObservationRow[],
      evidenceImages,
    })

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        cc,
        bcc,
        subject,
        html,
        attachments,
      }),
    })

    const resendData = await resendResponse.json().catch(() => null)
    if (!resendResponse.ok) {
      throw new Error(typeof resendData?.message === 'string' ? resendData.message : 'Resend no pudo enviar el correo.')
    }

    const sentAt = new Date().toISOString()

    await supabase
      .from('inventory_reports')
      .update({
        status: 'finalized',
        inventory_email_sent: true,
        inventory_email_sent_at: sentAt,
        inventory_email_sent_by: userData.user.id,
        inventory_email_recipients: allRecipients,
        inventory_email_status: 'sent',
        inventory_email_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id)

    await cleanupDeleteAfterSendEvidences({
      supabase,
      reportId: report.id,
      evidences,
      attachedEvidenceIds,
      sentAt,
      sentBy: userData.user.id,
    })

    return jsonResponse({ ok: true, message: 'Informe de inventario enviado.', recipients: allRecipients, resend: resendData })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo enviar el informe de inventario.'
    try {
      if (requestBody?.inventoryReportId) {
        await supabase
          .from('inventory_reports')
          .update({
            inventory_email_sent: false,
            inventory_email_status: 'failed',
            inventory_email_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestBody.inventoryReportId)
      }
    } catch {
      // No bloquear la respuesta por error de trazabilidad.
    }
    console.error('send-inventory-report:error', error)
    return jsonResponse({ error: message }, 500)
  }
})

import { createClient } from "npm:@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const FROM_EMAIL = Deno.env.get('INVENTORY_REPORT_FROM_EMAIL') || Deno.env.get('REPORT_FROM_EMAIL') || Deno.env.get('RESEND_FROM') || ''
const INVENTORY_TO_EMAILS = Deno.env.get('INVENTORY_REPORT_TO_EMAILS') || Deno.env.get('REPORT_TO_EMAILS') || Deno.env.get('RESEND_TEST_TO') || ''
const INVENTORY_CC_EMAILS = Deno.env.get('INVENTORY_REPORT_CC_EMAILS') || Deno.env.get('REPORT_CC_EMAILS') || ''
const INVENTORY_BCC_EMAILS = Deno.env.get('INVENTORY_REPORT_BCC_EMAILS') || Deno.env.get('REPORT_BCC_EMAILS') || ''
const WEB_APP_URL = (Deno.env.get('WEB_APP_URL') || '').replace(/\/$/, '')
const REPORT_HORIZONTAL_LOGO_URL = Deno.env.get('REPORT_HORIZONTAL_LOGO_URL') || ''
const REPORT_LOGO_URL = Deno.env.get('REPORT_LOGO_URL') || Deno.env.get('COMPANY_LOGO_URL') || ''
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || ''
const EVIDENCE_BUCKET = 'inventory-report-evidences'

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
  final_result: number | string | null
}

type InvoiceRow = {
  calculated_difference: number | null
}

type RecountRow = {
  status: string | null
}

type CashClosureRow = {
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
  if (isImageEvidence(evidence)) return true
  return isDocumentEvidence(evidence) && evidence.delete_after_send === true
}

function shouldCleanupEvidence(evidence: EvidenceRow) {
  return isDocumentEvidence(evidence) && evidence.delete_after_send === true && !evidence.deleted_after_send
}

function renderLogo() {
  const logoUrl = REPORT_HORIZONTAL_LOGO_URL || REPORT_LOGO_URL
  if (!logoUrl) return `<div style="font-weight:800; font-size:18px; letter-spacing:.02em;">Sweet & Coffee</div>`
  return `<img src="${escapeHtml(logoUrl)}" alt="Sweet & Coffee" style="display:block; width:220px; max-width:100%; height:auto;" />`
}

function metric(label: string, value: string, tone: 'normal' | 'good' | 'bad' = 'normal') {
  const color = tone === 'bad' ? colors.danger : tone === 'good' ? colors.greenDark : colors.textPrimary
  return `
    <td style="width:33.33%; padding:8px;">
      <div style="border:1px solid ${colors.border}; border-radius:10px; background:${colors.creamSoft}; padding:14px;">
        <div style="font-size:12px; color:${colors.textSecondary}; font-weight:700;">${escapeHtml(label)}</div>
        <div style="font-size:22px; color:${color}; font-weight:900; margin-top:6px;">${escapeHtml(value)}</div>
      </div>
    </td>
  `
}

function table(title: string, headers: string[], rows: string[][]) {
  const bodyRows = rows.length > 0
    ? rows.map((row) => `
      <tr>
        ${row.map((cell) => `<td style="padding:8px; border-bottom:1px solid ${colors.border}; font-size:12px;">${cell}</td>`).join('')}
      </tr>
    `).join('')
    : `<tr><td colspan="${headers.length}" style="padding:10px; color:${colors.textSecondary}; font-size:12px;">Sin registros.</td></tr>`

  return `
    <h3 style="color:${colors.greenDark}; margin:22px 0 8px 0; font-size:16px;">${escapeHtml(title)}</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; border:1px solid ${colors.border}; border-radius:10px; overflow:hidden;">
      <thead>
        <tr style="background:${colors.greenSoft};">
          ${headers.map((header) => `<th align="left" style="padding:8px; font-size:12px; color:${colors.greenDark}; border-bottom:1px solid ${colors.border};">${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `
}

function resultRows(results: ResultRow[], positive: boolean) {
  return results
    .filter((row) => positive ? Number(row.final_result || 0) >= 0 : Number(row.final_result || 0) < 0)
    .sort((a, b) => Math.abs(Number(b.final_result || 0)) - Math.abs(Number(a.final_result || 0)))
    .slice(0, 20)
    .map((row) => {
      const label = row.cross_name
        ? `TOTAL DE CRUCE ${escapeHtml(row.cross_name)}`
        : `${escapeHtml(row.sku || '-')} - ${escapeHtml(row.item_description || '-')}`
      const color = isPositive(row.final_result) ? colors.greenDark : colors.danger
      return [label, `<strong style="color:${color};">${formatNumber(row.final_result)}</strong>`]
    })
}

function buildSubject(report: InventoryReportRow) {
  return `INFORME DE INVENTARIO GENERAL LOCAL ${report.local_name_snapshot || 'LOCAL'} (${report.local_codigo || '-'}) - CORTE ${report.inventory_cutoff_label || 'SIN CORTE ASIGNADO'}`
}

function buildHtml(params: {
  report: InventoryReportRow
  results: ResultRow[]
  invoice: InvoiceRow | null
  recounts: RecountRow[]
  cashClosures: CashClosureRow[]
  observations: ObservationRow[]
  appUrl: string
}) {
  const { report, results, invoice, recounts, cashClosures, observations, appUrl } = params
  const surplusTotal = results.reduce((total, row) => total + Math.max(Number(row.final_result || 0), 0), 0)
  const shortageTotal = results.reduce((total, row) => total + Math.min(Number(row.final_result || 0), 0), 0)
  const recountsOk = recounts.filter((row) => row.status === 'Recuento OK').length
  const recountsModified = recounts.filter((row) => row.status === 'Recuento Modificado').length
  const cashDifference = cashClosures.reduce((total, row) => total + Number(row.cash_difference || 0), 0)
  const observationText = observations.map((row) => row.observation).filter(Boolean).join(' ')
  const reportUrl = appUrl ? `${appUrl}/modulos/inventarios/evidencias?inventory_report_id=${encodeURIComponent(report.id)}` : ''

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
      <div style="padding:28px 14px;">
        <div style="max-width:860px; margin:0 auto; background:${colors.white}; border:1px solid ${colors.border}; border-radius:14px; overflow:hidden;">
          <div style="background:${colors.greenDark}; color:${colors.white}; padding:24px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>
                <td>${renderLogo()}</td>
                <td align="right" style="font-size:13px; color:${colors.creamSoft};">GERENCIA DE AUDITORIA</td>
              </tr>
            </table>
            <h1 style="margin:20px 0 0 0; font-size:23px; line-height:1.25;">Informe de Visita por Inventario General</h1>
            <p style="margin:8px 0 0 0; color:${colors.creamSoft};">${escapeHtml(report.local_name_snapshot || '-')} (${escapeHtml(report.local_codigo || '-')})</p>
          </div>

          <div style="padding:26px 28px;">
            <h2 style="color:${colors.greenDark}; margin:0 0 12px 0; font-size:18px;">Datos principales</h2>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border:1px solid ${colors.border}; border-radius:10px; border-collapse:separate; overflow:hidden;">
              <tr><td style="padding:10px; background:${colors.greenSoft}; font-weight:700;">Local</td><td style="padding:10px;">${escapeHtml(report.local_name_snapshot || '-')}</td></tr>
              <tr><td style="padding:10px; background:${colors.greenSoft}; font-weight:700;">Codigo de almacen</td><td style="padding:10px;">${escapeHtml(report.local_codigo || '-')}</td></tr>
              <tr><td style="padding:10px; background:${colors.greenSoft}; font-weight:700;">Corte de Inventario</td><td style="padding:10px;">${escapeHtml(report.inventory_cutoff_label || 'Sin corte asignado')}</td></tr>
              <tr><td style="padding:10px; background:${colors.greenSoft}; font-weight:700;">Fecha de inventario</td><td style="padding:10px;">${formatDate(report.inventory_date)}</td></tr>
              <tr><td style="padding:10px; background:${colors.greenSoft}; font-weight:700;">Fecha de regularizacion</td><td style="padding:10px;">${formatDate(report.front_regularization_date)}</td></tr>
              <tr><td style="padding:10px; background:${colors.greenSoft}; font-weight:700;">Horario</td><td style="padding:10px;">${formatTime(report.start_time)} - ${formatTime(report.end_time)}${report.has_second_time_range ? ` / ${formatTime(report.second_start_time)} - ${formatTime(report.second_end_time)}` : ''}</td></tr>
              <tr><td style="padding:10px; background:${colors.greenSoft}; font-weight:700;">Auditor</td><td style="padding:10px;">${escapeHtml(report.assigned_auditor_name_snapshot || '-')}</td></tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-top:14px;">
              <tr>
                ${metric('Detalle de sobrantes', formatNumber(surplusTotal), 'good')}
                ${metric('Detalle de faltantes', formatNumber(shortageTotal), 'bad')}
                ${metric('Diferencia de caja', formatNumber(cashDifference), cashDifference < 0 ? 'bad' : cashDifference > 0 ? 'good' : 'normal')}
              </tr>
              <tr>
                ${metric('Reconteos OK', String(recountsOk), 'good')}
                ${metric('Reconteos modificados', String(recountsModified), recountsModified > 0 ? 'bad' : 'normal')}
                ${metric('Diferencia facturas', String(invoice?.calculated_difference ?? 0), Number(invoice?.calculated_difference || 0) === 0 ? 'normal' : 'bad')}
              </tr>
            </table>

            ${table('4. Resultados preliminares - Sobrantes', ['Articulo / Cruce', 'Diferencia'], resultRows(results, true))}
            ${table('4. Resultados preliminares - Faltantes', ['Articulo / Cruce', 'Diferencia'], resultRows(results, false))}
            ${table('Reconteos', ['Estado', 'Cantidad'], [['Recuento OK', String(recountsOk)], ['Recuento Modificado', String(recountsModified)]])}

            <h3 style="color:${colors.greenDark}; margin:22px 0 8px 0; font-size:16px;">Observaciones adicionales</h3>
            <div style="border:1px solid ${colors.border}; border-radius:10px; padding:14px; background:${colors.creamSoft}; font-size:13px; line-height:1.5;">
              ${observationText ? escapeHtml(observationText) : 'Sin observaciones adicionales registradas.'}
            </div>

            <p style="margin:22px 0 0 0; color:${colors.textSecondary}; font-size:13px;">
              El detalle completo se encuentra en el informe adjunto o descargable desde la app, segun configuracion.
            </p>
            ${reportUrl ? `<p style="margin:10px 0 0 0;"><a href="${escapeHtml(reportUrl)}" style="display:inline-block; padding:12px 16px; background:${colors.greenDark}; color:${colors.white}; text-decoration:none; border-radius:8px; font-weight:700;">Abrir informe en la app</a></p>` : ''}

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

async function buildEmailAttachments(supabase: ReturnType<typeof createClient>, evidences: EvidenceRow[]) {
  const attachments: ResendAttachment[] = []
  const attachedEvidenceIds: string[] = []

  for (const evidence of evidences.filter(shouldAttachEvidence)) {
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
      resultsResult,
      invoiceResult,
      recountsResult,
      cashResult,
      observationsResult,
      evidencesResult,
    ] = await Promise.all([
      supabase.from('inventory_report_results').select('result_type, sku, item_description, cross_name, final_result').eq('inventory_report_id', report.id),
      supabase.from('inventory_manual_invoice_checks').select('calculated_difference').eq('inventory_report_id', report.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('inventory_recounts').select('status').eq('inventory_report_id', report.id),
      supabase.from('inventory_cash_closures').select('cash_difference').eq('inventory_report_id', report.id),
      supabase.from('inventory_additional_observations').select('observation').eq('inventory_report_id', report.id).order('updated_at', { ascending: false }).limit(1),
      supabase.from('inventory_report_evidences').select('id, category, file_name, file_path, mime_type, size_bytes, delete_after_send, attached_to_email, deleted_after_send, cleanup_error').eq('inventory_report_id', report.id).order('uploaded_at', { ascending: true }),
    ])

    const dataError = [resultsResult.error, invoiceResult.error, recountsResult.error, cashResult.error, observationsResult.error, evidencesResult.error].find(Boolean)
    if (dataError) throw new Error(dataError.message)

    const evidences = (evidencesResult.data || []) as EvidenceRow[]
    const { attachments, attachedEvidenceIds } = await buildEmailAttachments(supabase, evidences)
    const subject = buildSubject(report)
    const html = buildHtml({
      report,
      results: (resultsResult.data || []) as ResultRow[],
      invoice: ((invoiceResult.data || []) as InvoiceRow[])[0] || null,
      recounts: (recountsResult.data || []) as RecountRow[],
      cashClosures: (cashResult.data || []) as CashClosureRow[],
      observations: (observationsResult.data || []) as ObservationRow[],
      appUrl: WEB_APP_URL,
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

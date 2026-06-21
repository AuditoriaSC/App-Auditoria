import { createClient } from "npm:@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const REPORT_FROM_EMAIL = Deno.env.get('REPORT_FROM_EMAIL') || Deno.env.get('RESEND_FROM') || 'Auditorias Sweet & Coffee <onboarding@resend.dev>'
const REPORT_TO_EMAILS = Deno.env.get('REPORT_TO_EMAILS') || Deno.env.get('RESEND_TEST_TO') || ''
const REPORT_CC_EMAILS = Deno.env.get('REPORT_CC_EMAILS') || ''
const REPORT_BCC_EMAILS = Deno.env.get('REPORT_BCC_EMAILS') || ''
const WEB_APP_URL = Deno.env.get('WEB_APP_URL') || ''
const ANDROID_DOWNLOAD_URL = Deno.env.get('ANDROID_DOWNLOAD_URL') || ''
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || ''

const emailColors = {
  greenDark: '#165034',
  green: '#1F6B47',
  greenSoft: '#E7F1EC',
  cream: '#F7F1E7',
  creamSoft: '#FBF8F1',
  coffee: '#6B4A32',
  coffeeDark: '#3A2618',
  white: '#FFFFFF',
  logoWhite: '#EEEEEE',
  border: '#DED2C2',
  textPrimary: '#2B2118',
  textSecondary: '#6B5B4B',
  danger: '#B23B32',
}

type QuestionType = 'compliance' | 'cash_count' | 'pending_deposit' | 'inventory' | 'cup_count' | 'raw_material_count' | 'follow_up' | 'additional_novelty'

type ReportRow = {
  id: string
  region: string | null
  visit_type_id: string | null
  status: string | null
  final_grade: number | null
  final_percentage: number | null
  local_codigo: string | null
  local_code_snapshot: string | null
  local_name_snapshot: string | null
  auditor_name_snapshot: string | null
  responsible_code: string | null
  responsible_name_snapshot: string | null
  start_date: string | null
  start_time: string | null
  end_time: string | null
  should_send: boolean | null
  signature_auditor_url: string | null
  signature_responsible_url: string | null
  auditor_signature_url: string | null
  responsible_signature_url: string | null
  profiles?: { full_name: string | null; email: string | null } | null
  locales?: { nombre_local: string | null } | null
}

type AnswerRow = {
  question_id: string
  value: 'cumple' | 'no_cumple'
  observation: string | null
  evidence_url: string | null
  numeric_value_theoretical: number | null
  numeric_value_physical: number | null
  numeric_value_current: number | null
  numeric_value_previous: number | null
  numeric_items: Array<Record<string, unknown>> | null
  checklist_questions?: {
    question_text: string | null
    score_points: number | null
    question_type: QuestionType | string | null
    is_scored: boolean | null
  } | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return value
}

function formatSentDate() {
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Guayaquil',
  }).format(new Date())
}

function formatTime(value?: string | null) {
  if (!value) return 'Sin hora'
  return String(value).slice(0, 5)
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return ''
  return Number(value).toFixed(2)
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

function reportRecipients(report: ReportRow) {
  const to = parseEmailList(REPORT_TO_EMAILS)
  if (to.length === 0 && report.profiles?.email) {
    to.push(report.profiles.email)
  }

  return {
    to: uniqueEmails(to),
    cc: uniqueEmails(parseEmailList(REPORT_CC_EMAILS)),
    bcc: uniqueEmails(parseEmailList(REPORT_BCC_EMAILS)),
  }
}

function renderFooterLinks() {
  const links = [
    WEB_APP_URL ? `<a href="${escapeHtml(WEB_APP_URL)}" target="_blank" rel="noopener noreferrer" style="color:${emailColors.greenDark}; font-weight:700;">Abrir plataforma</a>` : '',
    ANDROID_DOWNLOAD_URL ? `<a href="${escapeHtml(ANDROID_DOWNLOAD_URL)}" target="_blank" rel="noopener noreferrer" style="color:${emailColors.greenDark}; font-weight:700;">Android</a>` : '',
    SUPPORT_EMAIL ? `<a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:${emailColors.greenDark}; font-weight:700;">Soporte</a>` : '',
  ].filter(Boolean)

  if (links.length === 0) return ''

  return `
    <div style="margin-top:20px; padding-top:14px; border-top:1px solid ${emailColors.border}; color:${emailColors.textSecondary}; font-size:13px;">
      ${links.join(' &nbsp;|&nbsp; ')}
    </div>
  `
}

function questionType(answer: AnswerRow): string {
  return answer.checklist_questions?.question_type || 'compliance'
}

function isCountOnlyType(type: string) {
  return ['inventory', 'raw_material_count'].includes(type)
}

function isScored(answer: AnswerRow) {
  const question = answer.checklist_questions
  if (!question) return true
  if (question.is_scored === false) return false
  return !['follow_up', 'additional_novelty', 'inventory', 'raw_material_count'].includes(question.question_type || '')
}

function pointsFor(answer: AnswerRow) {
  return Number(answer.checklist_questions?.score_points || 0)
}

function obtainedPoints(answer: AnswerRow) {
  return isScored(answer) && answer.value === 'cumple' ? pointsFor(answer) : 0
}

function possiblePoints(answer: AnswerRow) {
  return isScored(answer) ? pointsFor(answer) : 0
}

function imageHtml(url: string | null | undefined, alt: string) {
  if (!url) return ''
  const safeUrl = escapeHtml(url)
  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin:8px 12px 8px 0; text-decoration:none;">
    <img src="${safeUrl}" alt="${escapeHtml(alt)}" style="width:100%; max-width:450px; max-height:350px; object-fit:contain; border:1px solid ${emailColors.border}; border-radius:10px; background:${emailColors.white}; display:block;" />
  </a>`
}

function numericRows(answer: AnswerRow) {
  const items = Array.isArray(answer.numeric_items) ? answer.numeric_items : []

  if (items.length > 0) {
    return items.map((item) => {
      const label = String(item.label ?? item.description ?? item.name ?? 'Item')
      const theoretical = Number(item.theoretical ?? item.system ?? 0)
      const physical = Number(item.physical ?? 0)
      const difference = item.difference !== undefined ? Number(item.difference) : physical - theoretical

      return {
        description: label,
        theoretical,
        physical,
        difference,
      }
    })
  }

  if (answer.numeric_value_theoretical !== null || answer.numeric_value_physical !== null) {
    const theoretical = Number(answer.numeric_value_theoretical || 0)
    const physical = Number(answer.numeric_value_physical || 0)
    return [{
      description: 'Registro',
      theoretical,
      physical,
      difference: physical - theoretical,
    }]
  }

  return []
}

function rawMaterialCrossRows(answer: AnswerRow) {
  const items = Array.isArray(answer.numeric_items) ? answer.numeric_items : []
  const groups = new Map<string, { result: number; items: number }>()

  items.forEach((item) => {
    const groupName = String(item.cross_group ?? item.crossGroup ?? '').trim()
    if (!groupName) return

    const theoretical = Number(item.theoretical ?? item.system ?? 0)
    const physical = Number(item.physical ?? 0)
    const difference = physical - theoretical
    const factor = Number(item.conversion_factor ?? item.conversionFactor ?? 1)
    const current = groups.get(groupName) || { result: 0, items: 0 }

    groups.set(groupName, {
      result: current.result + difference * (Number.isFinite(factor) ? factor : 1),
      items: current.items + 1,
    })
  })

  return Array.from(groups.entries())
    .filter(([, group]) => group.items > 1)
    .map(([description, group]) => ({
      description: `Cruce de ${description}`,
      result: group.result,
    }))
}

function renderNumericTable(title: string, headers: [string, string, string, string], rows: ReturnType<typeof numericRows>) {
  if (rows.length === 0) return ''

  return `
    <p style="margin:10px 0 6px 0; font-weight:700; color:${emailColors.coffeeDark};">${escapeHtml(title)}</p>
    <table style="width:100%; border-collapse:collapse; font-size:15px; margin-bottom:10px;">
      <thead>
        <tr style="background:${emailColors.cream};">
          ${headers.map((header) => `<th style="border:1px solid ${emailColors.border}; padding:9px; text-align:left;">${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td style="border:1px solid ${emailColors.border}; padding:9px;">${escapeHtml(row.description)}</td>
            <td style="border:1px solid ${emailColors.border}; padding:9px;">${formatNumber(row.theoretical)}</td>
            <td style="border:1px solid ${emailColors.border}; padding:9px;">${formatNumber(row.physical)}</td>
            <td style="border:1px solid ${emailColors.border}; padding:9px;">${formatNumber(row.difference)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderCrossTable(title: string, rows: ReturnType<typeof rawMaterialCrossRows>) {
  if (rows.length === 0) return ''

  return `
    <p style="margin:10px 0 6px 0; font-weight:700; color:${emailColors.coffeeDark};">${escapeHtml(title)}</p>
    <table style="width:100%; border-collapse:collapse; font-size:15px; margin-bottom:10px;">
      <thead>
        <tr style="background:${emailColors.cream};">
          <th style="border:1px solid ${emailColors.border}; padding:9px; text-align:left;">Cruce</th>
          <th style="border:1px solid ${emailColors.border}; padding:9px; text-align:left;">Resultado</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td style="border:1px solid ${emailColors.border}; padding:9px;">${escapeHtml(row.description)}</td>
            <td style="border:1px solid ${emailColors.border}; padding:9px;">${formatNumber(row.result)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderDepositData(answer: AnswerRow) {
  if (answer.numeric_value_current === null && answer.numeric_value_previous === null) return ''

  return `
    <div style="font-size:13px; background:${emailColors.creamSoft}; border:1px solid ${emailColors.border}; border-radius:6px; padding:8px; margin-top:8px;">
      <div><strong>Turno actual:</strong> ${formatNumber(answer.numeric_value_current)}</div>
      <div><strong>Turno anterior:</strong> ${formatNumber(answer.numeric_value_previous)}</div>
    </div>
  `
}

function renderQuestionDetail(answer: AnswerRow, index: number) {
  const type = questionType(answer)
  const questionText = answer.checklist_questions?.question_text || 'Pregunta'
  const result = answer.value === 'cumple' ? 'SI CUMPLE' : 'NO CUMPLE'
  const resultColor = answer.value === 'cumple' ? emailColors.greenDark : emailColors.danger
  const evidence = imageHtml(answer.evidence_url, `Evidencia pregunta ${index + 1}`)
  const rows = numericRows(answer)
  let numericBlock = ''

  if (type === 'follow_up') {
    return `
      <div style="border:1px solid ${emailColors.border}; border-radius:8px; padding:12px; margin-bottom:10px; background:${answer.value === 'cumple' ? emailColors.white : emailColors.creamSoft};">
        <p style="margin:0 0 6px 0; font-weight:700; color:${emailColors.textPrimary};">${index + 1}. ${escapeHtml(questionText)}: <span style="color:${resultColor};">${result}</span></p>
        <p style="margin:0 0 6px 0;"><strong>Observaciones:</strong> ${escapeHtml(answer.observation || 'Sin observaciones')}</p>
        ${evidence ? `<div style="margin-top:8px;"><strong>Evidencias:</strong><br/>${evidence}</div>` : ''}
      </div>
    `
  }

  if (isCountOnlyType(type)) {
    const countTitle = type === 'raw_material_count' ? 'Materias primas' : 'Inventario'
    const countBlock = renderNumericTable(countTitle, ['Descripcion', 'Sistema', 'Fisico', 'Diferencia'], rows)
    const crossBlock = type === 'raw_material_count'
      ? renderCrossTable('Cruces aplicables', rawMaterialCrossRows(answer))
      : ''

    return `
      <div style="border:1px solid ${emailColors.border}; border-radius:8px; padding:12px; margin-bottom:10px; background:${emailColors.white};">
        <p style="margin:0 0 6px 0; font-weight:700; color:${emailColors.textPrimary};">${index + 1}. ${escapeHtml(questionText)}</p>
        <p style="margin:0 0 4px 0;"><strong>Resultado:</strong> No aplica</p>
        ${countBlock || `<p style="margin:0 0 6px 0; color:${emailColors.textSecondary};">Sin conteos registrados.</p>`}
        ${crossBlock}
        <p style="margin:0 0 6px 0;"><strong>Observaciones:</strong> ${escapeHtml(answer.observation || 'Sin observaciones')}</p>
        ${evidence ? `<div style="margin-top:8px;"><strong>Evidencias:</strong><br/>${evidence}</div>` : ''}
      </div>
    `
  }

  if (type === 'cash_count') {
    numericBlock = renderNumericTable('Arqueo de caja', ['Concepto', 'Sistema', 'Físico', 'Diferencia'], rows)
  } else if (type === 'pending_deposit') {
    numericBlock = renderDepositData(answer)
  } else if (type === 'inventory') {
    numericBlock = renderNumericTable('Inventario', ['Descripción', 'Sistema', 'Físico', 'Diferencia'], rows)
  } else if (type === 'cup_count') {
    numericBlock = renderNumericTable('Vasos desechables', ['Descripción', 'Sistema', 'Físico', 'Diferencia'], rows)
  } else if (type === 'raw_material_count') {
    numericBlock = renderNumericTable('Materias primas', ['Descripción', 'Sistema', 'Físico', 'Diferencia'], rows)
  }

  return `
    <div style="border:1px solid ${emailColors.border}; border-radius:8px; padding:12px; margin-bottom:10px; background:${answer.value === 'cumple' ? emailColors.white : emailColors.creamSoft};">
      <p style="margin:0 0 6px 0; font-weight:700; color:${emailColors.textPrimary};">${index + 1}. ${escapeHtml(questionText)}</p>
      <p style="margin:0 0 4px 0;"><strong>Resultado:</strong> <span style="color:${resultColor}; font-weight:700;">${result}</span></p>
      <p style="margin:0 0 4px 0;"><strong>Puntaje:</strong> ${formatNumber(obtainedPoints(answer))} / ${formatNumber(possiblePoints(answer))}</p>
      <p style="margin:0 0 6px 0;"><strong>Observaciones:</strong> ${escapeHtml(answer.observation || 'Sin observaciones')}</p>
      ${numericBlock}
      ${evidence ? `<div style="margin-top:8px;"><strong>Evidencias:</strong><br/>${evidence}</div>` : ''}
    </div>
  `
}

function renderNoveltySection(answers: AnswerRow[]) {
  const novelties = answers.filter((answer) => questionType(answer) === 'additional_novelty' && ((answer.observation || '').trim() || answer.evidence_url))

  if (novelties.length === 0) {
    return `<p style="margin:0; color:${emailColors.textSecondary};">Sin novedades adicionales.</p>`
  }

  return novelties.map((answer, index) => `
    <div style="border:1px solid ${emailColors.border}; border-radius:8px; padding:16px; margin-bottom:10px;">
      <p style="margin:0 0 6px 0;"><strong>Novedad ${index + 1}:</strong> ${escapeHtml(answer.observation || 'Sin texto')}</p>
      ${imageHtml(answer.evidence_url, `Novedad ${index + 1}`)}
    </div>
  `).join('')
}

function buildHeaderTable(report: ReportRow, scoreText: string) {
  const local = report.local_name_snapshot || report.locales?.nombre_local || report.local_codigo || 'Sin local'
  const localWithCode = report.local_code_snapshot ? `${report.local_code_snapshot} · ${local}` : local
  const responsible = report.responsible_code
    ? `${report.responsible_code} · ${report.responsible_name_snapshot || 'Responsable'}`
    : report.responsible_name_snapshot || 'Responsable'

  const rows = [
    ['Local', localWithCode],
    ['Fecha', formatDate(report.start_date)],
    ['Auditor', report.auditor_name_snapshot || report.profiles?.full_name || 'Auditor'],
    ['Hora Inicio', formatTime(report.start_time)],
    ['Responsable Auditado', responsible],
    ['Hora de Término', formatTime(report.end_time)],
    ['Calificación', scoreText],
  ]

  return `
    <table style="width:100%; border-collapse:collapse; margin:14px 0 18px 0; font-size:16px;">
      <tbody>
        ${rows.map(([label, value]) => `
          <tr>
            <td style="width:38%; border:1px solid ${emailColors.border}; padding:8px; background:${emailColors.cream}; font-weight:700;">${escapeHtml(label)}</td>
            <td style="border:1px solid ${emailColors.border}; padding:8px;">${escapeHtml(value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reportId } = await req.json()
    if (!reportId) throw new Error('Falta el parametro reportId obligatorio.')
    console.log('finalize-report:start', { reportId })

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno.')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: report, error: errReport } = await supabase
      .from('audit_reports')
      .select('id, region, visit_type_id, status, final_grade, final_percentage, local_codigo, local_code_snapshot, local_name_snapshot, auditor_name_snapshot, responsible_code, responsible_name_snapshot, start_date, start_time, end_time, should_send, signature_auditor_url, signature_responsible_url, auditor_signature_url, responsible_signature_url, profiles(full_name, email), locales(nombre_local)')
      .eq('id', reportId)
      .single<ReportRow>()

    if (errReport || !report) throw new Error(`Reporte no encontrado: ${errReport?.message}`)
    const recipients = reportRecipients(report)
    console.log('finalize-report:report-loaded', {
      reportId,
      shouldSend: report.should_send,
      to: recipients.to,
      cc: recipients.cc,
      bccCount: recipients.bcc.length,
      visitType: report.visit_type_id,
    })

    if (report.should_send !== true) {
      console.log('finalize-report:skip-send', { reportId, shouldSend: report.should_send })
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        message: 'Reporte consolidado sin envio de correo.',
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 200,
      })
    }

    if (!RESEND_API_KEY) {
      throw new Error('CONFIG_RESEND_API_KEY')
    }

    if (recipients.to.length === 0) {
      throw new Error('CONFIG_REPORT_TO_EMAILS')
    }

    const { data: answers, error: errAnswers } = await supabase
      .from('audit_answers_final')
      .select('question_id, value, observation, evidence_url, numeric_value_theoretical, numeric_value_physical, numeric_value_current, numeric_value_previous, numeric_items, checklist_questions(question_text, score_points, question_type, is_scored)')
      .eq('report_id', reportId)

    if (errAnswers) throw new Error(`Error leyendo respuestas: ${errAnswers.message}`)

    const finalAnswers = (answers || []) as AnswerRow[]
    const obtained = finalAnswers.reduce((total, answer) => total + obtainedPoints(answer), 0)
    const possible = finalAnswers.reduce((total, answer) => total + possiblePoints(answer), 0)
    const scoreText = `${formatNumber(obtained)} / ${formatNumber(possible)} puntos`
    const visitType = report.visit_type_id || 'Visita'
    const localName = report.local_name_snapshot || report.locales?.nombre_local || report.local_codigo || 'Local'
    const localCode = report.local_code_snapshot || report.local_codigo || ''
    const sentDate = formatSentDate()
    const subject = `REPORTE DE VISITA ${visitType.toUpperCase()} LOCAL ${localName.toUpperCase()}${localCode ? ` ${localCode.toUpperCase()}` : ''} ENVIADO EL ${sentDate}`
    const auditorSignatureUrl = report.auditor_signature_url || report.signature_auditor_url
    const responsibleSignatureUrl = report.responsible_signature_url || report.signature_responsible_url

    const questionDetails = finalAnswers
      .filter((answer) => questionType(answer) !== 'additional_novelty')
      .map(renderQuestionDetail)
      .join('')

    const emailHtmlBody = `
      <div style="font-family:Arial, sans-serif; color:${emailColors.textPrimary}; max-width:1080px; margin:0 auto; background:${emailColors.creamSoft}; padding:30px; font-size:16px; line-height:1.55;">
        <div style="background:${emailColors.greenDark}; color:${emailColors.logoWhite}; border-radius:12px 12px 0 0; padding:22px 28px;">
          <p style="margin:0 0 6px 0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; font-weight:700;">Sweet & Coffee</p>
          <h2 style="margin:0; font-size:22px; color:${emailColors.white};">Reporte de visita ${escapeHtml(visitType)}</h2>
          <p style="margin:8px 0 0 0; color:${emailColors.logoWhite};">${escapeHtml(localName)}${localCode ? ` · ${escapeHtml(localCode)}` : ''} · ${scoreText}</p>
        </div>
        <div style="background:${emailColors.white}; border:1px solid ${emailColors.border}; border-top:0; border-radius:0 0 12px 12px; padding:28px;">
          <p style="margin:0 0 12px 0;">Buen Día Estimados,</p>
          <p style="margin:0 0 12px 0;">A continuación se presenta el resultado de la visita ${escapeHtml(visitType)} realizada:</p>

          ${buildHeaderTable(report, scoreText)}

          <h3 style="margin:18px 0 10px 0; color:${emailColors.greenDark};">Detalle de preguntas</h3>
          ${questionDetails || '<p>Sin respuestas registradas.</p>'}

          <h3 style="margin:18px 0 10px 0; color:${emailColors.greenDark};">Otras novedades</h3>
          ${renderNoveltySection(finalAnswers)}

          <h3 style="margin:18px 0 10px 0; color:${emailColors.greenDark};">Firmas</h3>
          <table style="width:100%; border-collapse:collapse; font-size:16px;">
            <tr>
              <td style="width:50%; vertical-align:top; border:1px solid ${emailColors.border}; padding:16px;">
                <strong>Firma Auditor:</strong><br/>
                ${imageHtml(auditorSignatureUrl, 'Firma auditor') || '<p>Sin firma</p>'}
                <p style="margin:6px 0 0 0;">${escapeHtml(report.auditor_name_snapshot || report.profiles?.full_name || 'Auditor')}</p>
              </td>
              <td style="width:50%; vertical-align:top; border:1px solid ${emailColors.border}; padding:16px;">
                <strong>Firma Responsable:</strong><br/>
                ${responsibleSignatureUrl ? imageHtml(responsibleSignatureUrl, 'Firma responsable') : `<p style="font-weight:700; color:${emailColors.textSecondary};">Sin firma del responsable</p>`}
                <p style="margin:6px 0 0 0;">${escapeHtml(report.responsible_code ? `${report.responsible_code} · ${report.responsible_name_snapshot || 'Responsable'}` : report.responsible_name_snapshot || 'Responsable')}</p>
              </td>
            </tr>
          </table>

          <p style="margin:18px 0 0 0;"><strong>Enviar:</strong> ${report.should_send ? 'SI' : 'NO'}</p>
          ${renderFooterLinks()}
        </div>
      </div>
    `

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: REPORT_FROM_EMAIL,
        to: recipients.to,
        cc: recipients.cc.length > 0 ? recipients.cc : undefined,
        bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
        subject,
        html: emailHtmlBody,
      }),
    })

    const resendData = await resendResponse.json()
    console.log('finalize-report:resend-response', {
      status: resendResponse.status,
      ok: resendResponse.ok,
      data: resendData,
    })
    if (!resendResponse.ok) {
      console.error('finalize-report:resend-error', { status: resendResponse.status, data: resendData })
      throw new Error('RESEND_SEND_FAILED')
    }

    return new Response(JSON.stringify({ success: true, data: resendData, recipients: { to: recipients.to, cc: recipients.cc, bccCount: recipients.bcc.length } }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('finalize-report:error', { message })
    const friendlyMessage =
      message === 'CONFIG_RESEND_API_KEY'
        ? 'No se pudo enviar el correo porque falta configurar Resend.'
        : message === 'CONFIG_REPORT_TO_EMAILS'
          ? 'No se pudo enviar el correo porque no hay destinatarios configurados.'
          : message === 'RESEND_SEND_FAILED'
            ? 'No se pudo enviar el correo. Revisa la configuracion de Resend.'
            : 'No se pudo consolidar el reporte. Intenta nuevamente.'

    return new Response(JSON.stringify({ success: false, error: friendlyMessage }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 500,
    })
  }
})


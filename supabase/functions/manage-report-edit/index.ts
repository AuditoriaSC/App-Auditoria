import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' }

type Answer = { report_id: string; question_id: string; value: string | null; observation?: string | null; evidence_url?: string | null; numeric_value_theoretical?: number | null; numeric_value_physical?: number | null; numeric_value_current?: number | null; numeric_value_previous?: number | null; numeric_items?: unknown[] | null }
type Profile = { id: string; role: string; region: string | null; is_active: boolean }
type Report = { id: string; user_id: string | null; region: string; should_send: boolean | null; resent_count: number | null }

const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: cors })
const isScored = (question: { is_scored: boolean | null; question_type: string | null }) => question.is_scored !== false && !['follow_up', 'additional_novelty', 'inventory', 'raw_material_count'].includes(question.question_type || '')

function score(answers: Answer[], questions: Map<string, { score_points: number; is_scored: boolean | null; question_type: string | null }>) {
  let obtained = 0
  let possible = 0
  for (const answer of answers) {
    const question = questions.get(answer.question_id)
    if (!question || !isScored(question)) continue
    const points = Number(question.score_points || 0)
    possible += points
    if (answer.value === 'cumple') obtained += points
  }
  return { obtained, possible, percentage: possible > 0 ? Math.round(obtained / possible * 10000) / 100 : 0, grade: possible > 0 ? Math.round(obtained / possible * 1000) / 100 : 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return respond({ error: 'Metodo no permitido.' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return respond({ error: 'Configuracion incompleta.' }, 500)

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return respond({ error: 'Sesion no valida.' }, 401)

    const { data: caller } = await admin.from('profiles').select('id, role, region, is_active').eq('id', userData.user.id).single<Profile>()
    if (!caller?.is_active) return respond({ error: 'Usuario no autorizado.' }, 403)

    const body = await req.json()
    const action = String(body?.action || 'submit')

    if (action === 'review') {
      const approvalId = String(body?.approvalId || '')
      const decision = String(body?.decision || '')
      if (!approvalId || !['approved', 'rejected'].includes(decision)) return respond({ error: 'Revision incompleta.' }, 400)

      const { data: approval } = await admin.from('audit_edit_approvals').select('*').eq('id', approvalId).single()
      if (!approval || approval.status !== 'pending') return respond({ error: 'Solicitud no disponible.' }, 409)
      const { data: report } = await admin.from('audit_reports').select('id, user_id, region, should_send, resent_count').eq('id', approval.audit_report_id).single<Report>()
      const canReview = report && ['admin', 'super_admin'].includes(caller.role) && (caller.role === 'super_admin' || caller.region === 'Global' || caller.region === report.region)
      if (!canReview || approval.requested_by === caller.id) return respond({ error: 'No puedes revisar esta solicitud.' }, 403)

      if (decision === 'rejected') {
        await admin.from('audit_edit_approvals').update({ status: 'rejected', approved_by: caller.id, admin_comment: String(body?.adminComment || ''), reviewed_at: new Date().toISOString() }).eq('id', approvalId)
        return respond({ ok: true, status: 'rejected' })
      }

      const payload = Array.isArray(approval.change_payload) ? approval.change_payload as Answer[] : []
      const summary = Array.isArray(approval.change_summary) ? approval.change_summary as { question_id?: string; old_value?: string | null }[] : []
      const { data: latestRows } = await admin.from('audit_answers_final').select('question_id, value').eq('report_id', report!.id)
      const latest = new Map((latestRows || []).map((item) => [item.question_id, item.value]))
      if (summary.some((item) => item.question_id && latest.get(item.question_id) !== item.old_value)) {
        return respond({ error: 'La visita cambio despues de la solicitud. Cancela esta solicitud y genera una nueva.' }, 409)
      }
      const questionIds = payload.map((item) => item.question_id)
      const { data: questionRows } = await admin.from('checklist_questions').select('id, score_points, is_scored, question_type').in('id', questionIds)
      const questions = new Map((questionRows || []).map((item) => [item.id, item]))
      const result = score(payload, questions)
      const now = new Date().toISOString()
      const { error: answersError } = await admin.from('audit_answers_final').upsert(payload.map((item) => ({ ...item, created_at: now })), { onConflict: 'report_id,question_id' })
      if (answersError) throw answersError
      await admin.from('audit_reports').update({ final_percentage: result.percentage, final_grade: result.grade, edited_after_send: true, last_edited_at: now, last_edited_by: caller.id, last_edit_reason: approval.reason, updated_at: now }).eq('id', report!.id)
      await admin.from('audit_edit_approvals').update({ status: 'approved', approved_by: caller.id, admin_comment: String(body?.adminComment || ''), reviewed_at: now, new_score: result.grade }).eq('id', approvalId)
      return respond({ ok: true, status: 'approved', shouldResend: report?.should_send === true, reportId: report?.id, region: report?.region, resentCount: report?.resent_count || 0 })
    }

    const reportId = String(body?.reportId || '')
    const reason = String(body?.reason || '').trim()
    const payload = Array.isArray(body?.answers) ? body.answers as Answer[] : []
    if (!reportId || !reason || payload.length === 0) return respond({ error: 'Ingresa el motivo y los cambios.' }, 400)
    const { data: report } = await admin.from('audit_reports').select('id, user_id, region, should_send, resent_count').eq('id', reportId).single<Report>()
    if (!report) return respond({ error: 'Visita no encontrada.' }, 404)
    const canEdit = report.user_id === caller.id || caller.role === 'super_admin' || caller.region === 'Global' || (caller.role === 'admin' && caller.region === report.region)
    if (!canEdit) return respond({ error: 'No tienes acceso a esta visita.' }, 403)

    const questionIds = payload.map((item) => item.question_id)
    const [{ data: currentRows }, { data: questionRows }] = await Promise.all([
      admin.from('audit_answers_final').select('*').eq('report_id', reportId),
      admin.from('checklist_questions').select('id, question_text, score_points, is_scored, question_type').in('id', questionIds),
    ])
    const current = new Map(((currentRows || []) as Answer[]).map((item) => [item.question_id, item]))
    const questions = new Map((questionRows || []).map((item) => [item.id, item]))
    const relevant = payload.filter((item) => {
      const question = questions.get(item.question_id)
      return question && isScored(question) && current.get(item.question_id)?.value !== item.value
    })
    const oldResult = score((currentRows || []) as Answer[], questions)
    const newResult = score(payload, questions)

    if (relevant.length > 0 || oldResult.grade !== newResult.grade) {
      const summary = relevant.map((item) => ({ question_id: item.question_id, question: questions.get(item.question_id)?.question_text, old_value: current.get(item.question_id)?.value, new_value: item.value }))
      const first = summary[0]
      const { data: created, error: createError } = await admin.from('audit_edit_approvals').insert({ audit_report_id: reportId, question_id: first?.question_id || null, requested_by: caller.id, status: 'pending', change_type: 'scored_answer_change', old_value: first?.old_value || null, new_value: first?.new_value || null, old_score: oldResult.grade, new_score: newResult.grade, reason, change_payload: payload, change_summary: summary }).select('id').single()
      if (createError) throw createError
      return respond({ ok: true, pending: true, approvalId: created?.id, message: 'Este cambio modifica la calificacion y requiere autorizacion de un administrador antes de aplicarse.' })
    }

    const now = new Date().toISOString()
    const { error: updateError } = await admin.from('audit_answers_final').upsert(payload.map((item) => ({ ...item, created_at: now })), { onConflict: 'report_id,question_id' })
    if (updateError) throw updateError
    await admin.from('audit_reports').update({ edited_after_send: report.should_send === true, last_edited_at: now, last_edited_by: caller.id, last_edit_reason: reason, updated_at: now }).eq('id', reportId)
    return respond({ ok: true, applied: true, shouldResend: report.should_send === true, resentCount: report.resent_count || 0 })
  } catch (error) {
    console.error('manage-report-edit:error', error)
    return respond({ error: 'No se pudo procesar la edicion.' }, 500)
  }
})

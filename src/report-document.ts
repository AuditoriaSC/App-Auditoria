import { Platform } from 'react-native';
import { signedEvidenceUrl } from './evidenceStorage';
import { supabase } from './supabaseClient';

const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Storage conserva rutas estables, no URLs firmadas. Cada consulta genera URLs
 * nuevas por 180 dias; por eso una evidencia antigua sigue recuperable mientras
 * el objeto exista y el usuario conserve acceso legitimo a la visita.
 */
export async function buildReportDocumentHtml(reportId: string) {
  const [{ data: report, error: reportError }, { data: answers, error: answersError }, { data: detailRows, error: detailRowsError }] = await Promise.all([
    supabase.from('audit_reports').select('id, region, visit_type_id, local_name_snapshot, local_code_snapshot, auditor_name_snapshot, responsible_name_snapshot, start_date, start_time, end_time, final_grade, final_percentage, local_final_grade, leader_final_grade, signature_auditor_url, signature_responsible_url, auditor_signature_url, responsible_signature_url, edited_after_send, last_edit_reason, resent_count, updated_at').eq('id', reportId).single(),
    supabase.from('audit_answers_final').select('question_id, value, local_compliance, leader_compliance, observation, evidence_url, evidence_urls, numeric_value_theoretical, numeric_value_physical, numeric_value_current, numeric_value_previous, numeric_items, checklist_questions(question_text, sort_order, question_type, dual_compliance)').eq('report_id', reportId),
    supabase.from('audit_answer_detail_rows').select('question_id, row_kind, sort_order, lot_date, writeoff_date, description, quantity, record_date, notebook_amount, system_amount, responsible_code_snapshot, responsible_name_snapshot').eq('report_id', reportId).not('final_answer_id', 'is', null),
  ]);
  if (reportError || !report) throw new Error('No se pudo cargar el informe.');
  if (answersError) throw new Error('No se pudieron cargar las respuestas.');
  if (detailRowsError) throw new Error('No se pudieron cargar las tablas del informe.');

  const signedAnswers = await Promise.all((answers || []).map(async (answer) => {
    const references = Array.isArray(answer.evidence_urls) && answer.evidence_urls.length > 0 ? answer.evidence_urls : answer.evidence_url ? [answer.evidence_url] : [];
    return { ...answer, evidences: await Promise.all(references.map((reference) => signedEvidenceUrl(String(reference), SIX_MONTHS_SECONDS))) };
  }));
  signedAnswers.sort((a, b) => Number((a.checklist_questions as any)?.sort_order ?? 9999) - Number((b.checklist_questions as any)?.sort_order ?? 9999));
  const auditorSignature = report.auditor_signature_url || report.signature_auditor_url;
  const responsibleSignature = report.responsible_signature_url || report.signature_responsible_url;
  const [auditorSignatureUrl, responsibleSignatureUrl] = await Promise.all([
    auditorSignature ? signedEvidenceUrl(auditorSignature, SIX_MONTHS_SECONDS) : Promise.resolve(null),
    responsibleSignature ? signedEvidenceUrl(responsibleSignature, SIX_MONTHS_SECONDS) : Promise.resolve(null),
  ]);

  const rows = signedAnswers.map((answer, index) => {
    const question = (answer.checklist_questions as any)?.question_text || `Pregunta ${index + 1}`;
    const dual = (answer.checklist_questions as any)?.dual_compliance === true;
    const answerRows = (detailRows || []).filter((row) => row.question_id === answer.question_id).sort((left, right) => left.sort_order - right.sort_order);
    const productRows = answerRows.filter((row) => row.row_kind === 'product_writeoff');
    const depositRows = answerRows.filter((row) => row.row_kind === 'deposit_declaration');
    const responsible = (row: any) => row.responsible_code_snapshot ? `${row.responsible_code_snapshot} · ${row.responsible_name_snapshot}` : row.responsible_name_snapshot;
    const productTable = productRows.length > 0
      ? `<table><thead><tr><th>Fecha lote</th><th>Fecha baja</th><th>Descripción</th><th>Cantidad</th><th>Responsable</th></tr></thead><tbody>${productRows.map((row) => `<tr><td>${escapeHtml(row.lot_date)}</td><td>${escapeHtml(row.writeoff_date)}</td><td>${escapeHtml(row.description)}</td><td>${Number(row.quantity || 0).toFixed(2)}</td><td>${escapeHtml(responsible(row))}</td></tr>`).join('')}</tbody></table>`
      : '';
    const depositTable = depositRows.length > 0
      ? `<table><thead><tr><th>Fecha</th><th>Registro cuaderno</th><th>Declarado sistema</th><th>Responsable</th></tr></thead><tbody>${depositRows.map((row) => `<tr><td>${escapeHtml(row.record_date)}</td><td>$ ${Number(row.notebook_amount || 0).toFixed(2)}</td><td>$ ${Number(row.system_amount || 0).toFixed(2)}</td><td>${escapeHtml(responsible(row))}</td></tr>`).join('')}</tbody></table>`
      : '';
    const compliance = dual
      ? `<p><strong>Cumplimiento del Local:</strong> ${(answer.local_compliance || answer.value) === 'cumple' ? 'Cumple' : 'No cumple'}</p><p><strong>Cumplimiento del Líder:</strong> ${answer.leader_compliance === 'cumple' ? 'Cumple' : answer.leader_compliance === 'no_cumple' ? 'No cumple' : 'Sin información'}</p>`
      : `<p><strong>Respuesta:</strong> ${escapeHtml(answer.value === 'cumple' ? 'Cumple' : answer.value === 'no_cumple' ? 'No cumple' : answer.value)}</p>`;
    const evidenceHtml = answer.evidences.map((reference, evidenceIndex) => `<img src="${escapeHtml(reference)}" alt="Evidencia ${evidenceIndex + 1}" />`).join('');
    return `<section><h3>${index + 1}. ${escapeHtml(question)}</h3>${compliance}${answer.observation ? `<p><strong>Observación:</strong> ${escapeHtml(answer.observation)}</p>` : ''}${productTable}${depositTable}${evidenceHtml}</section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Informe ${escapeHtml(report.local_name_snapshot)}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#2B2118;line-height:1.45}header{background:#165034;color:white;padding:18px;border-radius:10px}h1{margin:0;font-size:22px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:18px 0;padding:12px;background:#FBF8F1}section{break-inside:avoid;border:1px solid #DED2C2;border-radius:8px;padding:12px;margin:10px 0}section h3{color:#165034;font-size:15px;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}th,td{border:1px solid #DED2C2;padding:5px;text-align:left}th{background:#F7F1E7}img{display:block;max-width:520px;max-height:360px;margin:10px auto;border-radius:6px}.signatures{display:flex;gap:20px;margin-top:18px}.signature{width:50%;text-align:center}.signature img{max-height:120px}</style></head><body><header><h1>Informe de visita ${escapeHtml(report.visit_type_id)}</h1><div>${escapeHtml(report.local_name_snapshot)} · ${escapeHtml(report.local_code_snapshot)}</div></header><div class="meta"><div><strong>Auditor:</strong> ${escapeHtml(report.auditor_name_snapshot)}</div><div><strong>Responsable:</strong> ${escapeHtml(report.responsible_name_snapshot)}</div><div><strong>Fecha:</strong> ${escapeHtml(report.start_date)}</div><div><strong>Horario:</strong> ${escapeHtml(report.start_time)} - ${escapeHtml(report.end_time)}</div><div><strong>Calificación del Local:</strong> ${Number(report.local_final_grade ?? report.final_grade ?? 0).toFixed(2)} / 10</div><div><strong>Calificación del Líder:</strong> ${report.leader_final_grade == null ? 'Sin información' : `${Number(report.leader_final_grade).toFixed(2)} / 10`}</div></div>${rows}<div class="signatures"><div class="signature"><strong>Firma auditor</strong>${auditorSignatureUrl ? `<img src="${escapeHtml(auditorSignatureUrl)}" />` : '<p>Sin firma</p>'}</div><div class="signature"><strong>Firma responsable</strong>${responsibleSignatureUrl ? `<img src="${escapeHtml(responsibleSignatureUrl)}" />` : '<p>Sin firma</p>'}</div></div>${report.edited_after_send ? `<p><strong>Editado:</strong> ${escapeHtml(report.last_edit_reason)} · Reenvíos: ${Number(report.resent_count || 0)}</p>` : ''}</body></html>`;
}

export async function downloadReportPdf(reportId: string) {
  if (Platform.OS !== 'web') {
    throw new Error('La descarga PDF está disponible desde la Web. En APK puedes consultar la visita y sus evidencias.');
  }
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Permite ventanas emergentes para generar el PDF.');
  popup.document.write('<p style="font-family:Arial;padding:24px">Preparando informe...</p>');
  try {
    const html = await buildReportDocumentHtml(reportId);
    popup.document.open(); popup.document.write(html); popup.document.close();
    window.setTimeout(() => { popup.focus(); popup.print(); }, 700);
  } catch (error) {
    popup.close(); throw error;
  }
}

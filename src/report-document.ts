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
      ? `<table><thead><tr><th>Fecha</th><th>Cuaderno</th><th>Sistema</th><th>Líder</th></tr></thead><tbody>${depositRows.map((row) => `<tr><td>${escapeHtml(row.record_date)}</td><td>$ ${Number(row.notebook_amount || 0).toFixed(2)}</td><td>$ ${Number(row.system_amount || 0).toFixed(2)}</td><td>${escapeHtml(responsible(row))}</td></tr>`).join('')}</tbody></table>`
      : '';
    const localCompliance = answer.local_compliance || answer.value;
    const compliance = dual
      ? `<div class="answer-summary"><span><strong>Local:</strong> <b class="${localCompliance === 'cumple' ? 'result-ok' : 'result-fail'}">${localCompliance === 'cumple' ? 'CUMPLE' : 'NO CUMPLE'}</b></span><span><strong>Líder:</strong> <b class="${answer.leader_compliance === 'cumple' ? 'result-ok' : answer.leader_compliance === 'no_cumple' ? 'result-fail' : ''}">${answer.leader_compliance === 'cumple' ? 'CUMPLE' : answer.leader_compliance === 'no_cumple' ? 'NO CUMPLE' : 'Sin información'}</b></span></div>`
      : `<p><strong>Respuesta:</strong> <b class="${answer.value === 'cumple' ? 'result-ok' : answer.value === 'no_cumple' ? 'result-fail' : ''}">${escapeHtml(answer.value === 'cumple' ? 'CUMPLE' : answer.value === 'no_cumple' ? 'NO CUMPLE' : answer.value)}</b></p>`;
    const evidenceHtml = answer.evidences.length > 0
      ? `<div class="evidence-label">Evidencias</div><div class="evidence-grid">${answer.evidences.map((reference, evidenceIndex) => `<img src="${escapeHtml(reference)}" alt="Evidencia ${evidenceIndex + 1}" />`).join('')}</div>`
      : '';
    return `<section><h3>${index + 1}. ${escapeHtml(question)}</h3>${compliance}${answer.observation ? `<p><strong>Observación:</strong> ${escapeHtml(answer.observation)}</p>` : ''}${productTable}${depositTable}${evidenceHtml}</section>`;
  }).join('');

  const localGrade = `${Number(report.local_final_grade ?? report.final_grade ?? 0).toFixed(2)} / 10`;
  const leaderGrade = report.leader_final_grade == null ? 'Sin información' : `${Number(report.leader_final_grade).toFixed(2)} / 10`;
  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Informe ${escapeHtml(report.local_name_snapshot)}</title>
      <style>
        @page { size: A4; margin: 9mm 10mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { margin: 0; font-family: Arial, sans-serif; color: #2B2118; font-size: 9px; line-height: 1.25; background: #FFFFFF; }
        header { background: #165034; color: #FFFFFF; padding: 10px 14px; border-radius: 7px 7px 0 0; }
        h1 { margin: 0; font-size: 16px; line-height: 1.2; }
        .header-local { margin-top: 3px; color: #EEEEEE; font-size: 9px; }
        .meta { width: 100%; margin: 0 0 7px; border-collapse: collapse; table-layout: fixed; }
        .meta th, .meta td { border: 1px solid #DED2C2; padding: 4px 5px; vertical-align: top; }
        .meta th { width: 18%; background: #F7F1E7; color: #2B2118; font-weight: 700; text-align: left; }
        .meta td { width: 32%; background: #FFFFFF; }
        .section-title { margin: 7px 0 4px; color: #165034; font-size: 11px; }
        section { break-inside: avoid-page; border: 1px solid #DED2C2; border-radius: 5px; padding: 6px 7px; margin: 0 0 5px; background: #FFFFFF; }
        section h3 { break-after: avoid; margin: 0 0 3px; color: #165034; font-size: 10px; line-height: 1.25; }
        section p { margin: 2px 0; }
        .answer-summary { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 2px 0; }
        .result-ok { color: #165034; }
        .result-fail { color: #B3261E; }
        table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 8px; margin: 4px 0; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        th, td { border: 1px solid #DED2C2; padding: 3px 4px; text-align: left; vertical-align: top; }
        th { background: #F7F1E7; color: #2B2118; }
        .evidence-label { break-after: avoid; margin: 4px 0 2px; font-weight: 700; color: #5E4A3A; }
        .evidence-grid { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 5px; }
        .evidence-grid img { width: calc(33.333% - 4px); height: 105px; object-fit: contain; border: 1px solid #DED2C2; border-radius: 4px; background: #FFFFFF; }
        .signatures { display: flex; gap: 8px; margin-top: 7px; break-inside: avoid; }
        .signature { width: 50%; min-height: 68px; border: 1px solid #DED2C2; padding: 5px; text-align: center; }
        .signature img { display: block; max-width: 100%; height: 54px; object-fit: contain; margin: 3px auto; }
        .edit-note { margin: 5px 0 0; padding: 5px; border: 1px solid #D9A441; background: #FBF8F1; }
      </style>
    </head>
    <body>
      <header>
        <h1>Reporte de visita ${escapeHtml(report.visit_type_id)}</h1>
        <div class="header-local">${escapeHtml(report.local_name_snapshot)}${report.local_code_snapshot ? ` · ${escapeHtml(report.local_code_snapshot)}` : ''}</div>
      </header>
      <table class="meta">
        <tbody>
          <tr><th>Local</th><td>${escapeHtml(report.local_name_snapshot)}</td><th>Fecha</th><td>${escapeHtml(report.start_date)}</td></tr>
          <tr><th>Auditor</th><td>${escapeHtml(report.auditor_name_snapshot)}</td><th>Hora</th><td>${escapeHtml(report.start_time)} - ${escapeHtml(report.end_time)}</td></tr>
          <tr><th>Responsable</th><td>${escapeHtml(report.responsible_name_snapshot)}</td><th>Región</th><td>${escapeHtml(report.region)}</td></tr>
          <tr><th>Calificación Local</th><td>${escapeHtml(localGrade)}</td><th>Calificación Líder</th><td>${escapeHtml(leaderGrade)}</td></tr>
        </tbody>
      </table>
      <h2 class="section-title">Detalle de la evaluación y novedades</h2>
      ${rows}
      <h2 class="section-title">Firmas</h2>
      <div class="signatures">
        <div class="signature"><strong>Firma auditor</strong>${auditorSignatureUrl ? `<img src="${escapeHtml(auditorSignatureUrl)}" alt="Firma auditor">` : '<p>Sin firma</p>'}</div>
        <div class="signature"><strong>Firma responsable</strong>${responsibleSignatureUrl ? `<img src="${escapeHtml(responsibleSignatureUrl)}" alt="Firma responsable">` : '<p>Sin firma</p>'}</div>
      </div>
      ${report.edited_after_send ? `<p class="edit-note"><strong>Editado:</strong> ${escapeHtml(report.last_edit_reason)} · Reenvíos: ${Number(report.resent_count || 0)}</p>` : ''}
    </body>
  </html>`;
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

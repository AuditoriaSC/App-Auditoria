-- Limpieza manual para reiniciar preguntas e historico de auditorias.
-- Ejecutar desde Supabase SQL Editor solo cuando se quiera borrar estos datos.
-- No toca profiles, locales ni responsables.

select 'antes_checklist_questions' as tabla, count(*) as total from public.checklist_questions
union all
select 'antes_audit_reports', count(*) from public.audit_reports
union all
select 'antes_audit_answers_draft', count(*) from public.audit_answers_draft
union all
select 'antes_audit_answers_final', count(*) from public.audit_answers_final;

truncate table
  public.audit_answers_final,
  public.audit_answers_draft,
  public.audit_reports,
  public.checklist_questions
restart identity;

select 'despues_checklist_questions' as tabla, count(*) as total from public.checklist_questions
union all
select 'despues_audit_reports', count(*) from public.audit_reports
union all
select 'despues_audit_answers_draft', count(*) from public.audit_answers_draft
union all
select 'despues_audit_answers_final', count(*) from public.audit_answers_final;

-- Opcional: si tambien quieres borrar archivos del bucket evidencias,
-- revisa primero el contenido desde Storage. No lo hacemos aqui para evitar
-- borrar imagenes por accidente.

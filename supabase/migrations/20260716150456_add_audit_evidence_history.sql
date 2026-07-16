-- Mantiene compatibilidad con evidence_url y agrega soporte no destructivo
-- para varias evidencias y su trazabilidad durante ediciones.
alter table public.audit_answers_draft
  add column if not exists evidence_urls jsonb not null default '[]'::jsonb;

alter table public.audit_answers_final
  add column if not exists evidence_urls jsonb not null default '[]'::jsonb;

alter table public.audit_reports
  add column if not exists evidence_change_log jsonb not null default '[]'::jsonb;

update public.audit_answers_draft
set evidence_urls = jsonb_build_array(evidence_url)
where evidence_url is not null
  and jsonb_array_length(evidence_urls) = 0;

update public.audit_answers_final
set evidence_urls = jsonb_build_array(evidence_url)
where evidence_url is not null
  and jsonb_array_length(evidence_urls) = 0;

alter table public.audit_answers_draft
  add constraint audit_answers_draft_evidence_urls_array
  check (jsonb_typeof(evidence_urls) = 'array');

alter table public.audit_answers_final
  add constraint audit_answers_final_evidence_urls_array
  check (jsonb_typeof(evidence_urls) = 'array');

alter table public.audit_reports
  add constraint audit_reports_evidence_change_log_array
  check (jsonb_typeof(evidence_change_log) = 'array');

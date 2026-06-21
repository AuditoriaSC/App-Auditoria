alter table public.audit_answers_draft
  alter column value drop not null;

alter table public.audit_answers_draft
  alter column observation set default '';

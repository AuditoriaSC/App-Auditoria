alter table public.audit_reports
  add column if not exists end_time time,
  add column if not exists should_send boolean,
  add column if not exists auditor_signature_url text,
  add column if not exists responsible_signature_url text,
  add column if not exists auditor_signature_type text,
  add column if not exists responsible_signature_type text,
  add column if not exists auditor_signature_color text,
  add column if not exists responsible_signature_color text;

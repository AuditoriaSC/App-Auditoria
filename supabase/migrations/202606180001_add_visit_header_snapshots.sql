alter table public.audit_reports
  add column if not exists responsible_code text,
  add column if not exists responsible_name_snapshot text,
  add column if not exists local_code_snapshot text,
  add column if not exists local_name_snapshot text,
  add column if not exists auditor_name_snapshot text,
  add column if not exists start_date date,
  add column if not exists start_time time;

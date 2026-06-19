alter table public.audit_answers_final
  add column if not exists numeric_value_theoretical numeric,
  add column if not exists numeric_value_physical numeric,
  add column if not exists numeric_value_current numeric,
  add column if not exists numeric_value_previous numeric,
  add column if not exists numeric_items jsonb default '[]'::jsonb;

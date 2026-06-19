create table if not exists public.responsibles (
  id uuid primary key default gen_random_uuid(),

  responsible_code text not null,
  responsible_name text not null,

  position text,
  region text,

  is_active boolean not null default true,

  source text default 'manual',
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_responsibles_code
  on public.responsibles (responsible_code);

create index if not exists idx_responsibles_name
  on public.responsibles (responsible_name);

create index if not exists idx_responsibles_region
  on public.responsibles (region);

create index if not exists idx_responsibles_active
  on public.responsibles (is_active);

alter table public.audit_reports
  add column if not exists responsible_id uuid references public.responsibles(id);

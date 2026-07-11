-- Ensure the metadata table used by the local Inventory Evidence screen exists.
-- This is intentionally isolated from audit/visit evidences.

create schema if not exists app_private;

create table if not exists public.inventory_module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.inventory_module_access enable row level security;

create or replace function app_private.has_inventory_access()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'developer')
  )
  or exists (
    select 1
    from public.inventory_module_access ima
    where ima.user_id = auth.uid()
      and ima.is_active = true
  );
$$;

revoke all on function app_private.has_inventory_access() from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.has_inventory_access() to authenticated;

create table if not exists public.inventory_report_evidences (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  category text not null,
  file_name text not null,
  file_path text not null unique,
  mime_type text null,
  size_bytes bigint null,
  uploaded_by uuid null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  constraint inventory_report_evidences_category_not_blank check (btrim(category) <> ''),
  constraint inventory_report_evidences_file_name_not_blank check (btrim(file_name) <> ''),
  constraint inventory_report_evidences_file_path_not_blank check (btrim(file_path) <> '')
);

create index if not exists inventory_report_evidences_report_idx
  on public.inventory_report_evidences (inventory_report_id);

alter table public.inventory_report_evidences enable row level security;

grant select, insert, update, delete on public.inventory_report_evidences to authenticated;

drop policy if exists "inventory_report_evidences_access" on public.inventory_report_evidences;
create policy "inventory_report_evidences_access"
  on public.inventory_report_evidences
  for all
  to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

notify pgrst, 'reload schema';

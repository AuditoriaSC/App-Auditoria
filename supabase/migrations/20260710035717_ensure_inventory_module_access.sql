-- Inventarios v1.1: asegura tabla de acceso usada por RLS.
-- Corrige bases donde inventory_reports existe, pero public.inventory_module_access no.

create table if not exists public.inventory_module_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  granted_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_module_access enable row level security;

create or replace function app_private.has_inventory_access()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
    )
    or exists (
      select 1
      from public.inventory_module_access a
      where a.user_id = auth.uid()
        and a.is_active
    )
  )
$$;

revoke all on function app_private.has_inventory_access() from public;
grant execute on function app_private.has_inventory_access() to authenticated;

drop policy if exists "inventory_access_select_self_or_super_admin" on public.inventory_module_access;
create policy "inventory_access_select_self_or_super_admin"
  on public.inventory_module_access for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'super_admin'
    )
  );

drop policy if exists "inventory_access_manage_super_admin" on public.inventory_module_access;
create policy "inventory_access_manage_super_admin"
  on public.inventory_module_access for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'super_admin'
    )
  );

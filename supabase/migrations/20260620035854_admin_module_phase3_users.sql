alter table public.profiles
  add column if not exists is_active boolean not null default true;

create index if not exists idx_profiles_region_role
  on public.profiles(region, role);

create index if not exists idx_profiles_active
  on public.profiles(is_active);

create schema if not exists app_private;

create or replace function app_private.current_profile_context()
returns table(role text, region text)
language sql
security definer
set search_path = public
stable
as $$
  select p.role, p.region
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

revoke all on function app_private.current_profile_context() from public;
grant execute on function app_private.current_profile_context() to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_select_self_or_admin"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from app_private.current_profile_context() ctx
      where ctx.role = 'super_admin'
        or (
          ctx.role = 'admin'
          and public.profiles.region = ctx.region
        )
    )
  );

create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.profiles.region = ctx.region
        and public.profiles.role <> 'super_admin'
      )
  ))
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.profiles.region = ctx.region
        and public.profiles.role in ('auditor', 'admin')
      )
  ));

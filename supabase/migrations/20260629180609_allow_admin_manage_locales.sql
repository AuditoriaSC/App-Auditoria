drop policy if exists "locales_admin_insert" on public.locales;
drop policy if exists "locales_admin_update" on public.locales;

create policy "locales_admin_insert"
  on public.locales for insert
  to authenticated
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.locales.region = ctx.region
      )
  ));

create policy "locales_admin_update"
  on public.locales for update
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.locales.region = ctx.region
      )
  ))
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.locales.region = ctx.region
      )
  ));

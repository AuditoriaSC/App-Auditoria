drop policy if exists "responsibles_admin_select" on public.responsibles;

create policy "responsibles_admin_select"
  on public.responsibles for select
  to authenticated
  using (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or p.region = 'Global'
        or (
          p.role = 'admin'
          and (
            public.responsibles.region = p.region
            or public.responsibles.region is null
          )
        )
        or (
          p.role = 'auditor'
          and public.responsibles.is_active = true
          and (
            public.responsibles.region = p.region
            or public.responsibles.region is null
          )
        )
      )
  ));

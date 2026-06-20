alter table public.responsibles enable row level security;
alter table public.user_invitations enable row level security;

drop policy if exists "responsibles_admin_select" on public.responsibles;
drop policy if exists "responsibles_admin_insert" on public.responsibles;
drop policy if exists "responsibles_admin_update" on public.responsibles;

create policy "responsibles_admin_select"
  on public.responsibles for select
  to authenticated
  using (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and (
            public.responsibles.region = p.region
            or public.responsibles.region is null
          )
        )
      )
  ));

create policy "responsibles_admin_insert"
  on public.responsibles for insert
  to authenticated
  with check (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and public.responsibles.region = p.region
        )
      )
  ));

create policy "responsibles_admin_update"
  on public.responsibles for update
  to authenticated
  using (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and public.responsibles.region = p.region
        )
      )
  ))
  with check (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and public.responsibles.region = p.region
        )
      )
  ));

drop policy if exists "invitations_admin_access" on public.user_invitations;
drop policy if exists "invitations_admin_select" on public.user_invitations;
drop policy if exists "invitations_admin_insert" on public.user_invitations;
drop policy if exists "invitations_admin_update" on public.user_invitations;

create policy "invitations_admin_select"
  on public.user_invitations for select
  to authenticated
  using (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and public.user_invitations.region = p.region
        )
      )
  ));

create policy "invitations_admin_insert"
  on public.user_invitations for insert
  to authenticated
  with check (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and public.user_invitations.region = p.region
          and public.user_invitations.role in ('auditor', 'admin')
        )
      )
  ));

create policy "invitations_admin_update"
  on public.user_invitations for update
  to authenticated
  using (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and public.user_invitations.region = p.region
          and public.user_invitations.role in ('auditor', 'admin')
        )
      )
  ))
  with check (exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and public.user_invitations.region = p.region
          and public.user_invitations.role in ('auditor', 'admin')
        )
      )
  ));

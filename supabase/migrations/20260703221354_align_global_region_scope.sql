-- Regla transversal: el alcance Global representa Costa + Sierra.
-- No convierte a un admin en super_admin; solo amplía su alcance regional.

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from app_private.current_profile_context() ctx
      where ctx.role = 'super_admin'
        or (ctx.role = 'admin' and (ctx.region = 'Global' or public.profiles.region = ctx.region))
    )
  );

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.profiles.role <> 'super_admin'
        and (ctx.region = 'Global' or public.profiles.region = ctx.region)
      )
  ))
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.profiles.role in ('auditor', 'admin')
        and (ctx.region = 'Global' or public.profiles.region = ctx.region)
      )
  ));

drop policy if exists "locales_admin_insert" on public.locales;
create policy "locales_admin_insert"
  on public.locales for insert
  to authenticated
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (ctx.role = 'admin' and (ctx.region = 'Global' or public.locales.region = ctx.region))
  ));

drop policy if exists "locales_admin_update" on public.locales;
create policy "locales_admin_update"
  on public.locales for update
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (ctx.role = 'admin' and (ctx.region = 'Global' or public.locales.region = ctx.region))
  ))
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (ctx.role = 'admin' and (ctx.region = 'Global' or public.locales.region = ctx.region))
  ));

drop policy if exists "responsibles_admin_insert" on public.responsibles;
create policy "responsibles_admin_insert"
  on public.responsibles for insert
  to authenticated
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (ctx.role = 'admin' and (ctx.region = 'Global' or public.responsibles.region = ctx.region))
  ));

drop policy if exists "responsibles_admin_select" on public.responsibles;
create policy "responsibles_admin_select"
  on public.responsibles for select
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and (ctx.region = 'Global' or public.responsibles.region = ctx.region or public.responsibles.region is null)
      )
      or (
        ctx.role = 'auditor'
        and public.responsibles.is_active = true
        and (ctx.region = 'Global' or public.responsibles.region = ctx.region or public.responsibles.region is null)
      )
  ));

drop policy if exists "responsibles_admin_update" on public.responsibles;
create policy "responsibles_admin_update"
  on public.responsibles for update
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (ctx.role = 'admin' and (ctx.region = 'Global' or public.responsibles.region = ctx.region))
  ))
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (ctx.role = 'admin' and (ctx.region = 'Global' or public.responsibles.region = ctx.region))
  ));

drop policy if exists "invitations_admin_select" on public.user_invitations;
create policy "invitations_admin_select"
  on public.user_invitations for select
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (ctx.role = 'admin' and (ctx.region = 'Global' or public.user_invitations.region = ctx.region))
  ));

drop policy if exists "invitations_admin_insert" on public.user_invitations;
create policy "invitations_admin_insert"
  on public.user_invitations for insert
  to authenticated
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.user_invitations.role in ('auditor', 'admin')
        and (ctx.region = 'Global' or public.user_invitations.region = ctx.region)
      )
  ));

drop policy if exists "invitations_admin_update" on public.user_invitations;
create policy "invitations_admin_update"
  on public.user_invitations for update
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.user_invitations.role in ('auditor', 'admin')
        and (ctx.region = 'Global' or public.user_invitations.region = ctx.region)
      )
  ))
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and public.user_invitations.role in ('auditor', 'admin')
        and (ctx.region = 'Global' or public.user_invitations.region = ctx.region)
      )
  ));

drop policy if exists "questions_admin_write" on public.checklist_questions;
create policy "questions_admin_write"
  on public.checklist_questions for all
  to authenticated
  using (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and (ctx.region = 'Global' or public.checklist_questions.region = ctx.region)
      )
  ))
  with check (exists (
    select 1
    from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
      or (
        ctx.role = 'admin'
        and (ctx.region = 'Global' or public.checklist_questions.region = ctx.region)
      )
  ));

drop policy if exists "edit_approvals_select_authorized" on public.audit_edit_approvals;
create policy "edit_approvals_select_authorized"
  on public.audit_edit_approvals for select
  to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1
      from public.audit_reports r
      cross join app_private.current_profile_context() ctx
      where r.id = audit_report_id
        and (
          ctx.role = 'super_admin'
          or (ctx.role = 'admin' and (ctx.region = 'Global' or ctx.region = r.region))
        )
    )
  );

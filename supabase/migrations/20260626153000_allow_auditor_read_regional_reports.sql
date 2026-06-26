drop policy if exists "reports_select_own_or_admin" on public.audit_reports;

create policy "reports_select_own_or_admin"
  on public.audit_reports for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'super_admin'
          or p.region = 'Global'
          or (p.role in ('admin', 'auditor') and p.region = audit_reports.region)
        )
    )
  );

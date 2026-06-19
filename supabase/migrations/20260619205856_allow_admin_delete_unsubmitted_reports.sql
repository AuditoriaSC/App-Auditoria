drop policy if exists "reports_delete_admin_unsubmitted" on public.audit_reports;

create policy "reports_delete_admin_unsubmitted"
  on public.audit_reports for delete
  to authenticated
  using (
    (
      status <> 'finalized'
      or coalesce(should_send, false) = false
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

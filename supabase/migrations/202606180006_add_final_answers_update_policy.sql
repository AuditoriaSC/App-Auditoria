drop policy if exists "final_answers_update_owner_or_admin" on public.audit_answers_final;

create policy "final_answers_update_owner_or_admin"
  on public.audit_answers_final for update
  to authenticated
  using (exists (
    select 1 from public.audit_reports r
    where r.id = report_id and (
      r.user_id = auth.uid() or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'super_admin')
      )
    )
  ))
  with check (exists (
    select 1 from public.audit_reports r
    where r.id = report_id and (
      r.user_id = auth.uid() or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'super_admin')
      )
    )
  ));

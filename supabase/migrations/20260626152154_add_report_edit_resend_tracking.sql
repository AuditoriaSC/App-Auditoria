alter table public.audit_reports
  add column if not exists edited_after_send boolean not null default false,
  add column if not exists last_edited_at timestamptz,
  add column if not exists last_edited_by uuid references public.profiles(id),
  add column if not exists last_edit_reason text,
  add column if not exists last_resent_at timestamptz,
  add column if not exists resent_count integer not null default 0,
  add column if not exists last_resent_by uuid references public.profiles(id);

create index if not exists idx_audit_reports_edit_tracking
on public.audit_reports (edited_after_send, last_edited_at);

drop policy if exists "final_answers_insert_owner_or_admin" on public.audit_answers_final;
drop policy if exists "final_answers_insert_owner" on public.audit_answers_final;

create policy "final_answers_insert_owner_or_admin"
  on public.audit_answers_final for insert
  to authenticated
  with check (exists (
    select 1
    from public.audit_reports r
    where r.id = report_id
      and (
        r.user_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and (p.role in ('admin', 'super_admin') or p.region = 'Global')
        )
      )
  ));

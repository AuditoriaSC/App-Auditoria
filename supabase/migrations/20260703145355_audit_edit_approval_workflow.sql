create table if not exists public.audit_edit_approvals (
  id uuid primary key default gen_random_uuid(),
  audit_report_id uuid not null references public.audit_reports(id) on delete cascade,
  question_id uuid null references public.checklist_questions(id),
  requested_by uuid not null references public.profiles(id),
  approved_by uuid null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  change_type text not null check (change_type in ('typo_correction', 'observation_edit', 'scored_answer_change', 'recalculation', 'resend_request')),
  old_value text null,
  new_value text null,
  old_score numeric null,
  new_score numeric null,
  reason text null,
  admin_comment text null,
  change_payload jsonb not null default '[]'::jsonb,
  change_summary jsonb not null default '[]'::jsonb,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null
);

create index if not exists idx_audit_edit_approvals_status_requested
  on public.audit_edit_approvals(status, requested_at desc);
create index if not exists idx_audit_edit_approvals_report
  on public.audit_edit_approvals(audit_report_id);
create unique index if not exists uq_audit_edit_approvals_one_pending
  on public.audit_edit_approvals(audit_report_id) where status = 'pending';

alter table public.audit_edit_approvals enable row level security;

create policy "edit_approvals_select_authorized"
on public.audit_edit_approvals for select to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.audit_reports r
    cross join app_private.current_profile_context() ctx
    where r.id = audit_report_id
      and (ctx.role = 'super_admin' or ctx.region = 'Global' or (ctx.role = 'admin' and ctx.region = r.region))
  )
);

-- Todas las escrituras se realizan mediante la Edge Function manage-report-edit.
-- Esto impide aplicar una recalificacion directamente desde el cliente.
drop policy if exists "final_answers_update_owner_or_admin" on public.audit_answers_final;

create or replace function app_private.protect_final_report_score()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'finalized'
     and (old.final_grade is distinct from new.final_grade or old.final_percentage is distinct from new.final_percentage)
     and current_user <> 'service_role' then
    raise exception 'La recalificacion requiere aprobacion administrativa';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_final_report_score on public.audit_reports;
create trigger protect_final_report_score
before update of final_grade, final_percentage on public.audit_reports
for each row execute function app_private.protect_final_report_score();

alter table public.checklist_questions
  add column if not exists dual_compliance boolean not null default false;

alter table public.audit_answers_draft
  add column if not exists local_compliance text,
  add column if not exists leader_compliance text;

alter table public.audit_answers_final
  add column if not exists local_compliance text,
  add column if not exists leader_compliance text;

alter table public.audit_reports
  add column if not exists local_final_grade numeric,
  add column if not exists leader_final_grade numeric;

alter table public.audit_edit_approvals
  add column if not exists old_leader_score numeric,
  add column if not exists new_leader_score numeric;

alter table public.audit_answers_draft
  drop constraint if exists audit_answers_draft_local_compliance_check,
  drop constraint if exists audit_answers_draft_leader_compliance_check;

alter table public.audit_answers_draft
  add constraint audit_answers_draft_local_compliance_check
    check (local_compliance is null or local_compliance in ('cumple', 'no_cumple')),
  add constraint audit_answers_draft_leader_compliance_check
    check (leader_compliance is null or leader_compliance in ('cumple', 'no_cumple'));

alter table public.audit_answers_final
  drop constraint if exists audit_answers_final_local_compliance_check,
  drop constraint if exists audit_answers_final_leader_compliance_check;

alter table public.audit_answers_final
  add constraint audit_answers_final_local_compliance_check
    check (local_compliance is null or local_compliance in ('cumple', 'no_cumple')),
  add constraint audit_answers_final_leader_compliance_check
    check (leader_compliance is null or leader_compliance in ('cumple', 'no_cumple'));

alter table public.audit_reports
  drop constraint if exists audit_reports_local_final_grade_check,
  drop constraint if exists audit_reports_leader_final_grade_check;

alter table public.audit_reports
  add constraint audit_reports_local_final_grade_check
    check (local_final_grade is null or local_final_grade between 0 and 10),
  add constraint audit_reports_leader_final_grade_check
    check (leader_final_grade is null or leader_final_grade between 0 and 10);

create table if not exists public.audit_answer_detail_rows (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.audit_reports(id) on delete cascade,
  question_id uuid not null references public.checklist_questions(id) on delete restrict,
  draft_answer_id uuid references public.audit_answers_draft(id) on delete cascade,
  final_answer_id uuid references public.audit_answers_final(id) on delete cascade,
  row_kind text not null check (row_kind in ('product_writeoff', 'deposit_declaration')),
  sort_order integer not null default 0 check (sort_order >= 0),
  lot_date date,
  writeoff_date date,
  description text,
  quantity numeric,
  record_date date,
  notebook_amount numeric,
  system_amount numeric,
  responsible_id uuid references public.responsibles(id) on delete set null,
  responsible_code_snapshot text,
  responsible_name_snapshot text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audit_answer_detail_rows_single_answer
    check ((draft_answer_id is not null) <> (final_answer_id is not null)),
  constraint audit_answer_detail_rows_product_fields
    check (
      row_kind <> 'product_writeoff'
      or (
        lot_date is not null
        and writeoff_date is not null
        and nullif(btrim(description), '') is not null
        and char_length(description) <= 500
        and quantity > 0
      )
    ),
  constraint audit_answer_detail_rows_deposit_fields
    check (
      row_kind <> 'deposit_declaration'
      or (
        record_date is not null
        and notebook_amount is not null
        and notebook_amount >= 0
        and system_amount is not null
        and system_amount >= 0
      )
    )
);

create index if not exists audit_answer_detail_rows_report_question_idx
  on public.audit_answer_detail_rows (report_id, question_id, row_kind, sort_order);

create index if not exists audit_answer_detail_rows_draft_answer_idx
  on public.audit_answer_detail_rows (draft_answer_id)
  where draft_answer_id is not null;

create index if not exists audit_answer_detail_rows_final_answer_idx
  on public.audit_answer_detail_rows (final_answer_id)
  where final_answer_id is not null;

create index if not exists audit_answer_detail_rows_responsible_idx
  on public.audit_answer_detail_rows (responsible_id)
  where responsible_id is not null;

alter table public.audit_answer_detail_rows enable row level security;

drop policy if exists "answer_detail_rows_select_accessible_report" on public.audit_answer_detail_rows;
create policy "answer_detail_rows_select_accessible_report"
  on public.audit_answer_detail_rows for select
  to authenticated
  using (
    exists (
      select 1
      from public.audit_reports report
      join public.profiles profile on profile.id = auth.uid()
      where report.id = audit_answer_detail_rows.report_id
        and (
          report.user_id = auth.uid()
          or profile.role = 'super_admin'
          or profile.region = 'Global'
          or (profile.role = 'admin' and profile.region = report.region)
        )
    )
  );

drop policy if exists "answer_detail_rows_insert_accessible_report" on public.audit_answer_detail_rows;
create policy "answer_detail_rows_insert_accessible_report"
  on public.audit_answer_detail_rows for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.audit_reports report
      join public.profiles profile on profile.id = auth.uid()
      where report.id = audit_answer_detail_rows.report_id
        and (
          report.user_id = auth.uid()
          or profile.role = 'super_admin'
          or profile.region = 'Global'
          or (profile.role = 'admin' and profile.region = report.region)
        )
    )
  );

drop policy if exists "answer_detail_rows_update_accessible_report" on public.audit_answer_detail_rows;
create policy "answer_detail_rows_update_accessible_report"
  on public.audit_answer_detail_rows for update
  to authenticated
  using (
    exists (
      select 1
      from public.audit_reports report
      join public.profiles profile on profile.id = auth.uid()
      where report.id = audit_answer_detail_rows.report_id
        and (
          report.user_id = auth.uid()
          or profile.role = 'super_admin'
          or profile.region = 'Global'
          or (profile.role = 'admin' and profile.region = report.region)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.audit_reports report
      join public.profiles profile on profile.id = auth.uid()
      where report.id = audit_answer_detail_rows.report_id
        and (
          report.user_id = auth.uid()
          or profile.role = 'super_admin'
          or profile.region = 'Global'
          or (profile.role = 'admin' and profile.region = report.region)
        )
    )
  );

drop policy if exists "answer_detail_rows_delete_accessible_report" on public.audit_answer_detail_rows;
create policy "answer_detail_rows_delete_accessible_report"
  on public.audit_answer_detail_rows for delete
  to authenticated
  using (
    exists (
      select 1
      from public.audit_reports report
      join public.profiles profile on profile.id = auth.uid()
      where report.id = audit_answer_detail_rows.report_id
        and (
          report.user_id = auth.uid()
          or profile.role = 'super_admin'
          or profile.region = 'Global'
          or (profile.role = 'admin' and profile.region = report.region)
        )
    )
  );

grant select, insert, update, delete on public.audit_answer_detail_rows to authenticated;

do $$
declare
  product_count integer;
  deposit_count integer;
begin
  select count(*)
  into product_count
  from public.checklist_questions
  where question_text in (
    'Verificación de Bajas anticipadas',
    'Evaluación control de Bajas MP/PT'
  )
    and visit_type_id in ('Sabatina', 'Nocturna')
    and region = 'Global';

  select count(*)
  into deposit_count
  from public.checklist_questions
  where question_type = 'pending_deposit'
    and visit_type_id in ('Sabatina', 'Nocturna')
    and region = 'Global';

  if product_count <> 4 then
    raise exception 'Se esperaban 4 preguntas configuradas de Bajas, se encontraron %', product_count;
  end if;

  if deposit_count <> 2 then
    raise exception 'Se esperaban 2 preguntas pending_deposit, se encontraron %', deposit_count;
  end if;
end
$$;

update public.checklist_questions
set question_type = 'product_writeoff',
    dual_compliance = true,
    numeric_mode = 'product_writeoff_rows'
where question_text in (
  'Verificación de Bajas anticipadas',
  'Evaluación control de Bajas MP/PT'
)
  and visit_type_id in ('Sabatina', 'Nocturna')
  and region = 'Global';

update public.checklist_questions
set dual_compliance = true
where question_type = 'pending_deposit'
  and visit_type_id in ('Sabatina', 'Nocturna')
  and region = 'Global';

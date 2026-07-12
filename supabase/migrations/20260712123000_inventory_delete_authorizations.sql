create table if not exists public.inventory_authorization_requests (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid null references public.inventory_reports(id) on delete set null,
  local_code_snapshot text null,
  local_name_snapshot text null,
  request_type text not null default 'delete_report' check (request_type in ('delete_report')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text null,
  admin_comment text null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null
);

create index if not exists inventory_authorization_requests_status_idx
  on public.inventory_authorization_requests(status, requested_at desc);

create index if not exists inventory_authorization_requests_report_idx
  on public.inventory_authorization_requests(inventory_report_id);

create unique index if not exists inventory_authorization_requests_one_pending_delete
  on public.inventory_authorization_requests(inventory_report_id, request_type)
  where status = 'pending';

alter table public.inventory_authorization_requests enable row level security;

grant select, insert, update on public.inventory_authorization_requests to authenticated;

drop policy if exists "inventory_authorizations_select" on public.inventory_authorization_requests;
create policy "inventory_authorizations_select"
  on public.inventory_authorization_requests for select
  to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1
      from app_private.current_profile_context() ctx
      where ctx.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "inventory_authorizations_insert_own" on public.inventory_authorization_requests;
create policy "inventory_authorizations_insert_own"
  on public.inventory_authorization_requests for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and inventory_report_id is not null
    and status = 'pending'
  );

drop policy if exists "inventory_authorizations_review_admin" on public.inventory_authorization_requests;
create policy "inventory_authorizations_review_admin"
  on public.inventory_authorization_requests for update
  to authenticated
  using (
    exists (
      select 1
      from app_private.current_profile_context() ctx
      where ctx.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from app_private.current_profile_context() ctx
      where ctx.role in ('admin', 'super_admin')
    )
  );

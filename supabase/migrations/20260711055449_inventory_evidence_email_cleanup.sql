-- Inventarios v1.1: control de adjuntos documentales pesados y limpieza
-- posterior al envio exitoso del correo. Aislado de Visitas/Auditorias 1.0.

alter table public.inventory_report_evidences
  add column if not exists delete_after_send boolean not null default false,
  add column if not exists attached_to_email boolean not null default false,
  add column if not exists deleted_after_send boolean not null default false,
  add column if not exists deleted_after_send_at timestamptz null,
  add column if not exists cleanup_error text null;

create table if not exists public.inventory_email_attachments_log (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  evidence_id uuid null references public.inventory_report_evidences(id) on delete set null,
  file_name text not null,
  category text null,
  file_path text null,
  mime_type text null,
  size_bytes bigint null,
  attached_to_email boolean not null default false,
  deleted_after_send boolean not null default false,
  cleanup_error text null,
  sent_at timestamptz null,
  deleted_at timestamptz null,
  sent_by uuid null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_email_attachments_log_report_idx
  on public.inventory_email_attachments_log (inventory_report_id);

create index if not exists inventory_email_attachments_log_evidence_idx
  on public.inventory_email_attachments_log (evidence_id);

alter table public.inventory_email_attachments_log enable row level security;

grant select, insert, update on public.inventory_email_attachments_log to authenticated;

drop policy if exists "inventory_email_attachments_log_access" on public.inventory_email_attachments_log;
create policy "inventory_email_attachments_log_access"
  on public.inventory_email_attachments_log
  for all
  to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

notify pgrst, 'reload schema';

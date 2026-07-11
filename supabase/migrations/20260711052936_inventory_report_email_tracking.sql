-- Inventarios v1.1: trazabilidad de envío de correo del informe.
-- Cambio no destructivo y aislado a inventory_reports.

alter table public.inventory_reports
  add column if not exists inventory_email_sent boolean not null default false,
  add column if not exists inventory_email_sent_at timestamptz,
  add column if not exists inventory_email_sent_by uuid references public.profiles(id) on delete set null,
  add column if not exists inventory_email_recipients text[] not null default '{}',
  add column if not exists inventory_email_status text not null default 'not_sent',
  add column if not exists inventory_email_error text;

alter table public.inventory_reports
  drop constraint if exists inventory_reports_email_status_check,
  add constraint inventory_reports_email_status_check
  check (inventory_email_status in ('not_sent', 'sending', 'sent', 'failed'));

create index if not exists inventory_reports_email_status_idx
  on public.inventory_reports (inventory_email_status);

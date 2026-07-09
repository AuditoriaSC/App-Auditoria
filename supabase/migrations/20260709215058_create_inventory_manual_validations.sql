-- Inventarios v1.1: validaciones manuales del informe.
-- Tablas aisladas del flujo de visitas/auditorías 1.0.

create table if not exists public.inventory_manual_invoice_checks (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  last_system_invoice integer not null,
  last_physical_block_invoice integer not null,
  calculated_difference integer not null,
  comment text null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_recounts (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  sku text not null,
  item_description text null,
  initial_count numeric not null,
  final_recount numeric not null,
  difference numeric not null,
  status text not null check (status in ('Recuento OK', 'Recuento Modificado')),
  comment text null,
  created_at timestamptz not null default now(),
  check (btrim(sku) <> '')
);

create table if not exists public.inventory_finished_product_differences (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  sku text null,
  item_description text null,
  system_stock numeric null,
  physical_stock numeric null,
  difference numeric null,
  comment text null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_cash_closures (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  cash_register text not null,
  cashier_name text not null,
  cash_value numeric not null,
  cash_difference numeric not null,
  comment text null,
  created_at timestamptz not null default now(),
  check (btrim(cash_register) <> ''),
  check (btrim(cashier_name) <> '')
);

create index if not exists inventory_manual_invoice_checks_report_idx
  on public.inventory_manual_invoice_checks (inventory_report_id);

create index if not exists inventory_recounts_report_idx
  on public.inventory_recounts (inventory_report_id);

create index if not exists inventory_finished_product_differences_report_idx
  on public.inventory_finished_product_differences (inventory_report_id);

create index if not exists inventory_cash_closures_report_idx
  on public.inventory_cash_closures (inventory_report_id);

alter table public.inventory_manual_invoice_checks enable row level security;
alter table public.inventory_recounts enable row level security;
alter table public.inventory_finished_product_differences enable row level security;
alter table public.inventory_cash_closures enable row level security;

create policy "inventory_manual_invoice_checks_access"
  on public.inventory_manual_invoice_checks for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

create policy "inventory_recounts_access"
  on public.inventory_recounts for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

create policy "inventory_finished_product_differences_access"
  on public.inventory_finished_product_differences for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

create policy "inventory_cash_closures_access"
  on public.inventory_cash_closures for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

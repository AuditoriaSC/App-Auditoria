-- Inventarios v1.1: líneas importadas desde CSV por informe.
-- Tabla aislada del flujo de visitas/auditorías 1.0.

create table if not exists public.inventory_report_items (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  warehouse_code text not null,
  sku text not null,
  item_description text null,
  physical_stock numeric not null default 0,
  system_stock numeric not null default 0,
  difference numeric not null default 0,
  unit_cost numeric not null default 0,
  total_cost numeric not null default 0,
  validation_warning text null,
  created_at timestamptz not null default now(),
  check (btrim(warehouse_code) <> ''),
  check (btrim(sku) <> '')
);

create index if not exists inventory_report_items_report_idx
  on public.inventory_report_items (inventory_report_id);

create index if not exists inventory_report_items_report_sku_idx
  on public.inventory_report_items (inventory_report_id, sku);

alter table public.inventory_report_items enable row level security;

create policy "inventory_report_items_access"
  on public.inventory_report_items for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

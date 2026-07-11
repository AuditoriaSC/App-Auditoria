-- Inventarios v1.1: base temporal de cruces por SKU.
-- Tabla aislada del flujo de visitas/auditorias 1.0.

create table if not exists public.inventory_crosses (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  item_description text null,
  cross_name text not null,
  conversion_factor numeric not null default 1 check (conversion_factor > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id),
  unique (sku, cross_name),
  check (btrim(sku) <> ''),
  check (btrim(cross_name) <> '')
);

create index if not exists inventory_crosses_sku_idx
  on public.inventory_crosses (sku);

alter table public.inventory_crosses enable row level security;

create policy "inventory_crosses_access"
  on public.inventory_crosses for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

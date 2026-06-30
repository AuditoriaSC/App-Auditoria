alter table public.inventory_cross_catalog
  add column inventory_name text not null default '',
  add column inventory_code_normalized text generated always as (btrim(inventory_code)) stored;

alter table public.inventory_cross_catalog
  rename column destination_unit to target_unit;

alter table public.inventory_cross_catalog
  drop constraint inventory_cross_catalog_type_check;

alter table public.inventory_cross_catalog
  rename column type to item_type;

update public.inventory_cross_catalog
set item_type = case item_type
  when 'inventario' then 'inventory'
  when 'costo' then 'cost'
  when 'gasto' then 'expense'
  else item_type
end;

update public.inventory_cross_catalog
set cross_group = ''
where cross_group is null;

alter table public.inventory_cross_catalog
  alter column cross_group set default '',
  alter column cross_group set not null,
  add constraint inventory_cross_catalog_item_type_check
    check (item_type in ('inventory', 'cost', 'expense')),
  add constraint inventory_cross_catalog_code_not_blank_check
    check (inventory_code_normalized <> '');

create index inventory_cross_catalog_exact_code_idx
  on public.inventory_cross_catalog (inventory_code_normalized)
  where is_active;

alter table public.inventory_report_crosses
  rename column destination_unit to target_unit;

alter table public.inventory_report_crosses
  drop constraint inventory_report_crosses_type_check;

alter table public.inventory_report_crosses
  rename column type to item_type;

update public.inventory_report_crosses
set item_type = case item_type
  when 'inventario' then 'inventory'
  when 'costo' then 'cost'
  when 'gasto' then 'expense'
  else item_type
end;

alter table public.inventory_report_crosses
  add constraint inventory_report_crosses_item_type_check
    check (item_type in ('inventory', 'cost', 'expense'));

create table public.inventory_import_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inventory_reports(id) on delete cascade,
  source_file_id uuid references public.inventory_files(id) on delete set null,
  source_row integer not null check (source_row > 0),
  inventory_code text not null,
  inventory_code_normalized text generated always as (btrim(inventory_code)) stored,
  inventory_name text not null default '',
  quantity numeric not null default 0,
  difference numeric not null default 0,
  valuation numeric,
  item_type text not null default 'inventory'
    check (item_type in ('inventory', 'cost', 'expense')),
  match_status text not null default 'unmatched'
    check (match_status in ('matched', 'unmatched', 'manual')),
  catalog_cross_id uuid references public.inventory_cross_catalog(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inventory_code_normalized <> ''),
  unique (report_id, source_row)
);

create index inventory_import_items_report_idx
  on public.inventory_import_items (report_id);

create index inventory_import_items_exact_code_idx
  on public.inventory_import_items (inventory_code_normalized);

grant select, insert, update, delete
  on public.inventory_import_items
  to authenticated;

alter table public.inventory_import_items enable row level security;

create policy "inventory_import_items_access"
  on public.inventory_import_items for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

-- Inventarios v1.1: resultados calculados y ajustes manuales.
-- Tabla aislada del flujo de visitas/auditorías 1.0.

create table if not exists public.inventory_report_results (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  result_type text not null
    check (result_type in (
      'surplus_without_cross',
      'surplus_cross',
      'shortage_without_cross',
      'shortage_cross'
    )),
  sku text null,
  item_description text null,
  cross_name text null,
  original_difference numeric null,
  conversion_factor numeric null,
  calculated_result numeric null,
  manual_result numeric null,
  final_result numeric null,
  is_manual_adjusted boolean not null default false,
  manual_comment text null,
  adjusted_by uuid null references public.profiles(id),
  adjusted_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_report_results_report_idx
  on public.inventory_report_results (inventory_report_id);

create index if not exists inventory_report_results_report_type_idx
  on public.inventory_report_results (inventory_report_id, result_type);

alter table public.inventory_report_results enable row level security;

create policy "inventory_report_results_access"
  on public.inventory_report_results for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

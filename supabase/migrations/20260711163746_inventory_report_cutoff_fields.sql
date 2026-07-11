-- Cambio no destructivo y aislado al módulo Inventarios.
-- Permite registrar manualmente el corte operativo del informe.

alter table public.inventory_reports
  add column if not exists inventory_cutoff_month integer null,
  add column if not exists inventory_cutoff_year integer null,
  add column if not exists inventory_cutoff_label text null;

alter table public.inventory_reports
  drop constraint if exists inventory_reports_cutoff_month_check,
  add constraint inventory_reports_cutoff_month_check
    check (inventory_cutoff_month is null or inventory_cutoff_month between 1 and 12);

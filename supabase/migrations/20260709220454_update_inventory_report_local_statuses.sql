-- Inventarios v1.1: estados locales del flujo de creación/cierre.
-- Cambio aislado a inventory_reports.

alter table public.inventory_reports
  drop constraint if exists inventory_reports_status_check;

alter table public.inventory_reports
  add constraint inventory_reports_status_check
  check (status in (
    'draft',
    'csv_loaded',
    'results_validated',
    'manual_validations_completed',
    'finalized',
    -- Compatibilidad con estados exploratorios previos del módulo.
    'archivo_cargado',
    'cruces_pendientes',
    'cruces_validados',
    'diferencias_revisadas',
    'listo_para_informe'
  ));

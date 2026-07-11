-- Inventarios v1.1: encabezado funcional del informe.
-- Cambio no destructivo y aislado al módulo de Inventarios.

alter table public.inventory_reports
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists has_second_time_range boolean not null default false,
  add column if not exists second_start_time time,
  add column if not exists second_end_time time;

-- La fase actual del encabezado no captura responsable.
-- Se conservan las columnas existentes para compatibilidad histórica, pero dejan de bloquear la creación del borrador.
alter table public.inventory_reports
  alter column responsible_id drop not null,
  alter column responsible_code_snapshot drop not null,
  alter column responsible_name_snapshot drop not null;

-- Si existieran borradores antiguos sin hora, se marca una hora neutra para poder reforzar obligatoriedad futura.
update public.inventory_reports
set
  start_time = coalesce(start_time, time '00:00'),
  end_time = coalesce(end_time, time '00:00')
where start_time is null
   or end_time is null;

alter table public.inventory_reports
  alter column start_time set not null,
  alter column end_time set not null;

alter table public.inventory_reports
  drop constraint if exists inventory_reports_second_time_range_check,
  add constraint inventory_reports_second_time_range_check
    check (
      (
        has_second_time_range = false
        and second_start_time is null
        and second_end_time is null
      )
      or (
        has_second_time_range = true
        and second_start_time is not null
        and second_end_time is not null
      )
    );

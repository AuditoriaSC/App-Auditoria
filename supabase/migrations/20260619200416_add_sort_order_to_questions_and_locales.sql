alter table public.checklist_questions
add column if not exists sort_order integer;

with ordered as (
  select
    id,
    row_number() over (
      partition by visit_type_id
      order by created_at asc, id asc
    ) as rn
  from public.checklist_questions
)
update public.checklist_questions cq
set sort_order = ordered.rn
from ordered
where cq.id = ordered.id
  and cq.sort_order is null;

create index if not exists idx_checklist_questions_visit_type_sort
on public.checklist_questions (visit_type_id, sort_order);

alter table public.locales
add column if not exists sort_order integer;

with ordered as (
  select
    codigo_interno,
    row_number() over (
      partition by region
      order by codigo_interno asc, nombre_local asc
    ) as rn
  from public.locales
)
update public.locales l
set sort_order = ordered.rn
from ordered
where l.codigo_interno = ordered.codigo_interno
  and l.sort_order is null;

create index if not exists idx_locales_region_sort
on public.locales (region, sort_order);

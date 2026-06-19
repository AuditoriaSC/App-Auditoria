alter table public.checklist_questions
  add column if not exists question_type text default 'compliance',
  add column if not exists is_scored boolean default true,
  add column if not exists requires_observation boolean default false,
  add column if not exists requires_observation_on_fail boolean default true,
  add column if not exists requires_evidence boolean default false,
  add column if not exists min_evidence integer default 0,
  add column if not exists max_evidence integer default 2,
  add column if not exists numeric_mode text,
  add column if not exists item_schema jsonb default '[]'::jsonb;

alter table public.audit_answers_draft
  add column if not exists numeric_value_theoretical numeric,
  add column if not exists numeric_value_physical numeric,
  add column if not exists numeric_value_current numeric,
  add column if not exists numeric_value_previous numeric,
  add column if not exists numeric_items jsonb default '[]'::jsonb;

update public.checklist_questions
set
  min_evidence = 0,
  requires_evidence = false,
  max_evidence = case
    when question_type = 'additional_novelty' then 4
    else 2
  end,
  is_scored = case
    when question_type in ('follow_up', 'additional_novelty') then false
    else coalesce(is_scored, true)
  end;

-- Ejemplos de configuracion manual:
-- update public.checklist_questions
-- set question_type = 'cup_count',
--     numeric_mode = 'multi_item_difference',
--     item_schema = '[{"label":"Vaso 4 oz"},{"label":"Vaso 8 oz"},{"label":"Vaso 12 oz"},{"label":"Vaso 16 oz"}]'::jsonb
-- where question_text ilike '%vasos%';
--
-- update public.checklist_questions
-- set question_type = 'raw_material_count',
--     numeric_mode = 'multi_item_difference',
--     item_schema = '[{"label":"Cafe"},{"label":"Leche"},{"label":"Azucar"}]'::jsonb
-- where question_text ilike '%materias primas%';

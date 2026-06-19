# Plantillas CSV de Preproduccion

## checklist_questions_template.csv

Tabla destino: `public.checklist_questions`.

Columnas principales:

- `question_text`: texto visible de la pregunta.
- `region`: `Costa`, `Sierra` o `Global`.
- `visit_type_id`: `Sabatina` o `Nocturna`.
- `score_points`: puntaje de la pregunta. Usar `0` si no suma.
- `is_active`: `true` o `false`.
- `evidence_required`: mantener `false`; las evidencias son opcionales.
- `question_type`: `compliance`, `cash_count`, `pending_deposit`, `inventory`, `cup_count`, `raw_material_count`, `follow_up`, `additional_novelty`.
- `is_scored`: `true` si suma a la calificacion; `false` para seguimiento y novedades.
- `requires_observation_on_fail`: normalmente `true`.
- `requires_evidence`: mantener `false`.
- `min_evidence`: mantener `0`.
- `max_evidence`: `2` normal, `4` para `additional_novelty`.
- `numeric_mode`: usar `cash_difference`, `shift_values` o `multi_item_difference` cuando aplique.
- `item_schema`: JSON para preguntas multi-item. En CSV, duplicar comillas internas.

Ejemplo de `item_schema` en CSV:

```csv
"[{""label"":""Vaso 4 oz""},{""label"":""Vaso 8 oz""}]"
```

## locales_template.csv

Tabla destino: `public.locales`.

Columnas:

- `codigo_interno`: codigo unico del local.
- `nombre_local`: nombre comercial.
- `region`: `Costa` o `Sierra`.

## Orden recomendado de carga

1. Cargar `locales_template.csv` en `public.locales`.
2. Cargar responsables en `public.responsibles` si aplica.
3. Cargar `checklist_questions_template.csv` en `public.checklist_questions`.

Antes de cargar preguntas finales, ejecutar si corresponde:

```sql
select count(*) from public.checklist_questions;
```

Y usar `supabase/sql/reset_questions_and_audit_history.sql` solo si se quiere limpiar preguntas e historico nuevamente.

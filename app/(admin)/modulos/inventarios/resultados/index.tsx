import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';

type ResultType = 'surplus_without_cross' | 'surplus_cross' | 'shortage_without_cross' | 'shortage_cross';

type InventoryItem = {
  id: string;
  inventory_report_id: string;
  sku: string;
  item_description: string | null;
  difference: number;
};

type InventoryCross = {
  id: string;
  sku: string;
  cross_name: string;
  conversion_factor: number;
  is_active: boolean;
};

type InventoryResult = {
  id?: string;
  inventory_report_id: string;
  result_type: ResultType;
  sku: string | null;
  item_description: string | null;
  cross_name: string | null;
  original_difference: number | null;
  conversion_factor: number | null;
  calculated_result: number | null;
  manual_result: number | null;
  final_result: number | null;
  is_manual_adjusted: boolean;
  manual_comment: string | null;
  adjusted_by?: string | null;
  adjusted_at?: string | null;
  component_skus?: string[];
};

const resultTypeLabels: Record<ResultType, string> = {
  surplus_without_cross: 'Sobrantes de items sin cruce',
  surplus_cross: 'Cruces con resultado >= 0',
  shortage_without_cross: 'Faltantes de items sin cruce',
  shortage_cross: 'Cruces con resultado < 0',
};

const orderedTypes: ResultType[] = [
  'surplus_without_cross',
  'surplus_cross',
  'shortage_without_cross',
  'shortage_cross',
];

function normalizeSku(value: string) {
  return String(value).trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByImpact(left: InventoryResult, right: InventoryResult) {
  return Math.abs(toNumber(right.final_result)) - Math.abs(toNumber(left.final_result));
}

function classifyResult(result: InventoryResult): ResultType {
  if (toNumber(result.final_result) >= 0) {
    return result.cross_name ? 'surplus_cross' : 'surplus_without_cross';
  }

  return result.cross_name ? 'shortage_cross' : 'shortage_without_cross';
}

function calculateResults(reportId: string, items: InventoryItem[], crosses: InventoryCross[]) {
  const activeCrossesBySku = new Map<string, InventoryCross[]>();
  crosses
    .filter((cross) => cross.is_active)
    .forEach((cross) => {
      const sku = normalizeSku(cross.sku);
      const current = activeCrossesBySku.get(sku) || [];
      current.push(cross);
      activeCrossesBySku.set(sku, current);
    });

  const withoutCross: InventoryResult[] = [];
  const crossGroups = new Map<string, InventoryResult & { component_skus: string[] }>();

  items.forEach((item) => {
    const sku = normalizeSku(item.sku);
    const itemCrosses = activeCrossesBySku.get(sku) || [];

    if (itemCrosses.length === 0) {
      const result = item.difference;
      withoutCross.push({
        inventory_report_id: reportId,
        result_type: result >= 0 ? 'surplus_without_cross' : 'shortage_without_cross',
        sku,
        item_description: item.item_description,
        cross_name: null,
        original_difference: item.difference,
        conversion_factor: null,
        calculated_result: result,
        manual_result: null,
        final_result: result,
        is_manual_adjusted: false,
        manual_comment: null,
        component_skus: [sku],
      });
      return;
    }

    itemCrosses.forEach((cross) => {
      const calculated = item.difference * cross.conversion_factor;
      const current = crossGroups.get(cross.cross_name);
      if (current) {
        current.original_difference = toNumber(current.original_difference) + item.difference;
        current.calculated_result = toNumber(current.calculated_result) + calculated;
        current.final_result = current.calculated_result;
        current.component_skus = Array.from(new Set([...current.component_skus, sku]));
      } else {
        crossGroups.set(cross.cross_name, {
          inventory_report_id: reportId,
          result_type: calculated >= 0 ? 'surplus_cross' : 'shortage_cross',
          sku: null,
          item_description: null,
          cross_name: cross.cross_name,
          original_difference: item.difference,
          conversion_factor: cross.conversion_factor,
          calculated_result: calculated,
          manual_result: null,
          final_result: calculated,
          is_manual_adjusted: false,
          manual_comment: null,
          component_skus: [sku],
        });
      }
    });
  });

  return [...withoutCross, ...Array.from(crossGroups.values())]
    .map((result): InventoryResult => ({
      ...result,
      result_type: classifyResult(result),
    }))
    .sort(sortByImpact);
}

export default function InventoryResultsScreen() {
  const router = useRouter();
  const { inventory_report_id } = useLocalSearchParams<{ inventory_report_id?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<InventoryResult[]>([]);

  const groupedResults = useMemo(() => {
    return orderedTypes.reduce<Record<ResultType, InventoryResult[]>>((grouped, type) => {
      grouped[type] = results.filter((result) => result.result_type === type).sort(sortByImpact);
      return grouped;
    }, {
      surplus_without_cross: [],
      surplus_cross: [],
      shortage_without_cross: [],
      shortage_cross: [],
    });
  }, [results]);

  useEffect(() => {
    loadResults();
  }, [inventory_report_id]);

  async function loadResults() {
    if (!inventory_report_id) {
      setMessage('Falta el inventory_report_id. Primero crea o carga un informe de inventario.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    const { data: savedResults, error: savedError } = await supabase
      .from('inventory_report_results')
      .select('*')
      .eq('inventory_report_id', inventory_report_id)
      .order('created_at', { ascending: true });

    if (!savedError && savedResults && savedResults.length > 0) {
      setResults(savedResults as InventoryResult[]);
      setLoading(false);
      return;
    }

    if (savedError) {
      setMessage('No se pudieron leer resultados guardados. Se intentará calcular desde CSV.');
    }

    await recalculateFromCsv(false);
    setLoading(false);
  }

  async function recalculateFromCsv(confirmFirst = true) {
    if (!inventory_report_id) return;

    if (confirmFirst && typeof window !== 'undefined') {
      const shouldRecalculate = window.confirm('Esto recalculará desde las líneas CSV y reemplazará los resultados guardados. ¿Continuar?');
      if (!shouldRecalculate) return;
    }

    setSaving(true);
    setMessage(null);

    const { data: items, error: itemsError } = await supabase
      .from('inventory_report_items')
      .select('id, inventory_report_id, sku, item_description, difference')
      .eq('inventory_report_id', inventory_report_id);

    if (itemsError || !items) {
      setSaving(false);
      setMessage('No se pudieron cargar las líneas del inventario: ' + (itemsError?.message || 'sin detalle'));
      return;
    }

    if (items.length === 0) {
      setSaving(false);
      setResults([]);
      setMessage('Este informe todavía no tiene líneas CSV importadas.');
      return;
    }

    const skus = Array.from(new Set(items.map((item) => normalizeSku(item.sku)).filter(Boolean)));
    const { data: crosses, error: crossesError } = await supabase
      .from('inventory_crosses')
      .select('id, sku, cross_name, conversion_factor, is_active')
      .in('sku', skus)
      .eq('is_active', true);

    if (crossesError || !crosses) {
      setSaving(false);
      setMessage('No se pudieron cargar cruces de inventario: ' + (crossesError?.message || 'sin detalle'));
      return;
    }

    const calculatedResults = calculateResults(
      inventory_report_id,
      (items as InventoryItem[]).map((item) => ({ ...item, sku: normalizeSku(item.sku), difference: toNumber(item.difference) })),
      (crosses as InventoryCross[]).map((cross) => ({ ...cross, sku: normalizeSku(cross.sku), conversion_factor: toNumber(cross.conversion_factor) })),
    );

    if (confirmFirst) {
      const { error: deleteError } = await supabase
        .from('inventory_report_results')
        .delete()
        .eq('inventory_report_id', inventory_report_id);

      if (deleteError) {
        setSaving(false);
        setMessage('No se pudieron reemplazar resultados guardados: ' + deleteError.message);
        return;
      }
    }

    setResults(calculatedResults);
    setSaving(false);
    setMessage(`Resultados calculados: ${calculatedResults.length} registros. Fórmula usada: diferencia * factor_conversion.`);
  }

  async function saveResults(nextResults = results) {
    if (!inventory_report_id || nextResults.length === 0) {
      setMessage('No hay resultados para guardar.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: deleteError } = await supabase
      .from('inventory_report_results')
      .delete()
      .eq('inventory_report_id', inventory_report_id);

    if (deleteError) {
      setSaving(false);
      setMessage('No se pudieron reemplazar resultados: ' + deleteError.message);
      return;
    }

    const payload = nextResults.map((result) => ({
      inventory_report_id: inventory_report_id,
      result_type: result.result_type,
      sku: result.sku,
      item_description: result.item_description,
      cross_name: result.cross_name,
      original_difference: result.original_difference,
      conversion_factor: result.conversion_factor,
      calculated_result: result.calculated_result,
      manual_result: result.manual_result,
      final_result: result.final_result,
      is_manual_adjusted: result.is_manual_adjusted,
      manual_comment: result.manual_comment,
      adjusted_by: result.is_manual_adjusted ? (user?.id || result.adjusted_by || null) : result.adjusted_by || null,
      adjusted_at: result.is_manual_adjusted ? (result.adjusted_at || new Date().toISOString()) : result.adjusted_at || null,
    }));

    const { error } = await supabase
      .from('inventory_report_results')
      .insert(payload);

    if (!error) {
      await supabase
        .from('inventory_reports')
        .update({ status: 'results_validated', updated_at: new Date().toISOString() })
        .eq('id', inventory_report_id);
    }

    setSaving(false);

    if (error) {
      setMessage('No se pudieron guardar resultados: ' + error.message);
      return;
    }

    setMessage('Resultados guardados correctamente.');
  }

  function updateManualResult(index: number, value: string) {
    setResults((current) => current.map((result, resultIndex) => {
      if (resultIndex !== index) return result;
      const manualResult = value.trim() === '' ? null : Number(value.replace(',', '.'));
      const isValidNumber = manualResult !== null && Number.isFinite(manualResult);
      return {
        ...result,
        manual_result: isValidNumber ? manualResult : null,
        final_result: isValidNumber ? manualResult : result.calculated_result,
        is_manual_adjusted: isValidNumber || Boolean(result.manual_comment),
        adjusted_at: isValidNumber ? new Date().toISOString() : result.adjusted_at,
        result_type: classifyResult({
          ...result,
          final_result: isValidNumber ? manualResult : result.calculated_result,
        }),
      };
    }));
  }

  function updateManualComment(index: number, value: string) {
    setResults((current) => current.map((result, resultIndex) => {
      if (resultIndex !== index) return result;
      return {
        ...result,
        manual_comment: value,
        is_manual_adjusted: Boolean(value.trim()) || result.manual_result !== null,
        adjusted_at: value.trim() ? new Date().toISOString() : result.adjusted_at,
      };
    }));
  }

  if (loading) {
    return (
      <InventoryShell title="Resultados de Inventario" subtitle="Calculando resultados desde CSV y cruces por SKU.">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brandColors.greenDark} />
          <Text style={styles.hint}>Cargando resultados...</Text>
        </View>
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title="Resultados de Inventario"
      subtitle="Cruces aplicados por SKU exacto normalizado. Fórmula actual: resultado_cruce = diferencia * factor_conversion."
    >
      <View style={styles.form}>
        {message ? <Text style={styles.hint}>{message}</Text> : null}

        <View style={styles.grid}>
          <TouchableOpacity disabled={saving} style={[styles.secondaryButton, saving && styles.disabledButton]} onPress={() => recalculateFromCsv(true)}>
            <Text style={styles.secondaryButtonText}>Recalcular desde CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={saving || results.length === 0} style={[styles.primaryButton, (saving || results.length === 0) && styles.disabledButton]} onPress={() => saveResults()}>
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar resultados calculados'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push({
              pathname: '/modulos/inventarios/validaciones-manuales',
              params: { inventory_report_id },
            })}
          >
            <Text style={styles.secondaryButtonText}>Validar resultados y continuar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {orderedTypes.map((type) => (
        <ResultSection
          key={type}
          title={resultTypeLabels[type]}
          results={groupedResults[type]}
          allResults={results}
          onManualResultChange={updateManualResult}
          onManualCommentChange={updateManualComment}
        />
      ))}
    </InventoryShell>
  );
}

type ResultSectionProps = {
  title: string;
  results: InventoryResult[];
  allResults: InventoryResult[];
  onManualResultChange: (index: number, value: string) => void;
  onManualCommentChange: (index: number, value: string) => void;
};

function ResultSection({ title, results, allResults, onManualResultChange, onManualCommentChange }: ResultSectionProps) {
  return (
    <View style={styles.form}>
      <Text style={styles.blockTitle}>{title}</Text>
      {results.length === 0 ? <Text style={styles.hint}>Sin registros para este bloque.</Text> : null}
      {results.map((result) => {
        const globalIndex = allResults.indexOf(result);
        return (
          <View key={`${result.result_type}-${result.cross_name || result.sku}-${globalIndex}`} style={styles.block}>
            <Text style={styles.blockTitle}>{result.cross_name || `${result.sku} · ${result.item_description || 'Sin descripción'}`}</Text>
            <Text style={styles.blockDescription}>Resultado calculado: {result.calculated_result ?? 0}</Text>
            <Text style={styles.blockDescription}>Resultado final: {result.final_result ?? 0}</Text>
            {result.cross_name ? (
              <Text style={styles.hint}>SKUs incluidos: {(result.component_skus || []).join(', ') || 'Guardado sin detalle de componentes'}</Text>
            ) : (
              <Text style={styles.hint}>Diferencia original: {result.original_difference ?? 0}</Text>
            )}
            <View style={styles.field}>
              <Text style={styles.label}>Resultado manual</Text>
              <TextInput
                style={styles.input}
                defaultValue={result.manual_result !== null && result.manual_result !== undefined ? String(result.manual_result) : ''}
                onChangeText={(value) => onManualResultChange(globalIndex, value)}
                placeholder="Opcional"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Comentario del auditor</Text>
              <TextInput
                style={styles.input}
                defaultValue={result.manual_comment || ''}
                onChangeText={(value) => onManualCommentChange(globalIndex, value)}
                placeholder="Opcional"
              />
            </View>
            {result.is_manual_adjusted ? <Text style={styles.hint}>Modificado manualmente.</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

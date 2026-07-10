import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  physical_stock: number;
  system_stock: number;
  difference: number;
};

type InventoryCross = {
  id: string;
  sku: string;
  cross_name: string;
  conversion_factor: number;
  is_active: boolean;
};

type UnmappedInventoryItem = {
  sku: string;
  item_description: string | null;
  selectedCrossName: string;
  customCrossName: string;
  conversionFactor: string;
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
  component_items?: Array<{
    sku: string;
    item_description: string | null;
    physical_stock: number;
    system_stock: number;
    difference: number;
    converted_difference: number;
  }>;
  physical_stock?: number | null;
  system_stock?: number | null;
};

const DISPLAY_AS_INDEPENDENT_MARKER = '[display_as_independent]';

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

function formatNumber(value: unknown) {
  const number = toNumber(value);
  return new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function classifyResult(result: InventoryResult): ResultType {
  if (toNumber(result.final_result) >= 0) {
    return result.cross_name ? 'surplus_cross' : 'surplus_without_cross';
  }

  return result.cross_name ? 'shortage_cross' : 'shortage_without_cross';
}

function normalizeCrossName(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isCostCross(value: string | null | undefined) {
  return normalizeCrossName(value) === 'COSTO';
}

function isExpenseCross(value: string | null | undefined) {
  return normalizeCrossName(value) === 'GASTO';
}

function isDisplayAsIndependent(result: InventoryResult) {
  return Boolean(result.cross_name && result.manual_comment?.includes(DISPLAY_AS_INDEPENDENT_MARKER));
}

function cleanManualComment(value: string | null | undefined) {
  return String(value || '').replace(DISPLAY_AS_INDEPENDENT_MARKER, '').trim();
}

function getIndependentDisplayDifference(result: InventoryResult) {
  if (!isDisplayAsIndependent(result)) {
    return toNumber(result.final_result);
  }

  return toNumber(result.component_items?.[0]?.converted_difference ?? result.final_result);
}

function sortIndependentByDisplayImpact(left: InventoryResult, right: InventoryResult) {
  return Math.abs(getIndependentDisplayDifference(right)) - Math.abs(getIndependentDisplayDifference(left));
}

function getStockDifference(item: InventoryItem) {
  const physicalStock = toNumber(item.physical_stock);
  const systemStock = toNumber(item.system_stock);
  return physicalStock - systemStock;
}

function getConvertedDifference(item: InventoryItem, conversionFactor: number) {
  if (conversionFactor === 1) {
    return toNumber(item.difference);
  }

  return getStockDifference(item) * conversionFactor;
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
    const stockDifference = getStockDifference(item);

    if (itemCrosses.length === 0) {
      const result = stockDifference;
      withoutCross.push({
        inventory_report_id: reportId,
        result_type: result >= 0 ? 'surplus_without_cross' : 'shortage_without_cross',
        sku,
        item_description: item.item_description,
        cross_name: null,
        original_difference: stockDifference,
        conversion_factor: null,
        calculated_result: result,
        manual_result: null,
        final_result: result,
        is_manual_adjusted: false,
        manual_comment: null,
        component_skus: [sku],
        physical_stock: item.physical_stock,
        system_stock: item.system_stock,
      });
      return;
    }

    itemCrosses.forEach((cross) => {
      if (isCostCross(cross.cross_name)) {
        const result = stockDifference;
        withoutCross.push({
          inventory_report_id: reportId,
          result_type: result >= 0 ? 'surplus_without_cross' : 'shortage_without_cross',
          sku,
          item_description: item.item_description,
          cross_name: null,
          original_difference: stockDifference,
          conversion_factor: cross.conversion_factor,
          calculated_result: result,
          manual_result: null,
          final_result: result,
          is_manual_adjusted: false,
          manual_comment: null,
          component_skus: [sku],
          physical_stock: item.physical_stock,
          system_stock: item.system_stock,
        });
        return;
      }

      const calculated = getConvertedDifference(item, cross.conversion_factor);
      const originalDifference = cross.conversion_factor === 1 ? toNumber(item.difference) : stockDifference;
      const current = crossGroups.get(cross.cross_name);
      if (current) {
        current.original_difference = toNumber(current.original_difference) + originalDifference;
        current.calculated_result = toNumber(current.calculated_result) + calculated;
        current.final_result = current.calculated_result;
        current.component_skus = Array.from(new Set([...current.component_skus, sku]));
        current.sku = null;
        current.item_description = null;
        current.physical_stock = null;
        current.system_stock = null;
        current.component_items = [
          ...(current.component_items || []),
          {
            sku,
            item_description: item.item_description,
            physical_stock: item.physical_stock,
            system_stock: item.system_stock,
            difference: originalDifference,
            converted_difference: calculated,
          },
        ];
      } else {
        crossGroups.set(cross.cross_name, {
          inventory_report_id: reportId,
          result_type: calculated >= 0 ? 'surplus_cross' : 'shortage_cross',
          sku,
          item_description: item.item_description,
          cross_name: cross.cross_name,
          original_difference: originalDifference,
          conversion_factor: cross.conversion_factor,
          calculated_result: calculated,
          manual_result: null,
          final_result: calculated,
          is_manual_adjusted: false,
          manual_comment: null,
          component_skus: [sku],
          physical_stock: item.physical_stock,
          system_stock: item.system_stock,
          component_items: [{
            sku,
            item_description: item.item_description,
            physical_stock: item.physical_stock,
            system_stock: item.system_stock,
            difference: originalDifference,
            converted_difference: calculated,
          }],
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

async function calculateResultsFromCsv(reportId: string) {
  const { data: items, error: itemsError } = await supabase
    .from('inventory_report_items')
    .select('id, inventory_report_id, sku, item_description, physical_stock, system_stock, difference')
    .eq('inventory_report_id', reportId);

  if (itemsError || !items) {
    return { results: [], unmappedItems: [], error: itemsError?.message || 'No se pudieron cargar las líneas del inventario.' };
  }

  const normalizedItems = (items as InventoryItem[]).map((item) => ({
    ...item,
    sku: normalizeSku(item.sku),
    physical_stock: toNumber(item.physical_stock),
    system_stock: toNumber(item.system_stock),
    difference: toNumber(item.difference),
  }));

  if (normalizedItems.length === 0) {
    return { results: [], unmappedItems: [], error: null };
  }

  const skus = Array.from(new Set(normalizedItems.map((item) => normalizeSku(item.sku)).filter(Boolean)));
  const { data: crosses, error: crossesError } = await supabase
    .from('inventory_crosses')
    .select('id, sku, cross_name, conversion_factor, is_active')
    .in('sku', skus)
    .eq('is_active', true);

  if (crossesError || !crosses) {
    return { results: [], unmappedItems: [], error: crossesError?.message || 'No se pudieron cargar cruces de inventario.' };
  }

  const normalizedCrosses = (crosses as InventoryCross[]).map((cross) => ({
    ...cross,
    sku: normalizeSku(cross.sku),
    conversion_factor: toNumber(cross.conversion_factor),
  }));
  const activeCrossSkuSet = new Set(normalizedCrosses.map((cross) => normalizeSku(cross.sku)));
  const unmappedItems = normalizedItems
    .filter((item) => item.sku && !activeCrossSkuSet.has(item.sku))
    .map((item) => ({
      sku: item.sku,
      item_description: item.item_description,
      selectedCrossName: 'COSTO',
      customCrossName: '',
      conversionFactor: '1',
    }));

  return {
    results: calculateResults(reportId, normalizedItems, normalizedCrosses),
    unmappedItems,
    error: null,
  };
}

function mergeSavedResultsWithCalculatedDetails(savedResults: InventoryResult[], calculatedResults: InventoryResult[]) {
  return savedResults.map((savedResult) => {
    if (!savedResult.cross_name) {
      const calculatedDetail = calculatedResults.find((calculatedResult) =>
        !calculatedResult.cross_name
        && normalizeSku(String(calculatedResult.sku || '')) === normalizeSku(String(savedResult.sku || ''))
      );

      if (!calculatedDetail) return savedResult;

      return {
        ...savedResult,
        component_skus: calculatedDetail.component_skus,
        physical_stock: calculatedDetail.physical_stock,
        system_stock: calculatedDetail.system_stock,
      };
    }

    const calculatedDetail = calculatedResults.find((calculatedResult) =>
      calculatedResult.cross_name === savedResult.cross_name
      && calculatedResult.result_type === savedResult.result_type
      && !isDisplayAsIndependent(savedResult)
    ) || calculatedResults.find((calculatedResult) =>
      calculatedResult.cross_name === savedResult.cross_name
      && !isDisplayAsIndependent(savedResult)
    );

    if (!calculatedDetail) return savedResult;

    return {
      ...savedResult,
      component_skus: calculatedDetail.component_skus,
      component_items: calculatedDetail.component_items,
      physical_stock: calculatedDetail.physical_stock,
      system_stock: calculatedDetail.system_stock,
    };
  });
}

export default function InventoryResultsScreen() {
  const router = useRouter();
  const { inventory_report_id } = useLocalSearchParams<{ inventory_report_id?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<InventoryResult[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [manualDraft, setManualDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [unmappedItems, setUnmappedItems] = useState<UnmappedInventoryItem[]>([]);
  const [showUnmappedItems, setShowUnmappedItems] = useState(false);

  const shortageResults = useMemo(() => {
    return results.filter((result) => toNumber(result.final_result) < 0 && !isExpenseCross(result.cross_name)).sort(sortByImpact);
  }, [results]);

  const surplusResults = useMemo(() => {
    return results.filter((result) => toNumber(result.final_result) >= 0 && !isExpenseCross(result.cross_name)).sort(sortByImpact);
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
      const calculatedFromCsv = await calculateResultsFromCsv(inventory_report_id);
      setUnmappedItems(calculatedFromCsv.unmappedItems);
      setShowUnmappedItems(calculatedFromCsv.unmappedItems.length > 0);
      setResults(mergeSavedResultsWithCalculatedDetails(savedResults as InventoryResult[], calculatedFromCsv.results));
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

    const calculatedFromCsv = await calculateResultsFromCsv(inventory_report_id);

    if (calculatedFromCsv.error) {
      setSaving(false);
      setMessage(calculatedFromCsv.error);
      return;
    }

    if (calculatedFromCsv.results.length === 0) {
      setSaving(false);
      setResults([]);
      setMessage('Este informe todavía no tiene líneas CSV importadas.');
      return;
    }

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

    setUnmappedItems(calculatedFromCsv.unmappedItems);
    setShowUnmappedItems(calculatedFromCsv.unmappedItems.length > 0);
    setResults(calculatedFromCsv.results);
    setSaving(false);
    setMessage(calculatedFromCsv.unmappedItems.length > 0
      ? `Resultados calculados: ${calculatedFromCsv.results.length} registros. Hay ${calculatedFromCsv.unmappedItems.length} SKU sin cruce configurado.`
      : `Resultados calculados: ${calculatedFromCsv.results.length} registros.`);
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

  function openManualEdit(index: number) {
    const result = results[index];
    if (!result) return;
    setEditingIndex(index);
    setManualDraft(result.manual_result !== null && result.manual_result !== undefined ? String(result.manual_result) : '');
    setCommentDraft(result.manual_comment || '');
  }

  function closeManualEdit() {
    setEditingIndex(null);
    setManualDraft('');
    setCommentDraft('');
  }

  function applyManualEdit() {
    if (editingIndex === null) return;
    updateManualResult(editingIndex, manualDraft);
    updateManualComment(editingIndex, commentDraft);
    closeManualEdit();
  }

  function toggleSingleCrossDisplay(index: number) {
    setResults((current) => current.map((result, resultIndex) => {
      if (resultIndex !== index) return result;
      const isMoved = isDisplayAsIndependent(result);
      const currentComment = cleanManualComment(result.manual_comment);
      return {
        ...result,
        manual_comment: isMoved
          ? (currentComment || null)
          : [DISPLAY_AS_INDEPENDENT_MARKER, currentComment].filter(Boolean).join(' '),
        is_manual_adjusted: result.is_manual_adjusted || !isMoved,
        adjusted_at: new Date().toISOString(),
      };
    }));
  }

  function updateUnmappedItem(index: number, patch: Partial<UnmappedInventoryItem>) {
    setUnmappedItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function saveUnmappedItem(index: number) {
    const item = unmappedItems[index];
    if (!item) return;

    const crossName = item.selectedCrossName === 'OTRO' ? item.customCrossName.trim() : item.selectedCrossName;
    const conversionFactor = Number(item.conversionFactor.replace(',', '.'));

    if (!crossName) {
      setMessage('Ingresa el nombre del cruce para el SKU pendiente.');
      return;
    }

    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      setMessage('El factor de conversión debe ser mayor a 0.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('inventory_crosses')
      .upsert([{
        sku: item.sku,
        item_description: item.item_description || null,
        cross_name: crossName,
        conversion_factor: conversionFactor,
        is_active: true,
        created_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'sku,cross_name' });

    setSaving(false);

    if (error) {
      setMessage('No se pudo registrar el cruce pendiente: ' + error.message);
      return;
    }

    setUnmappedItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setMessage(`SKU ${item.sku} registrado en la base de cruces. Recalcula desde CSV para aplicarlo.`);
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
      subtitle="Cruces aplicados por SKU exacto normalizado."
    >
      <View style={styles.form}>
        {message ? <Text style={styles.hint}>{message}</Text> : null}

        <View style={styles.footerActions}>
          <TouchableOpacity disabled={saving} style={[styles.secondaryButton, styles.footerSecondaryButton, saving && styles.disabledButton]} onPress={() => recalculateFromCsv(true)}>
            <Text style={styles.secondaryButtonText}>Recalcular desde CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={saving || results.length === 0} style={[styles.primaryButton, styles.footerPrimaryButton, (saving || results.length === 0) && styles.disabledButton]} onPress={() => saveResults()}>
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar resultados calculados'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, styles.footerSecondaryButton]}
            onPress={() => router.push({
              pathname: '/modulos/inventarios/validaciones-manuales',
              params: { inventory_report_id },
            })}
          >
            <Text style={styles.secondaryButtonText}>Siguiente</Text>
          </TouchableOpacity>
        </View>
      </View>

      {unmappedItems.length > 0 ? (
        <View style={styles.form}>
          <TouchableOpacity style={styles.footerActions} onPress={() => setShowUnmappedItems((current) => !current)}>
            <Text style={styles.errorText}>Alerta: {unmappedItems.length} SKU sin cruce configurado</Text>
            <Text style={styles.secondaryButtonText}>{showUnmappedItems ? 'Ocultar detalle' : 'Ver detalle'}</Text>
          </TouchableOpacity>

          {showUnmappedItems ? (
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={styles.tableHeader}>SKU</Text>
                <Text style={styles.tableHeader}>Descripción</Text>
                <Text style={styles.tableHeader}>Categoría</Text>
                <Text style={styles.tableHeader}>Cruce</Text>
                <Text style={styles.tableHeader}>Factor</Text>
                <Text style={styles.tableHeader}>Acción</Text>
              </View>
              {unmappedItems.map((item, index) => (
                <View key={item.sku} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{item.sku}</Text>
                  <Text style={styles.tableCell}>{item.item_description || '-'}</Text>
                  <View style={styles.recountTableInput}>
                    <View style={styles.footerActions}>
                      {['COSTO', 'GASTO', 'OTRO'].map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={[styles.evidenceMiniButton, item.selectedCrossName === option && styles.selectedButton]}
                          onPress={() => updateUnmappedItem(index, { selectedCrossName: option })}
                        >
                          <Text style={styles.secondaryButtonText}>{option}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <TextInput
                    style={styles.recountTableInput}
                    value={item.selectedCrossName === 'OTRO' ? item.customCrossName : item.selectedCrossName}
                    editable={item.selectedCrossName === 'OTRO'}
                    onChangeText={(value) => updateUnmappedItem(index, { customCrossName: value })}
                    placeholder="Nombre del cruce"
                    placeholderTextColor={brandColors.inputPlaceholder}
                  />
                  <TextInput
                    style={styles.recountTableInput}
                    value={item.conversionFactor}
                    onChangeText={(value) => updateUnmappedItem(index, { conversionFactor: value })}
                    placeholder="1"
                    keyboardType="decimal-pad"
                    placeholderTextColor={brandColors.inputPlaceholder}
                  />
                  <TouchableOpacity disabled={saving} style={styles.recountRemoveButton} onPress={() => saveUnmappedItem(index)}>
                    <Text style={styles.secondaryButtonText}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <ResultSection
        title="1. Faltantes"
        description="Incluye ítems sin cruce y cruces cuyo resultado final es negativo."
        results={shortageResults}
        allResults={results}
        onEditResult={openManualEdit}
        onToggleSingleCrossDisplay={toggleSingleCrossDisplay}
      />

      <ResultSection
        title="2. Sobrantes"
        description="Incluye ítems sin cruce y cruces cuyo resultado final es cero o positivo."
        results={surplusResults}
        allResults={results}
        onEditResult={openManualEdit}
        onToggleSingleCrossDisplay={toggleSingleCrossDisplay}
      />
      <ManualEditModal
        visible={editingIndex !== null}
        result={editingIndex !== null ? results[editingIndex] : null}
        manualDraft={manualDraft}
        commentDraft={commentDraft}
        onManualDraftChange={setManualDraft}
        onCommentDraftChange={setCommentDraft}
        onCancel={closeManualEdit}
        onApply={applyManualEdit}
      />
    </InventoryShell>
  );
}

type ResultSectionProps = {
  title: string;
  description: string;
  results: InventoryResult[];
  allResults: InventoryResult[];
  onEditResult: (index: number) => void;
  onToggleSingleCrossDisplay: (index: number) => void;
};

function ResultSection({ title, description, results, allResults, onEditResult, onToggleSingleCrossDisplay }: ResultSectionProps) {
  const independentResults = results
    .filter((result) => !result.cross_name || isDisplayAsIndependent(result))
    .sort(sortIndependentByDisplayImpact);
  const crossResults = results.filter((result) => result.cross_name && !isDisplayAsIndependent(result));

  return (
    <View style={styles.form}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.hint}>{description}</Text>

      {results.length === 0 ? (
        <Text style={styles.hint}>Sin registros para este bloque.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.reportTableArticleHeader}>Artículo</Text>
            <Text style={styles.reportTableNumberHeader}>Stock físico</Text>
            <Text style={styles.reportTableNumberHeader}>Stock actual</Text>
            <Text style={styles.reportTableNumberHeader}>Diferencia</Text>
          </View>

          {independentResults.map((result) => {
            const globalIndex = allResults.indexOf(result);
            const movedFromCross = isDisplayAsIndependent(result);
            const firstComponent = result.component_items?.[0];
            const displaySku = movedFromCross ? firstComponent?.sku || result.component_skus?.[0] || result.sku : result.sku;
            const displayDescription = movedFromCross ? firstComponent?.item_description || result.item_description : result.item_description;
            const displayPhysical = movedFromCross ? firstComponent?.physical_stock ?? result.physical_stock : result.physical_stock;
            const displaySystem = movedFromCross ? firstComponent?.system_stock ?? result.system_stock : result.system_stock;
            const displayDifference = movedFromCross ? firstComponent?.converted_difference ?? result.final_result : result.final_result;
            return (
              <TouchableOpacity key={`${result.result_type}-${result.sku}-${globalIndex}`} style={styles.tableRow} onPress={() => onEditResult(globalIndex)} activeOpacity={0.85}>
                <View style={styles.reportTableArticleCell}>
                  <Text style={styles.reportTableArticleTitle}>{displaySku || 'sin SKU'} · {displayDescription || 'Sin descripción'}</Text>
                  {movedFromCross ? (
                    <>
                      <Text style={styles.hint}>Cruce original: {result.cross_name}</Text>
                      <Text style={styles.reportTableActionText} onPress={() => onToggleSingleCrossDisplay(globalIndex)}>Devolver a cruces</Text>
                    </>
                  ) : null}
                  {result.is_manual_adjusted ? <Text style={styles.hint}>Ajuste manual aplicado</Text> : null}
                </View>
                <Text style={styles.reportTableNumberCell}>{formatNumber(displayPhysical)}</Text>
                <Text style={styles.reportTableNumberCell}>{formatNumber(displaySystem)}</Text>
                <Text style={toNumber(displayDifference) < 0 ? styles.reportTableNegativeCell : styles.reportTablePositiveCell}>
                  {formatNumber(displayDifference)}
                </Text>
              </TouchableOpacity>
            );
          })}

          {independentResults.length > 0 && crossResults.length > 0 ? <View style={styles.reportTableSpacer} /> : null}

          {crossResults.map((result) => {
            const globalIndex = allResults.indexOf(result);
            const componentItems = result.component_items || [];

            return (
              <View key={`${result.result_type}-${result.cross_name}-${globalIndex}`}>
                {componentItems.length > 0 ? componentItems.map((item) => (
                  <View key={`${result.cross_name}-${item.sku}`} style={styles.tableRow}>
                    <View style={styles.reportTableArticleCell}>
                      <Text style={styles.reportTableArticleTitle}>{item.sku} · {item.item_description || 'Sin descripción'}</Text>
                    </View>
                    <Text style={styles.reportTableNumberCell}>{formatNumber(item.physical_stock)}</Text>
                    <Text style={styles.reportTableNumberCell}>{formatNumber(item.system_stock)}</Text>
                    <Text style={toNumber(item.converted_difference) < 0 ? styles.reportTableNegativeCell : styles.reportTablePositiveCell}>
                      {formatNumber(item.converted_difference)}
                    </Text>
                  </View>
                )) : (
                  <View style={styles.tableRow}>
                    <View style={styles.reportTableArticleCell}>
                      <Text style={styles.reportTableArticleTitle}>SKUs: {(result.component_skus || []).join(', ') || 'sin detalle guardado'}</Text>
                    </View>
                    <Text style={styles.reportTableNumberCell}>-</Text>
                    <Text style={styles.reportTableNumberCell}>-</Text>
                    <Text style={toNumber(result.final_result) < 0 ? styles.reportTableNegativeCell : styles.reportTablePositiveCell}>
                      {formatNumber(result.final_result)}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.tableRow,
                    toNumber(result.final_result) < 0 ? styles.reportTableTotalShortageRow : styles.reportTableTotalSurplusRow,
                  ]}
                  onPress={() => onEditResult(globalIndex)}
                  activeOpacity={0.85}
                >
                  <View style={[
                    styles.reportTableTotalArticleCell,
                    toNumber(result.final_result) < 0 ? styles.reportTableTotalShortageRow : styles.reportTableTotalSurplusRow,
                  ]}>
                    {componentItems.length === 1 ? (
                      <Text style={styles.reportTableActionText} onPress={() => onToggleSingleCrossDisplay(globalIndex)}>Mover arriba</Text>
                    ) : null}
                    {result.is_manual_adjusted ? <Text style={styles.hint}>Ajuste manual aplicado</Text> : null}
                  </View>
                  <Text style={[
                    styles.reportTableTotalNumberCell,
                    toNumber(result.final_result) < 0 ? styles.reportTableTotalShortageRow : styles.reportTableTotalSurplusRow,
                  ]}>-</Text>
                  <View style={[
                    styles.reportTableTotalLabelCell,
                    toNumber(result.final_result) < 0 ? styles.reportTableTotalShortageRow : styles.reportTableTotalSurplusRow,
                  ]}>
                    <Text style={styles.reportTableTotalTitle}>TOTAL DE CRUCE {result.cross_name}</Text>
                  </View>
                  <Text style={[
                    styles.reportTableTotalDifferenceCell,
                    toNumber(result.final_result) < 0 ? styles.reportTableTotalShortageRow : styles.reportTableTotalSurplusRow,
                  ]}>
                    {formatNumber(result.final_result)}
                  </Text>
                </TouchableOpacity>

                <View style={styles.reportTableSpacer} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.form}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.hint}>{description}</Text>

      {results.length === 0 ? (
        <Text style={styles.hint}>Sin registros para este bloque.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.reportTableArticleHeader}>Artículo</Text>
            <Text style={styles.reportTableNumberHeader}>Stock físico</Text>
            <Text style={styles.reportTableNumberHeader}>Stock actual</Text>
            <Text style={styles.reportTableNumberHeader}>Diferencia</Text>
          </View>

          {results.map((result) => {
            const globalIndex = allResults.indexOf(result);
            const isCross = Boolean(result.cross_name);
            const articleText = isCross
              ? `SKUs: ${(result.component_skus || []).join(', ') || 'sin detalle guardado'} · ${result.cross_name || 'Cruce'}`
              : `${result.sku || 'sin SKU'} · ${result.item_description || 'Sin descripción'}`;

            return (
              <View key={`${result.result_type}-${result.cross_name || result.sku}-${globalIndex}`}>
                <TouchableOpacity style={styles.tableRow} onPress={() => onEditResult(globalIndex)} activeOpacity={0.85}>
                  <View style={styles.reportTableArticleCell}>
                    <Text style={styles.reportTableArticleTitle}>{articleText}</Text>
                    {result.is_manual_adjusted || isCross ? (
                      <Text style={styles.hint}>{result.is_manual_adjusted ? 'Ajuste manual aplicado' : 'Cruce aplicado'}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.reportTableNumberCell}>{isCross ? '-' : formatNumber(result.physical_stock)}</Text>
                  <Text style={styles.reportTableNumberCell}>{isCross ? '-' : formatNumber(result.system_stock)}</Text>
                  <Text style={toNumber(result.final_result) < 0 ? styles.reportTableNegativeCell : styles.reportTablePositiveCell}>
                    {formatNumber(result.final_result)}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

type ManualEditModalProps = {
  visible: boolean;
  result: InventoryResult | null;
  manualDraft: string;
  commentDraft: string;
  onManualDraftChange: (value: string) => void;
  onCommentDraftChange: (value: string) => void;
  onCancel: () => void;
  onApply: () => void;
};

function ManualEditModal({
  visible,
  result,
  manualDraft,
  commentDraft,
  onManualDraftChange,
  onCommentDraftChange,
  onCancel,
  onApply,
}: ManualEditModalProps) {
  const isCross = Boolean(result?.cross_name);
  const title = result
    ? isCross
      ? result.cross_name || 'Cruce'
      : `${result.sku || 'sin SKU'} · ${result.item_description || 'Sin descripción'}`
    : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.blockTitle}>Corregir resultado</Text>
          <Text style={styles.blockDescription}>{title}</Text>
          {isCross ? <Text style={styles.hint}>SKUs incluidos: {(result?.component_skus || []).join(', ') || 'sin detalle guardado'}</Text> : null}
          <Text style={styles.hint}>Resultado calculado: {formatNumber(result?.calculated_result)}</Text>
          <Text style={styles.hint}>Resultado actual: {formatNumber(result?.final_result)}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Resultado corregido</Text>
            <TextInput
              style={styles.input}
              value={manualDraft}
              onChangeText={onManualDraftChange}
              placeholder="Ej. -2.50"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Comentario del auditor</Text>
            <TextInput
              style={styles.input}
              value={commentDraft}
              onChangeText={onCommentDraftChange}
              placeholder="Motivo de la corrección"
            />
          </View>

          <View style={styles.footerActions}>
            <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={onCancel}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, styles.footerPrimaryButton]} onPress={onApply}>
              <Text style={styles.primaryButtonText}>Aplicar corrección</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}



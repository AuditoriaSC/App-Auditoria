import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';

type ParsedCrossRow = {
  rowNumber: number;
  sku: string;
  itemDescription: string;
  crossName: string;
  conversionFactor: number | null;
  errors: string[];
};

type ValidationSummary = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateSkus: string[];
};

type InventoryCrossRow = {
  id: string;
  sku: string;
  item_description: string | null;
  cross_name: string;
  conversion_factor: number | string;
  is_active: boolean;
  updated_at: string;
};

type ManualCrossDraft = {
  sku: string;
  itemDescription: string;
  crossName: string;
  conversionFactor: string;
};

const requiredColumns = {
  sku: 'SKU',
  itemDescription: 'Descripción del artículo',
  crossName: 'Cruce asignado',
  conversionFactor: 'Factor de conversión',
} as const;

const crossesCsvTemplate = [
  'SKU;Descripción del artículo;Cruce asignado;Factor de conversión',
  '00123;Producto prueba con ñ;Materia prima A;1',
  '00456;Producto prueba con tilde café;Materia prima B;0,5',
].join('\n');

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  if (semicolonCount > 0) return ';';
  return commaCount > 0 ? ',' : ';';
}

function parseCsv(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((cell) => cell.trim() !== ''));
}

function parseFactor(value: string) {
  const normalizedValue = value.trim().replace(',', '.');
  if (!normalizedValue) return null;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readCsvFile(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (!utf8Text.includes('\uFFFD')) return utf8Text;
  return new TextDecoder('windows-1252').decode(buffer);
}

function buildRows(csvText: string) {
  const parsed = parseCsv(csvText);
  const [headerRow, ...dataRows] = parsed;
  if (!headerRow) {
    return { rows: [], missingColumns: Object.values(requiredColumns) };
  }

  const headerMap = new Map<string, number>();
  headerRow.forEach((header, index) => headerMap.set(normalizeHeader(header), index));

  const columnIndexes = {
    sku: headerMap.get(normalizeHeader(requiredColumns.sku)),
    itemDescription: headerMap.get(normalizeHeader(requiredColumns.itemDescription)),
    crossName: headerMap.get(normalizeHeader(requiredColumns.crossName)),
    conversionFactor: headerMap.get(normalizeHeader(requiredColumns.conversionFactor)),
  };

  const missingColumns = Object.entries(columnIndexes)
    .filter(([, index]) => index === undefined)
    .map(([key]) => requiredColumns[key as keyof typeof requiredColumns]);

  if (missingColumns.length > 0) {
    return { rows: [], missingColumns };
  }

  const rows = dataRows.map((dataRow, index): ParsedCrossRow => {
    const sku = String(dataRow[columnIndexes.sku!] ?? '').trim();
    const itemDescription = String(dataRow[columnIndexes.itemDescription!] ?? '').trim();
    const crossName = String(dataRow[columnIndexes.crossName!] ?? '').trim();
    const conversionFactor = parseFactor(String(dataRow[columnIndexes.conversionFactor!] ?? ''));
    const errors: string[] = [];

    if (!sku) errors.push('SKU vacío');
    if (!crossName) errors.push('Cruce asignado vacío');
    if (conversionFactor === null) errors.push('Factor de conversión inválido');
    if (conversionFactor !== null && conversionFactor <= 0) errors.push('Factor de conversión debe ser mayor a 0');

    return {
      rowNumber: index + 2,
      sku,
      itemDescription,
      crossName,
      conversionFactor,
      errors,
    };
  });

  return { rows, missingColumns };
}

function summarizeRows(rows: ParsedCrossRow[]): ValidationSummary {
  const skuCount = new Map<string, number>();
  rows.forEach((row) => {
    if (!row.sku) return;
    skuCount.set(row.sku, (skuCount.get(row.sku) || 0) + 1);
  });

  const duplicateSkus = Array.from(skuCount.entries())
    .filter(([, count]) => count > 1)
    .map(([sku]) => sku);

  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.errors.length === 0).length,
    errorRows: rows.filter((row) => row.errors.length > 0).length,
    duplicateSkus,
  };
}

export default function InventoryCrossesBaseScreen() {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedCrossRow[]>([]);
  const [crosses, setCrosses] = useState<InventoryCrossRow[]>([]);
  const [draft, setDraft] = useState<ManualCrossDraft>({
    sku: '',
    itemDescription: '',
    crossName: '',
    conversionFactor: '1',
  });
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingCrosses, setLoadingCrosses] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDuplicateSkus, setShowDuplicateSkus] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const canConfirm = rows.length > 0 && missingColumns.length === 0 && summary.errorRows === 0;
  const duplicateSkuSet = useMemo(() => new Set(summary.duplicateSkus), [summary.duplicateSkus]);
  const filteredCrosses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return crosses;
    return crosses.filter((cross) => {
      return [
        cross.sku,
        cross.item_description || '',
        cross.cross_name,
      ].some((value) => String(value).toLowerCase().includes(term));
    });
  }, [crosses, searchTerm]);
  const activeCount = crosses.filter((cross) => cross.is_active).length;
  const inactiveCount = crosses.length - activeCount;

  useEffect(() => {
    loadCrosses();
  }, []);

  const loadCrosses = async () => {
    setLoadingCrosses(true);

    const { data, error } = await supabase
      .from('inventory_crosses')
      .select('id, sku, item_description, cross_name, conversion_factor, is_active, updated_at')
      .order('sku', { ascending: true })
      .order('cross_name', { ascending: true });

    if (error) {
      setMessage('No se pudo cargar la base de cruces: ' + error.message);
    } else {
      setCrosses((data || []) as InventoryCrossRow[]);
    }

    setLoadingCrosses(false);
  };

  const resetUpload = () => {
    setFileName('');
    setRows([]);
    setMissingColumns([]);
    setShowDuplicateSkus(false);
    setMessage(null);
  };

  const handleCsvText = (name: string, text: string) => {
    const { rows: parsedRows, missingColumns: missing } = buildRows(text);
    setFileName(name);
    setRows(parsedRows);
    setMissingColumns(missing);
    setShowDuplicateSkus(false);
    setMessage(missing.length > 0 ? `Faltan columnas obligatorias: ${missing.join(', ')}.` : null);
  };

  const selectFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setMessage('La carga de cruces está disponible solo en Web local.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.csv')) {
        resetUpload();
        setMessage('Selecciona un archivo CSV válido.');
        return;
      }

      readCsvFile(file)
        .then((text) => handleCsvText(file.name, text))
        .catch(() => setMessage('No se pudo leer el archivo CSV.'));
    };
    input.click();
  };

  const downloadTemplate = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setMessage('La descarga de plantilla está disponible solo en Web local.');
      return;
    }

    const blob = new Blob([`\uFEFF${crossesCsvTemplate}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_cruces_inventario.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const confirmUpload = async () => {
    if (!canConfirm) {
      setMessage('Corrige los errores antes de confirmar la carga.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar el usuario logueado.');
      setSaving(false);
      return;
    }

    const payload = rows.map((row) => ({
      sku: row.sku,
      item_description: row.itemDescription || null,
      cross_name: row.crossName,
      conversion_factor: row.conversionFactor,
      is_active: true,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('inventory_crosses')
      .upsert(payload, { onConflict: 'sku,cross_name', ignoreDuplicates: true });

    setSaving(false);

    if (error) {
      setMessage('No se pudo cargar la base de cruces: ' + error.message);
      return;
    }

    resetUpload();
    setMessage('Carga confirmada: se añadieron los cruces nuevos. Los SKU + cruce que ya existían se mantuvieron intactos.');
    await loadCrosses();
  };

  const saveManualCross = async () => {
    const sku = draft.sku.trim();
    const crossName = draft.crossName.trim();
    const conversionFactor = parseFactor(draft.conversionFactor);

    if (!sku || !crossName || conversionFactor === null || conversionFactor <= 0) {
      setMessage('Completa SKU, cruce asignado y un factor mayor a 0.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar el usuario logueado.');
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('inventory_crosses')
      .upsert([{
        sku,
        item_description: draft.itemDescription.trim() || null,
        cross_name: crossName,
        conversion_factor: conversionFactor,
        is_active: true,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'sku,cross_name' });

    setSaving(false);

    if (error) {
      setMessage('No se pudo guardar el cruce: ' + error.message);
      return;
    }

    setDraft({ sku: '', itemDescription: '', crossName: '', conversionFactor: '1' });
    setMessage('Cruce guardado correctamente.');
    await loadCrosses();
  };

  const updateCrossFactor = async (cross: InventoryCrossRow) => {
    const conversionFactor = parseFactor(String(cross.conversion_factor));

    if (conversionFactor === null || conversionFactor <= 0) {
      setMessage('El factor de conversión debe ser numérico y mayor a 0.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('inventory_crosses')
      .update({
        conversion_factor: conversionFactor,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cross.id);

    setSaving(false);

    if (error) {
      setMessage('No se pudo actualizar el factor: ' + error.message);
      return;
    }

    setMessage('Factor actualizado.');
    await loadCrosses();
  };

  const toggleCrossStatus = async (cross: InventoryCrossRow) => {
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('inventory_crosses')
      .update({
        is_active: !cross.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cross.id);

    setSaving(false);

    if (error) {
      setMessage('No se pudo cambiar el estado del artículo: ' + error.message);
      return;
    }

    await loadCrosses();
  };

  return (
    <InventoryShell
      title="Cruces de Inventario"
      subtitle="Base maestra reutilizable por SKU exacto. Esta tabla alimenta los resultados de sobrantes y faltantes."
      backLabel="← Volver a Administración"
      backRoute="/modulos/administracion"
    >
      <View style={styles.form}>
        {message ? <Text style={missingColumns.length > 0 ? styles.errorText : styles.hint}>{message}</Text> : null}

        <View style={styles.footerActions}>
          <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={downloadTemplate}>
            <Text style={styles.secondaryButtonText}>Descargar plantilla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, styles.footerPrimaryButton]} onPress={selectFile}>
            <Text style={styles.primaryButtonText}>Seleccionar CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={resetUpload}>
            <Text style={styles.secondaryButtonText}>Cancelar selección</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canConfirm || saving}
            style={[styles.primaryButton, styles.footerPrimaryButton, (!canConfirm || saving) && styles.disabledButton]}
            onPress={confirmUpload}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Cargando...' : 'Confirmar carga'}</Text>
          </TouchableOpacity>
        </View>

        {fileName ? <Text style={styles.hint}>Archivo seleccionado: {fileName}</Text> : null}

        <View style={styles.grid}>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricValue}>{summary.totalRows}</Text>
            <Text style={styles.metricLabel}>Filas leídas</Text>
          </View>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricValue}>{summary.validRows}</Text>
            <Text style={styles.metricLabel}>Filas válidas</Text>
          </View>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricDangerValue}>{summary.errorRows}</Text>
            <Text style={styles.metricLabel}>Filas con error</Text>
          </View>
          <TouchableOpacity
            style={styles.smallMetricCard}
            onPress={() => setShowDuplicateSkus((current) => !current)}
            disabled={summary.duplicateSkus.length === 0}
          >
            <Text style={styles.metricValue}>{summary.duplicateSkus.length}</Text>
            <Text style={styles.metricLabel}>SKUs duplicados</Text>
            {summary.duplicateSkus.length > 0 ? <Text style={styles.hint}>{showDuplicateSkus ? 'Ocultar detalle' : 'Ver detalle'}</Text> : null}
          </TouchableOpacity>
        </View>

        {showDuplicateSkus && summary.duplicateSkus.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>SKUs duplicados en el archivo</Text>
            <View style={styles.grid}>
              {summary.duplicateSkus.map((sku) => (
                <View key={sku} style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{sku}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {rows.length > 0 ? (
          <>
          <View style={styles.field}>
            <Text style={styles.label}>Buscar en cruces guardados</Text>
            <TextInput
              style={styles.input}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Buscar por SKU, descripción o cruce"
              placeholderTextColor={brandColors.inputPlaceholder}
            />
          </View>
          <Text style={styles.hint}>Mostrando {filteredCrosses.length} de {crosses.length} cruces guardados.</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Fila</Text>
              <Text style={styles.tableHeader}>SKU</Text>
              <Text style={styles.tableHeader}>Descripción</Text>
              <Text style={styles.tableHeader}>Cruce</Text>
              <Text style={styles.tableHeader}>Factor</Text>
              <Text style={styles.tableHeader}>Estado</Text>
            </View>
            {rows.map((row) => (
              <View key={row.rowNumber} style={styles.tableRow}>
                <Text style={styles.tableCell}>{row.rowNumber}</Text>
                <Text style={duplicateSkuSet.has(row.sku) ? styles.tableErrorCell : styles.tableCell}>{row.sku}</Text>
                <Text style={styles.tableCell}>{row.itemDescription}</Text>
                <Text style={styles.tableCell}>{row.crossName}</Text>
                <Text style={styles.tableCell}>{row.conversionFactor ?? '-'}</Text>
                <Text style={row.errors.length > 0 || duplicateSkuSet.has(row.sku) ? styles.tableErrorCell : styles.tableCell}>
                  {row.errors.length > 0 ? row.errors.join('; ') : duplicateSkuSet.has(row.sku) ? 'SKU duplicado en archivo' : 'OK'}
                </Text>
              </View>
            ))}
          </View>
          </>
        ) : null}
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Añadir cruce manual</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableHeader}>SKU</Text>
            <Text style={styles.tableHeader}>Descripción</Text>
            <Text style={styles.tableHeader}>Cruce asignado</Text>
            <Text style={styles.tableHeader}>Factor</Text>
            <Text style={styles.tableHeader}>Acción</Text>
          </View>
          <View style={styles.tableRow}>
            <TextInput style={styles.recountTableInput} value={draft.sku} onChangeText={(value) => setDraft((current) => ({ ...current, sku: value }))} placeholder="SKU" placeholderTextColor={brandColors.inputPlaceholder} />
            <TextInput style={styles.recountTableInput} value={draft.itemDescription} onChangeText={(value) => setDraft((current) => ({ ...current, itemDescription: value }))} placeholder="Descripción" placeholderTextColor={brandColors.inputPlaceholder} />
            <TextInput style={styles.recountTableInput} value={draft.crossName} onChangeText={(value) => setDraft((current) => ({ ...current, crossName: value }))} placeholder="Cruce" placeholderTextColor={brandColors.inputPlaceholder} />
            <TextInput style={styles.recountTableInput} value={draft.conversionFactor} onChangeText={(value) => setDraft((current) => ({ ...current, conversionFactor: value }))} placeholder="1" placeholderTextColor={brandColors.inputPlaceholder} keyboardType="decimal-pad" />
            <TouchableOpacity disabled={saving} style={styles.recountRemoveButton} onPress={saveManualCross}>
              <Text style={styles.secondaryButtonText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Base de cruces guardada</Text>
        <View style={styles.grid}>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricValue}>{crosses.length}</Text>
            <Text style={styles.metricLabel}>Artículos guardados</Text>
          </View>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricValue}>{activeCount}</Text>
            <Text style={styles.metricLabel}>Activos</Text>
          </View>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricDangerValue}>{inactiveCount}</Text>
            <Text style={styles.metricLabel}>Inactivos</Text>
          </View>
        </View>

        {loadingCrosses ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={brandColors.greenDark} />
            <Text style={styles.hint}>Cargando cruces...</Text>
          </View>
        ) : null}

        {!loadingCrosses && crosses.length === 0 ? <Text style={styles.hint}>Aún no hay cruces guardados.</Text> : null}

        {!loadingCrosses && crosses.length > 0 ? (
          <>
          <View style={styles.field}>
            <Text style={styles.label}>Buscar en cruces guardados</Text>
            <TextInput
              style={styles.input}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Buscar por SKU, descripción o cruce"
              placeholderTextColor={brandColors.inputPlaceholder}
            />
          </View>
          <Text style={styles.hint}>Mostrando {filteredCrosses.length} de {crosses.length} cruces guardados.</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>SKU</Text>
              <Text style={styles.tableHeader}>Descripción</Text>
              <Text style={styles.tableHeader}>Cruce</Text>
              <Text style={styles.tableHeader}>Factor</Text>
              <Text style={styles.tableHeader}>Estado</Text>
              <Text style={styles.tableHeader}>Acción</Text>
            </View>
            {filteredCrosses.map((cross) => (
              <View key={cross.id} style={styles.tableRow}>
                <Text style={styles.tableCell}>{cross.sku}</Text>
                <Text style={styles.tableCell}>{cross.item_description || '-'}</Text>
                <Text style={styles.tableCell}>{cross.cross_name}</Text>
                <TextInput
                  style={styles.recountTableInput}
                  value={String(cross.conversion_factor ?? '')}
                  onChangeText={(value) => setCrosses((current) => current.map((item) => item.id === cross.id ? { ...item, conversion_factor: value } : item))}
                  onBlur={() => updateCrossFactor(cross)}
                  keyboardType="decimal-pad"
                />
                <Text style={cross.is_active ? styles.tableCell : styles.tableErrorCell}>{cross.is_active ? 'Activo' : 'Inactivo'}</Text>
                <TouchableOpacity disabled={saving} style={styles.recountRemoveButton} onPress={() => toggleCrossStatus(cross)}>
                  <Text style={styles.secondaryButtonText}>{cross.is_active ? 'Desactivar' : 'Activar'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          </>
        ) : null}
      </View>
    </InventoryShell>
  );
}




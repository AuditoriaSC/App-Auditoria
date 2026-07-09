import { useMemo, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
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

const requiredColumns = {
  sku: 'SKU',
  itemDescription: 'Descripción del artículo',
  crossName: 'Cruce asignado',
  conversionFactor: 'Factor de conversión',
} as const;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsv(text: string) {
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

    if (char === ',' && !inQuotes) {
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
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const previewRows = rows.slice(0, 10);
  const canConfirm = rows.length > 0 && missingColumns.length === 0 && summary.errorRows === 0;

  const resetUpload = () => {
    setFileName('');
    setRows([]);
    setMissingColumns([]);
    setMessage(null);
  };

  const handleCsvText = (name: string, text: string) => {
    const { rows: parsedRows, missingColumns: missing } = buildRows(text);
    setFileName(name);
    setRows(parsedRows);
    setMissingColumns(missing);
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

      const reader = new FileReader();
      reader.onload = () => handleCsvText(file.name, String(reader.result || ''));
      reader.onerror = () => setMessage('No se pudo leer el archivo CSV.');
      reader.readAsText(file, 'utf-8');
    };
    input.click();
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
      .upsert(payload, { onConflict: 'sku,cross_name' });

    setSaving(false);

    if (error) {
      setMessage('No se pudo cargar la base de cruces: ' + error.message);
      return;
    }

    setMessage(`Carga confirmada: ${payload.length} cruces creados o actualizados.`);
  };

  return (
    <InventoryShell
      title="Cargar Cruces de Inventario"
      subtitle="Carga temporal de cruces por SKU exacto. No usa descripción, fuzzy matching ni coincidencias parciales."
    >
      <View style={styles.form}>
        {message ? <Text style={missingColumns.length > 0 ? styles.errorText : styles.hint}>{message}</Text> : null}

        <TouchableOpacity style={styles.primaryButton} onPress={selectFile}>
          <Text style={styles.primaryButtonText}>Seleccionar CSV</Text>
        </TouchableOpacity>

        {fileName ? <Text style={styles.hint}>Archivo seleccionado: {fileName}</Text> : null}

        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.totalRows}</Text>
            <Text style={styles.metricLabel}>Filas leídas</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.validRows}</Text>
            <Text style={styles.metricLabel}>Filas válidas</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.errorRows}</Text>
            <Text style={styles.metricLabel}>Filas con error</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.duplicateSkus.length}</Text>
            <Text style={styles.metricLabel}>SKUs duplicados</Text>
          </View>
        </View>

        {summary.duplicateSkus.length > 0 ? (
          <Text style={styles.hint}>Duplicados detectados: {summary.duplicateSkus.slice(0, 12).join(', ')}</Text>
        ) : null}

        {previewRows.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Fila</Text>
              <Text style={styles.tableHeader}>SKU</Text>
              <Text style={styles.tableHeader}>Descripción</Text>
              <Text style={styles.tableHeader}>Cruce</Text>
              <Text style={styles.tableHeader}>Factor</Text>
              <Text style={styles.tableHeader}>Estado</Text>
            </View>
            {previewRows.map((row) => (
              <View key={row.rowNumber} style={styles.tableRow}>
                <Text style={styles.tableCell}>{row.rowNumber}</Text>
                <Text style={styles.tableCell}>{row.sku}</Text>
                <Text style={styles.tableCell}>{row.itemDescription}</Text>
                <Text style={styles.tableCell}>{row.crossName}</Text>
                <Text style={styles.tableCell}>{row.conversionFactor ?? '-'}</Text>
                <Text style={row.errors.length > 0 ? styles.tableErrorCell : styles.tableCell}>
                  {row.errors.length > 0 ? row.errors.join('; ') : 'OK'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.grid}>
          <TouchableOpacity style={styles.secondaryButton} onPress={resetUpload}>
            <Text style={styles.secondaryButtonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canConfirm || saving}
            style={[styles.primaryButton, (!canConfirm || saving) && styles.disabledButton]}
            onPress={confirmUpload}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Cargando...' : 'Confirmar carga'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </InventoryShell>
  );
}

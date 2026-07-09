import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';

type InventoryReportHeader = {
  id: string;
  local_codigo: string;
  local_name_snapshot: string;
  inventory_date: string;
};

type InventoryCsvRow = {
  rowNumber: number;
  warehouseCode: string;
  sku: string;
  itemDescription: string;
  physicalStock: number | null;
  systemStock: number | null;
  difference: number | null;
  unitCost: number | null;
  totalCost: number | null;
  warning: string | null;
  errors: string[];
};

const requiredColumns = {
  warehouseCode: 'Código de Almacén',
  sku: 'Referencia o SKU',
  itemDescription: 'Descripción del Item',
  physicalStock: 'Stock Contado o Físico',
  systemStock: 'Stock Teórico o Sistema',
  difference: 'Diferencia',
  unitCost: 'Costo Unitario',
  totalCost: 'Costo Total',
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

function normalizeWarehouseCode(value: string) {
  return String(value).trim().toUpperCase();
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

function parseNumber(value: string) {
  const trimmed = value.trim().replace(/\s/g, '').replace(/\$/g, '');
  if (!trimmed) return null;

  const normalized = trimmed.includes(',') && trimmed.includes('.')
    ? trimmed.replace(/,/g, '')
    : trimmed.replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.0001;
}

function buildRows(csvText: string, expectedWarehouseCode: string) {
  const parsed = parseCsv(csvText);
  const [headerRow, ...dataRows] = parsed;
  if (!headerRow) {
    return { rows: [], missingColumns: Object.values(requiredColumns), warehouseMismatch: false };
  }

  const headerMap = new Map<string, number>();
  headerRow.forEach((header, index) => headerMap.set(normalizeHeader(header), index));

  const columnIndexes = {
    warehouseCode: headerMap.get(normalizeHeader(requiredColumns.warehouseCode)),
    sku: headerMap.get(normalizeHeader(requiredColumns.sku)),
    itemDescription: headerMap.get(normalizeHeader(requiredColumns.itemDescription)),
    physicalStock: headerMap.get(normalizeHeader(requiredColumns.physicalStock)),
    systemStock: headerMap.get(normalizeHeader(requiredColumns.systemStock)),
    difference: headerMap.get(normalizeHeader(requiredColumns.difference)),
    unitCost: headerMap.get(normalizeHeader(requiredColumns.unitCost)),
    totalCost: headerMap.get(normalizeHeader(requiredColumns.totalCost)),
  };

  const missingColumns = Object.entries(columnIndexes)
    .filter(([, index]) => index === undefined)
    .map(([key]) => requiredColumns[key as keyof typeof requiredColumns]);

  if (missingColumns.length > 0) {
    return { rows: [], missingColumns, warehouseMismatch: false };
  }

  let warehouseMismatch = false;
  const expectedCode = normalizeWarehouseCode(expectedWarehouseCode);

  const rows = dataRows.map((dataRow, index): InventoryCsvRow => {
    const warehouseCode = normalizeWarehouseCode(dataRow[columnIndexes.warehouseCode!] ?? '');
    const sku = String(dataRow[columnIndexes.sku!] ?? '').trim();
    const itemDescription = String(dataRow[columnIndexes.itemDescription!] ?? '').trim();
    const physicalStock = parseNumber(String(dataRow[columnIndexes.physicalStock!] ?? ''));
    const systemStock = parseNumber(String(dataRow[columnIndexes.systemStock!] ?? ''));
    const difference = parseNumber(String(dataRow[columnIndexes.difference!] ?? ''));
    const unitCost = parseNumber(String(dataRow[columnIndexes.unitCost!] ?? ''));
    const totalCost = parseNumber(String(dataRow[columnIndexes.totalCost!] ?? ''));
    const errors: string[] = [];
    let warning: string | null = null;

    if (!warehouseCode) errors.push('Código de almacén vacío');
    if (warehouseCode && warehouseCode !== expectedCode) warehouseMismatch = true;
    if (!sku) errors.push('SKU vacío');
    if (physicalStock === null) errors.push('Stock contado/físico inválido');
    if (systemStock === null) errors.push('Stock teórico/sistema inválido');
    if (difference === null) errors.push('Diferencia inválida');
    if (unitCost === null) errors.push('Costo unitario inválido');
    if (totalCost === null) errors.push('Costo total inválido');

    if (physicalStock !== null && systemStock !== null && difference !== null) {
      const expectedDifference = physicalStock - systemStock;
      if (!nearlyEqual(expectedDifference, difference)) {
        warning = `Diferencia esperada ${expectedDifference}`;
      }
    }

    return {
      rowNumber: index + 2,
      warehouseCode,
      sku,
      itemDescription,
      physicalStock,
      systemStock,
      difference,
      unitCost,
      totalCost,
      warning,
      errors,
    };
  });

  return { rows, missingColumns, warehouseMismatch };
}

export default function InventoryCsvUploadScreen() {
  const router = useRouter();
  const { inventory_report_id } = useLocalSearchParams<{ inventory_report_id?: string }>();

  const [report, setReport] = useState<InventoryReportHeader | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<InventoryCsvRow[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [warehouseMismatch, setWarehouseMismatch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadReport() {
      if (!inventory_report_id) {
        setMessage('Falta el inventory_report_id. Crea o selecciona un informe antes de cargar el CSV.');
        setLoadingReport(false);
        return;
      }

      setLoadingReport(true);
      const { data, error } = await supabase
        .from('inventory_reports')
        .select('id, local_codigo, local_name_snapshot, inventory_date')
        .eq('id', inventory_report_id)
        .single<InventoryReportHeader>();

      if (!active) return;

      if (error || !data) {
        setMessage('No se pudo cargar el encabezado del informe de inventario.');
      } else {
        setReport(data);
      }
      setLoadingReport(false);
    }

    loadReport();

    return () => {
      active = false;
    };
  }, [inventory_report_id]);

  const summary = useMemo(() => {
    const validRows = rows.filter((row) => row.errors.length === 0).length;
    const warningRows = rows.filter((row) => row.warning).length;
    const positiveDifference = rows.reduce((total, row) => total + Math.max(row.difference || 0, 0), 0);
    const negativeDifference = rows.reduce((total, row) => total + Math.min(row.difference || 0, 0), 0);

    return {
      totalRows: rows.length,
      validRows,
      warningRows,
      positiveDifference,
      negativeDifference,
    };
  }, [rows]);

  const previewRows = rows.slice(0, 10);
  const errorRows = rows.filter((row) => row.errors.length > 0).length;
  const canConfirm = Boolean(report?.id) && rows.length > 0 && missingColumns.length === 0 && !warehouseMismatch && errorRows === 0;

  const resetUpload = () => {
    setFileName('');
    setRows([]);
    setMissingColumns([]);
    setWarehouseMismatch(false);
    setMessage(null);
  };

  const handleCsvText = (name: string, text: string) => {
    if (!report) {
      setMessage('Primero debe cargarse el encabezado del informe.');
      return;
    }

    const parsed = buildRows(text, report.local_codigo);
    setFileName(name);
    setRows(parsed.rows);
    setMissingColumns(parsed.missingColumns);
    setWarehouseMismatch(parsed.warehouseMismatch);

    if (parsed.missingColumns.length > 0) {
      setMessage(`Faltan columnas obligatorias: ${parsed.missingColumns.join(', ')}.`);
    } else if (parsed.warehouseMismatch) {
      setMessage('El código de almacén del archivo no coincide con el local seleccionado en el encabezado.');
    } else {
      setMessage(null);
    }
  };

  const selectFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setMessage('La carga CSV está disponible solo en Web local.');
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

  const confirmImport = async () => {
    if (!canConfirm || !report) {
      setMessage('Corrige los errores antes de confirmar la importación.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { count, error: countError } = await supabase
      .from('inventory_report_items')
      .select('id', { count: 'exact', head: true })
      .eq('inventory_report_id', report.id);

    if (countError) {
      setSaving(false);
      setMessage('No se pudo validar si ya existen líneas para este informe: ' + countError.message);
      return;
    }

    if ((count || 0) > 0 && typeof window !== 'undefined') {
      const shouldReplace = window.confirm('Este informe ya tiene líneas cargadas. ¿Deseas reemplazarlas?');
      if (!shouldReplace) {
        setSaving(false);
        setMessage('Importación cancelada. No se modificaron las líneas existentes.');
        return;
      }

      const { error: deleteError } = await supabase
        .from('inventory_report_items')
        .delete()
        .eq('inventory_report_id', report.id);

      if (deleteError) {
        setSaving(false);
        setMessage('No se pudieron reemplazar las líneas existentes: ' + deleteError.message);
        return;
      }
    }

    const payload = rows.map((row) => ({
      inventory_report_id: report.id,
      warehouse_code: row.warehouseCode,
      sku: row.sku,
      item_description: row.itemDescription || null,
      physical_stock: row.physicalStock,
      system_stock: row.systemStock,
      difference: row.difference,
      unit_cost: row.unitCost,
      total_cost: row.totalCost,
      validation_warning: row.warning,
    }));

    const { error } = await supabase
      .from('inventory_report_items')
      .insert(payload);

    if (!error) {
      await supabase
        .from('inventory_reports')
        .update({ status: 'csv_loaded', updated_at: new Date().toISOString() })
        .eq('id', report.id);
    }

    setSaving(false);

    if (error) {
      setMessage('No se pudo guardar el CSV de inventario: ' + error.message);
      return;
    }

    setMessage(`Importación confirmada: ${payload.length} líneas guardadas para este informe.`);
  };

  if (loadingReport) {
    return (
      <InventoryShell title="Carga CSV de Inventario" subtitle="Cargando encabezado del informe.">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brandColors.greenDark} />
          <Text style={styles.hint}>Validando informe...</Text>
        </View>
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title="Carga CSV de Inventario"
      subtitle="Carga y validación estructural del archivo de inventario. Los cruces se implementarán en una fase posterior."
    >
      <View style={styles.form}>
        {message ? <Text style={(missingColumns.length > 0 || warehouseMismatch || errorRows > 0) ? styles.errorText : styles.hint}>{message}</Text> : null}

        {report ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{report.local_codigo} · {report.local_name_snapshot}</Text>
            <Text style={styles.blockDescription}>Informe: {report.id}</Text>
            <Text style={styles.blockDescription}>Fecha de inventario: {report.inventory_date}</Text>
          </View>
        ) : null}

        <TouchableOpacity disabled={!report} style={[styles.primaryButton, !report && styles.disabledButton]} onPress={selectFile}>
          <Text style={styles.primaryButtonText}>Seleccionar CSV de Inventario</Text>
        </TouchableOpacity>

        {fileName ? <Text style={styles.hint}>Archivo seleccionado: {fileName}</Text> : null}

        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.totalRows}</Text>
            <Text style={styles.metricLabel}>Filas procesadas</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.validRows}</Text>
            <Text style={styles.metricLabel}>Filas válidas</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.warningRows}</Text>
            <Text style={styles.metricLabel}>Advertencias</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.positiveDifference}</Text>
            <Text style={styles.metricLabel}>Diferencia positiva</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.negativeDifference}</Text>
            <Text style={styles.metricLabel}>Diferencia negativa</Text>
          </View>
        </View>

        {previewRows.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Fila</Text>
              <Text style={styles.tableHeader}>Almacén</Text>
              <Text style={styles.tableHeader}>SKU</Text>
              <Text style={styles.tableHeader}>Descripción</Text>
              <Text style={styles.tableHeader}>Físico</Text>
              <Text style={styles.tableHeader}>Sistema</Text>
              <Text style={styles.tableHeader}>Dif.</Text>
              <Text style={styles.tableHeader}>Estado</Text>
            </View>
            {previewRows.map((row) => (
              <View key={row.rowNumber} style={styles.tableRow}>
                <Text style={styles.tableCell}>{row.rowNumber}</Text>
                <Text style={styles.tableCell}>{row.warehouseCode}</Text>
                <Text style={styles.tableCell}>{row.sku}</Text>
                <Text style={styles.tableCell}>{row.itemDescription}</Text>
                <Text style={styles.tableCell}>{row.physicalStock ?? '-'}</Text>
                <Text style={styles.tableCell}>{row.systemStock ?? '-'}</Text>
                <Text style={styles.tableCell}>{row.difference ?? '-'}</Text>
                <Text style={row.errors.length > 0 ? styles.tableErrorCell : styles.tableCell}>
                  {row.errors.length > 0 ? row.errors.join('; ') : row.warning || 'OK'}
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
            onPress={confirmImport}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Confirmar importación'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push({
              pathname: '/modulos/inventarios/resultados',
              params: { inventory_report_id: report?.id || inventory_report_id },
            })}
          >
            <Text style={styles.secondaryButtonText}>Ir a Resultados</Text>
          </TouchableOpacity>
        </View>
      </View>
    </InventoryShell>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';

type InventoryReportHeader = {
  id: string;
  local_codigo: string;
  local_name_snapshot: string;
  responsible_name_snapshot: string | null;
  inventory_date: string;
  front_regularization_date: string;
  start_time: string | null;
  end_time: string | null;
  has_second_time_range: boolean | null;
  second_start_time: string | null;
  second_end_time: string | null;
  assigned_auditor_name_snapshot: string;
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

type UnmappedCsvItem = {
  sku: string;
  itemDescription: string;
  selectedCrossName: string;
  customCrossName: string;
  conversionFactor: string;
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
    .replace(/\uFFFD/g, '?')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerIndex(headerMap: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const index = headerMap.get(normalizeHeader(alias));
    if (index !== undefined) return index;
  }
  return undefined;
}

function compactHeader(value: string) {
  return normalizeHeader(value)
    .replace(/[?]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function headerIndexByTokens(headerRow: string[], tokenSets: string[][]) {
  const compactHeaders = headerRow.map(compactHeader);
  return compactHeaders.findIndex((header) =>
    tokenSets.some((tokens) => tokens.every((token) => header.includes(token))),
  );
}

const inventoryColumnAliases = {
  warehouseCode: ['Código de Almacén', 'Codigo de Almacen', 'Código Almacén', 'Codigo Almacen', 'Almacén', 'Almacen'],
  sku: ['Referencia o SKU', 'Referencia SKU', 'SKU', 'Referencia'],
  itemDescription: ['Descripción del Item', 'Descripcion del Item', 'Descripción del Ítem', 'Descripcion del Ítem', 'Descripción', 'Descripcion'],
  physicalStock: ['Stock Contado o Físico', 'Stock Contado o Fisico', 'Stock Físico', 'Stock Fisico', 'Físico', 'Fisico', 'Stock Contado'],
  systemStock: ['Stock Teórico o Sistema', 'Stock Teorico o Sistema', 'Stock Sistema', 'Sistema', 'Stock Teórico', 'Stock Teorico'],
  difference: ['Diferencia', 'Dif.', 'Dif'],
  unitCost: ['Costo Unitario', 'Coste Unitario', 'Costo Unit'],
  totalCost: ['Costo Total', 'Coste Total', 'Total Costo'],
} as const;

function normalizeWarehouseCode(value: string) {
  return String(value).trim().toUpperCase();
}

function normalizeSku(value: string) {
  return String(value).trim();
}

function isoDateToDisplayDate(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return 'No registrada';
  const [hour, minute] = value.split(':');
  if (!hour || !minute) return value;
  return `${hour}:${minute}`;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  if (semicolonCount > 0) return ';';
  return commaCount > 0 ? ',' : ';';
}

function unwrapQuotedDelimitedRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.includes(';')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
      }
      return line;
    })
    .join('\n');
}

function parseCsv(text: string) {
  const normalizedText = unwrapQuotedDelimitedRows(text);
  const delimiter = detectDelimiter(normalizedText);
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

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

async function readCsvFile(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (!utf8Text.includes('\uFFFD')) return utf8Text;
  return new TextDecoder('windows-1252').decode(buffer);
}

async function readCsvFileSafe(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (!utf8Text.includes('\uFFFD')) return utf8Text;
  return new TextDecoder('windows-1252').decode(buffer);
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
    warehouseCode: headerIndex(headerMap, ['Código de Almacén', 'Codigo de Almacen', requiredColumns.warehouseCode]),
    sku: headerIndex(headerMap, ['Referencia o SKU', 'SKU', requiredColumns.sku]),
    itemDescription: headerIndex(headerMap, ['Descripción del Item', 'Descripcion del Item', 'Descripción del Ítem', 'Descripcion del Item', requiredColumns.itemDescription]),
    physicalStock: headerIndex(headerMap, ['Stock Contado o Físico', 'Stock Contado o Fisico', 'Stock Físico', 'Stock Fisico', requiredColumns.physicalStock]),
    systemStock: headerIndex(headerMap, ['Stock Teórico o Sistema', 'Stock Teorico o Sistema', 'Stock Sistema', requiredColumns.systemStock]),
    difference: headerIndex(headerMap, ['Diferencia', requiredColumns.difference]),
    unitCost: headerIndex(headerMap, ['Costo Unitario', requiredColumns.unitCost]),
    totalCost: headerIndex(headerMap, ['Costo Total', requiredColumns.totalCost]),
  };

  columnIndexes.warehouseCode = headerIndex(headerMap, [...inventoryColumnAliases.warehouseCode, requiredColumns.warehouseCode]) ?? columnIndexes.warehouseCode;
  columnIndexes.sku = headerIndex(headerMap, [...inventoryColumnAliases.sku, requiredColumns.sku]) ?? columnIndexes.sku;
  columnIndexes.itemDescription = headerIndex(headerMap, [...inventoryColumnAliases.itemDescription, requiredColumns.itemDescription]) ?? columnIndexes.itemDescription;
  columnIndexes.physicalStock = headerIndex(headerMap, [...inventoryColumnAliases.physicalStock, requiredColumns.physicalStock]) ?? columnIndexes.physicalStock;
  columnIndexes.systemStock = headerIndex(headerMap, [...inventoryColumnAliases.systemStock, requiredColumns.systemStock]) ?? columnIndexes.systemStock;
  columnIndexes.difference = headerIndex(headerMap, [...inventoryColumnAliases.difference, requiredColumns.difference]) ?? columnIndexes.difference;
  columnIndexes.unitCost = headerIndex(headerMap, [...inventoryColumnAliases.unitCost, requiredColumns.unitCost]) ?? columnIndexes.unitCost;
  columnIndexes.totalCost = headerIndex(headerMap, [...inventoryColumnAliases.totalCost, requiredColumns.totalCost]) ?? columnIndexes.totalCost;

  const tokenColumnIndexes = {
    warehouseCode: headerIndexByTokens(headerRow, [['codigo', 'almacen'], ['almacen']]),
    sku: headerIndexByTokens(headerRow, [['referencia', 'sku'], ['sku']]),
    itemDescription: headerIndexByTokens(headerRow, [['descripcion', 'item'], ['descripcion']]),
    physicalStock: headerIndexByTokens(headerRow, [['stock', 'contado'], ['stock', 'fisico'], ['fisico']]),
    systemStock: headerIndexByTokens(headerRow, [['stock', 'teorico'], ['stock', 'sistema'], ['sistema']]),
    difference: headerIndexByTokens(headerRow, [['diferencia'], ['dif']]),
    unitCost: headerIndexByTokens(headerRow, [['costo', 'unitario']]),
    totalCost: headerIndexByTokens(headerRow, [['costo', 'total']]),
  };

  columnIndexes.warehouseCode = tokenColumnIndexes.warehouseCode >= 0 ? tokenColumnIndexes.warehouseCode : columnIndexes.warehouseCode;
  columnIndexes.sku = tokenColumnIndexes.sku >= 0 ? tokenColumnIndexes.sku : columnIndexes.sku;
  columnIndexes.itemDescription = tokenColumnIndexes.itemDescription >= 0 ? tokenColumnIndexes.itemDescription : columnIndexes.itemDescription;
  columnIndexes.physicalStock = tokenColumnIndexes.physicalStock >= 0 ? tokenColumnIndexes.physicalStock : columnIndexes.physicalStock;
  columnIndexes.systemStock = tokenColumnIndexes.systemStock >= 0 ? tokenColumnIndexes.systemStock : columnIndexes.systemStock;
  columnIndexes.difference = tokenColumnIndexes.difference >= 0 ? tokenColumnIndexes.difference : columnIndexes.difference;
  columnIndexes.unitCost = tokenColumnIndexes.unitCost >= 0 ? tokenColumnIndexes.unitCost : columnIndexes.unitCost;
  columnIndexes.totalCost = tokenColumnIndexes.totalCost >= 0 ? tokenColumnIndexes.totalCost : columnIndexes.totalCost;

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
    if (warehouseCode && warehouseCode !== expectedCode) {
      warehouseMismatch = true;
      errors.push(`Almacén ${warehouseCode} no coincide con ${expectedCode}`);
    }
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
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [checkingCrosses, setCheckingCrosses] = useState(false);
  const [crossOptions, setCrossOptions] = useState<string[]>(['COSTO', 'GASTO']);
  const [unmappedItems, setUnmappedItems] = useState<UnmappedCsvItem[]>([]);
  const [showUnmappedModal, setShowUnmappedModal] = useState(false);
  const [openCategoryIndex, setOpenCategoryIndex] = useState<number | null>(null);

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
        .select('id, local_codigo, local_name_snapshot, responsible_name_snapshot, inventory_date, front_regularization_date, start_time, end_time, has_second_time_range, second_start_time, second_end_time, assigned_auditor_name_snapshot')
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
    const rejectedRows = rows.filter((row) => row.errors.length > 0).length;

    return {
      totalRows: rows.length,
      validRows,
      rejectedRows,
    };
  }, [rows]);

  const previewRows = rows.slice(0, 10);
  const errorRows = rows.filter((row) => row.errors.length > 0).length;
  const rejectedRows = rows.filter((row) => row.errors.length > 0);
  const canConfirm = Boolean(report?.id) && rows.length > 0 && missingColumns.length === 0 && !warehouseMismatch && errorRows === 0 && unmappedItems.length === 0 && !checkingCrosses;

  const resetUpload = () => {
    setFileName('');
    setRows([]);
    setMissingColumns([]);
    setWarehouseMismatch(false);
    setMessage(null);
    setImportConfirmed(false);
    setUnmappedItems([]);
    setShowUnmappedModal(false);
    setOpenCategoryIndex(null);
  };

  const loadCrossOptions = async () => {
    const { data } = await supabase
      .from('inventory_crosses')
      .select('cross_name')
      .eq('is_active', true)
      .order('cross_name', { ascending: true });

    const dynamicOptions = (data || [])
      .map((cross) => String(cross.cross_name || '').trim())
      .filter(Boolean);

    setCrossOptions(Array.from(new Set(['COSTO', 'GASTO', ...dynamicOptions, 'AGREGAR NUEVO'])));
  };

  const detectUnmappedItems = async (parsedRows: InventoryCsvRow[]) => {
    setCheckingCrosses(true);
    await loadCrossOptions();

    const validRows = parsedRows.filter((row) => row.errors.length === 0 && normalizeSku(row.sku));
    const uniqueSkus = Array.from(new Set(validRows.map((row) => normalizeSku(row.sku))));

    if (uniqueSkus.length === 0) {
      setUnmappedItems([]);
      setShowUnmappedModal(false);
      setCheckingCrosses(false);
      return;
    }

    const { data, error } = await supabase
      .from('inventory_crosses')
      .select('sku')
      .eq('is_active', true)
      .in('sku', uniqueSkus);

    if (error) {
      setUnmappedItems([]);
      setShowUnmappedModal(false);
      setMessage('No se pudo validar la base de cruces: ' + error.message);
      setCheckingCrosses(false);
      return;
    }

    const mappedSkus = new Set((data || []).map((cross) => normalizeSku(String(cross.sku || ''))));
    const pendingBySku = new Map<string, UnmappedCsvItem>();

    validRows.forEach((row) => {
      const sku = normalizeSku(row.sku);
      if (!mappedSkus.has(sku) && !pendingBySku.has(sku)) {
        pendingBySku.set(sku, {
          sku,
          itemDescription: row.itemDescription || 'Sin descripción',
          selectedCrossName: 'COSTO',
          customCrossName: '',
          conversionFactor: '1',
        });
      }
    });

    const pendingItems = Array.from(pendingBySku.values());
    setUnmappedItems(pendingItems);
    setShowUnmappedModal(pendingItems.length > 0);
    if (pendingItems.length > 0) {
      setMessage(`Hay ${pendingItems.length} SKU sin cruce configurado. Clasifícalos antes de confirmar la importación.`);
    }
    setCheckingCrosses(false);
  };

  const handleCsvText = async (name: string, text: string) => {
    if (!report) {
      setMessage('Primero debe cargarse el encabezado del informe.');
      return;
    }

    const parsed = buildRows(text, report.local_codigo);
    setFileName(name);
    setRows(parsed.rows);
    setMissingColumns(parsed.missingColumns);
    setWarehouseMismatch(parsed.warehouseMismatch);
    setImportConfirmed(false);
    setUnmappedItems([]);
    setShowUnmappedModal(false);
    setOpenCategoryIndex(null);

    if (parsed.missingColumns.length > 0) {
      setMessage(`Faltan columnas obligatorias: ${parsed.missingColumns.join(', ')}.`);
    } else if (parsed.warehouseMismatch) {
      setMessage('El código de almacén del archivo no coincide con el local seleccionado en el encabezado.');
    } else {
      setMessage(null);
      await detectUnmappedItems(parsed.rows);
    }
  };

  const updateUnmappedItem = (index: number, patch: Partial<UnmappedCsvItem>) => {
    setUnmappedItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const saveUnmappedItem = async (index: number) => {
    const item = unmappedItems[index];
    if (!item) return;

    const crossName = item.selectedCrossName === 'AGREGAR NUEVO' ? item.customCrossName.trim() : item.selectedCrossName.trim();
    const factor = Number(item.conversionFactor.replace(',', '.'));

    if (!crossName) {
      setMessage('Indica la categoría o nombre de cruce antes de guardar.');
      return;
    }

    if (!Number.isFinite(factor) || factor <= 0) {
      setMessage('El factor de conversión debe ser mayor a 0.');
      return;
    }

    setSaving(true);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('inventory_crosses')
      .upsert(
        {
          sku: item.sku,
          item_description: item.itemDescription || null,
          cross_name: crossName,
          conversion_factor: factor,
          is_active: true,
          created_by: authData.user?.id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sku,cross_name' },
      );
    setSaving(false);

    if (error) {
      setMessage('No se pudo guardar el cruce pendiente: ' + error.message);
      return;
    }

    setUnmappedItems((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (next.length === 0) {
        setShowUnmappedModal(false);
        setOpenCategoryIndex(null);
        setMessage('Cruces pendientes registrados. Ya puedes confirmar la importación.');
      } else {
        setMessage(`Quedan ${next.length} SKU sin cruce configurado.`);
      }
      return next;
    });
    await loadCrossOptions();
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

      readCsvFileSafe(file)
        .then((text) => handleCsvText(file.name, text))
        .catch(() => setMessage('No se pudo leer el archivo CSV.'));
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

    setImportConfirmed(true);
    setMessage(`Importación confirmada: ${payload.length} filas guardadas correctamente.`);
    if (typeof window !== 'undefined') {
      window.alert(`CSV cargado y confirmado correctamente.\n${payload.length} filas fueron guardadas.`);
    }
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
        {message ? (
          <Text style={(missingColumns.length > 0 || warehouseMismatch || errorRows > 0 || unmappedItems.length > 0) ? styles.errorText : importConfirmed ? styles.successText : styles.hint}>
            {message}
          </Text>
        ) : null}

        {report ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{report.local_codigo} · {report.local_name_snapshot}</Text>
            <View style={styles.twoColumnRow}>
              <View style={styles.twoColumnItem}>
                <Text style={styles.blockDescription}>Líder del local</Text>
                <Text style={styles.hint}>{report.responsible_name_snapshot || 'No registrado en el encabezado'}</Text>
              </View>
              <View style={styles.twoColumnItem}>
                <Text style={styles.blockDescription}>Auditor encargado</Text>
                <Text style={styles.hint}>{report.assigned_auditor_name_snapshot}</Text>
              </View>
            </View>
            <View style={styles.twoColumnRow}>
              <View style={styles.twoColumnItem}>
                <Text style={styles.blockDescription}>Fecha de inventario</Text>
                <Text style={styles.hint}>{isoDateToDisplayDate(report.inventory_date)}</Text>
              </View>
              <View style={styles.twoColumnItem}>
                <Text style={styles.blockDescription}>Fecha de regularización</Text>
                <Text style={styles.hint}>{isoDateToDisplayDate(report.front_regularization_date)}</Text>
              </View>
            </View>
            <View style={styles.twoColumnRow}>
              <View style={styles.twoColumnItem}>
                <Text style={styles.blockDescription}>Horario principal</Text>
                <Text style={styles.hint}>{formatTime(report.start_time)} - {formatTime(report.end_time)}</Text>
              </View>
              <View style={styles.twoColumnItem}>
                <Text style={styles.blockDescription}>Segundo horario</Text>
                <Text style={styles.hint}>
                  {report.has_second_time_range
                    ? `${formatTime(report.second_start_time)} - ${formatTime(report.second_end_time)}`
                    : 'No aplica'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <TouchableOpacity disabled={!report} style={[styles.primaryButton, !report && styles.disabledButton]} onPress={selectFile}>
          <Text style={styles.primaryButtonText}>Seleccionar CSV de Inventario</Text>
        </TouchableOpacity>

        {fileName ? <Text style={styles.hint}>Archivo seleccionado: {fileName}</Text> : null}

        <View style={styles.grid}>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricValue}>{summary.totalRows}</Text>
            <Text style={styles.metricLabel}>Filas ingresadas</Text>
          </View>
          <View style={styles.smallMetricCard}>
            <Text style={styles.metricValue}>{summary.validRows}</Text>
            <Text style={styles.metricLabel}>Aceptadas para importación</Text>
          </View>
          <View style={styles.smallMetricCard}>
            <Text style={summary.rejectedRows > 0 ? styles.metricDangerValue : styles.metricValue}>{summary.rejectedRows}</Text>
            <Text style={styles.metricLabel}>No aceptadas</Text>
          </View>
        </View>

        {rejectedRows.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Filas no aceptadas</Text>
            <Text style={styles.blockDescription}>Corrige estos registros en el CSV y vuelve a cargar el archivo.</Text>
            {rejectedRows.slice(0, 12).map((row) => (
              <Text key={`rejected-${row.rowNumber}`} style={styles.errorText}>
                Fila {row.rowNumber} · SKU {row.sku || 'sin SKU'}: {row.errors.join('; ')}
              </Text>
            ))}
            {rejectedRows.length > 12 ? <Text style={styles.hint}>Hay {rejectedRows.length - 12} filas no aceptadas adicionales.</Text> : null}
          </View>
        ) : null}

        {unmappedItems.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>SKUs sin cruce configurado</Text>
            <Text style={styles.blockDescription}>
              Hay {unmappedItems.length} código(s) del CSV que todavía no existen en la base de cruces.
            </Text>
            <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={() => setShowUnmappedModal(true)}>
              <Text style={styles.secondaryButtonText}>Clasificar ahora</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
                  {row.errors.length > 0 ? `No aceptada: ${row.errors.join('; ')}` : row.warning ? `Aceptada con aviso: ${row.warning}` : 'Aceptada'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footerActions}>
          <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={resetUpload}>
            <Text style={styles.secondaryButtonText}>Cancelar carga</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canConfirm || saving}
            style={[styles.primaryButton, styles.footerPrimaryButton, (!canConfirm || saving) && styles.disabledButton]}
            onPress={confirmImport}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Confirmar importación'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!importConfirmed}
            style={[styles.secondaryButton, styles.footerSecondaryButton, !importConfirmed && styles.disabledButton]}
            onPress={() => router.push({
              pathname: '/modulos/inventarios/resultados',
              params: { inventory_report_id: report?.id || inventory_report_id },
            })}
          >
            <Text style={styles.secondaryButtonText}>Siguiente</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={showUnmappedModal} transparent animationType="fade" onRequestClose={() => setShowUnmappedModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxWidth: 980, maxHeight: '86%' }]}>
              <Text style={styles.blockTitle}>Clasificar SKUs nuevos del CSV</Text>
              <Text style={styles.blockDescription}>
                Estos códigos se guardarán en la base de cruces antes de confirmar la importación.
              </Text>

              <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={styles.evidenceMiniCardList}>
                {unmappedItems.map((item, index) => (
                  <View key={`unmapped-${item.sku}`} style={[styles.evidenceMiniCard, { zIndex: openCategoryIndex === index ? 20 : 1 }]}>
                    <View style={styles.evidenceMiniInfo}>
                      <Text style={styles.evidenceMiniTitle}>{item.sku} · {item.itemDescription}</Text>
                      <Text style={styles.evidenceMiniMeta}>SKU nuevo detectado en el CSV</Text>
                    </View>

                    <View style={[styles.evidenceMiniActions, { flex: 1, minWidth: 420 }]}>
                      <View style={[styles.field, { minWidth: 190, flex: 1, position: 'relative', zIndex: openCategoryIndex === index ? 30 : 1 }]}>
                        <TouchableOpacity
                          style={styles.input}
                          onPress={() => setOpenCategoryIndex(openCategoryIndex === index ? null : index)}
                        >
                          <Text style={styles.hint}>{item.selectedCrossName}</Text>
                        </TouchableOpacity>
                        {openCategoryIndex === index ? (
                          <ScrollView
                            style={[
                              styles.optionsPanel,
                              {
                                position: 'absolute',
                                top: 44,
                                left: 0,
                                right: 0,
                                maxHeight: 210,
                                zIndex: 50,
                                elevation: 6,
                              },
                            ]}
                          >
                            {crossOptions.map((option) => (
                              <TouchableOpacity
                                key={`${item.sku}-${option}`}
                                style={styles.optionRow}
                                onPress={() => {
                                  updateUnmappedItem(index, { selectedCrossName: option });
                                  setOpenCategoryIndex(null);
                                }}
                              >
                                <Text style={styles.optionTitle}>{option}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        ) : null}
                      </View>

                      {item.selectedCrossName === 'AGREGAR NUEVO' ? (
                        <TextInput
                          value={item.customCrossName}
                          onChangeText={(value) => updateUnmappedItem(index, { customCrossName: value })}
                          placeholder="Nuevo cruce"
                          placeholderTextColor={brandColors.textSecondary}
                          style={[styles.input, { minWidth: 170, flex: 1 }]}
                        />
                      ) : null}

                      <TextInput
                        value={item.conversionFactor}
                        onChangeText={(value) => updateUnmappedItem(index, { conversionFactor: value })}
                        placeholder="Factor"
                        placeholderTextColor={brandColors.textSecondary}
                        keyboardType="decimal-pad"
                        style={[styles.input, { width: 90 }]}
                      />

                      <TouchableOpacity
                        disabled={saving}
                        style={[styles.primaryButton, styles.footerPrimaryButton, saving && styles.disabledButton]}
                        onPress={() => saveUnmappedItem(index)}
                      >
                        <Text style={styles.primaryButtonText}>Guardar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.footerActions}>
                <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={() => setShowUnmappedModal(false)}>
                  <Text style={styles.secondaryButtonText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </InventoryShell>
  );
}



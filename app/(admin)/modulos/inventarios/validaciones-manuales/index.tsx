import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';

type InvoiceCheck = {
  lastSystemInvoice: string;
  lastPhysicalBlockInvoice: string;
  blockExpirationDate: string;
};

type RecountRow = {
  sku: string;
  itemDescription: string;
  initialCount: string;
  finalRecount: string;
  comment: string;
};

type FinishedProductRow = {
  itemDescription: string;
  systemStock: string;
  physicalStock: string;
};

type CashClosureRow = {
  cashRegister: string;
  cashRegisterNumber: string;
  cashierName: string;
  cashValue: string;
  systemValue: string;
  cashDifference: string;
  comment: string;
};

type ItemDescriptionRow = {
  sku: string;
  item_description: string | null;
};

type AdditionalObservationRow = {
  observation: string | null;
};

const emptyInvoiceCheck: InvoiceCheck = {
  lastSystemInvoice: '',
  lastPhysicalBlockInvoice: '',
  blockExpirationDate: '',
};

const emptyRecount: RecountRow = {
  sku: '',
  itemDescription: '',
  initialCount: '',
  finalRecount: '',
  comment: '',
};

const emptyFinishedProduct: FinishedProductRow = {
  itemDescription: '',
  systemStock: '',
  physicalStock: '',
};

const emptyCashClosure: CashClosureRow = {
  cashRegister: '',
  cashRegisterNumber: '',
  cashierName: '',
  cashValue: '',
  systemValue: '',
  cashDifference: '',
  comment: '',
};

function normalizeSku(value: string) {
  return String(value).trim();
}

function normalizeSearchText(value: string) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value: number | null) {
  if (value === null) return '-';
  return new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInputValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateToIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoDateToDisplayDate(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value || 'Seleccionar fecha';
  return `${day}/${month}/${year}`;
}

function displayDateToIsoDate(value: string) {
  const [day, month, year] = value.trim().split('/').map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return dateToIsoDate(date);
}

function parseDateOnly(value: string) {
  if (!value.trim()) return null;
  const [year, month, day] = value.trim().split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function getInvoiceBlockExpirationStatus(value: string) {
  const expirationDate = parseDateOnly(value);
  if (!expirationDate) return null;

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((expirationDate.getTime() - startOfToday().getTime()) / millisecondsPerDay);

  if (days < 0) {
    const expiredDays = Math.abs(days);
    return {
      message: `Caducado hace ${expiredDays} día${expiredDays === 1 ? '' : 's'}`,
      isExpired: true,
    };
  }

  if (days <= 10) {
    return {
      message: `Próxima a caducar en ${days} día${days === 1 ? '' : 's'}`,
      isExpired: false,
    };
  }

  return null;
}

export default function InventoryManualValidationsScreen() {
  const router = useRouter();
  const { inventory_report_id } = useLocalSearchParams<{ inventory_report_id?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [descriptionsBySku, setDescriptionsBySku] = useState<Map<string, string>>(new Map());
  const [itemDescriptionOptions, setItemDescriptionOptions] = useState<ItemDescriptionRow[]>([]);
  const [invoiceCheck, setInvoiceCheck] = useState<InvoiceCheck>(emptyInvoiceCheck);
  const [recounts, setRecounts] = useState<RecountRow[]>([]);
  const [finishedProducts, setFinishedProducts] = useState<FinishedProductRow[]>([]);
  const [cashClosures, setCashClosures] = useState<CashClosureRow[]>([]);
  const [additionalObservation, setAdditionalObservation] = useState('');
  const [showBlockExpirationDatePicker, setShowBlockExpirationDatePicker] = useState(false);
  const [skuSearchIndex, setSkuSearchIndex] = useState<number | null>(null);
  const [skuSearchQuery, setSkuSearchQuery] = useState('');

  useEffect(() => {
    loadManualValidations();
  }, [inventory_report_id]);

  const invoiceDifference = useMemo(() => {
    const systemInvoice = parseInteger(invoiceCheck.lastSystemInvoice);
    const blockInvoice = parseInteger(invoiceCheck.lastPhysicalBlockInvoice);
    if (systemInvoice === null || blockInvoice === null) return null;
    return blockInvoice - systemInvoice - 1;
  }, [invoiceCheck.lastPhysicalBlockInvoice, invoiceCheck.lastSystemInvoice]);

  const invoiceBlockExpirationStatus = useMemo(() => {
    return getInvoiceBlockExpirationStatus(invoiceCheck.blockExpirationDate);
  }, [invoiceCheck.blockExpirationDate]);

  const selectedBlockExpirationDate = useMemo(() => {
    return parseDateOnly(invoiceCheck.blockExpirationDate) || new Date();
  }, [invoiceCheck.blockExpirationDate]);

  const recountSummary = useMemo(() => {
    const calculated = recounts.map((row) => {
      const initial = parseNumber(row.initialCount);
      const final = parseNumber(row.finalRecount);
      const difference = initial !== null && final !== null ? final - initial : null;
      return difference;
    });

    const ok = calculated.filter((difference) => difference === 0).length;
    const modified = calculated.filter((difference) => difference !== null && difference !== 0).length;

    return { ok, modified, total: recounts.length };
  }, [recounts]);

  const filteredSkuOptions = useMemo(() => {
    const term = normalizeSearchText(skuSearchQuery);
    const source = term
      ? itemDescriptionOptions.filter((item) =>
          normalizeSearchText(`${item.sku} ${item.item_description || ''}`).includes(term),
        )
      : itemDescriptionOptions;

    return source.slice(0, 30);
  }, [itemDescriptionOptions, skuSearchQuery]);

  async function loadManualValidations() {
    if (!inventory_report_id) {
      setMessage('Falta el inventory_report_id. Primero selecciona un informe.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    const [
      itemDescriptionsResult,
      invoiceResult,
      recountResult,
      finishedResult,
      cashResult,
      additionalObservationResult,
    ] = await Promise.all([
      supabase
        .from('inventory_report_items')
        .select('sku, item_description')
        .eq('inventory_report_id', inventory_report_id),
      supabase
        .from('inventory_manual_invoice_checks')
        .select('*')
        .eq('inventory_report_id', inventory_report_id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('inventory_recounts')
        .select('*')
        .eq('inventory_report_id', inventory_report_id)
        .order('created_at', { ascending: true }),
      supabase
        .from('inventory_finished_product_differences')
        .select('*')
        .eq('inventory_report_id', inventory_report_id)
        .order('created_at', { ascending: true }),
      supabase
        .from('inventory_cash_closures')
        .select('*')
        .eq('inventory_report_id', inventory_report_id)
        .order('created_at', { ascending: true }),
      supabase
        .from('inventory_additional_observations')
        .select('observation')
        .eq('inventory_report_id', inventory_report_id)
        .order('updated_at', { ascending: false })
        .limit(1),
    ]);

    if (itemDescriptionsResult.data) {
      const descriptionMap = new Map<string, string>();
      const optionMap = new Map<string, ItemDescriptionRow>();
      (itemDescriptionsResult.data as ItemDescriptionRow[]).forEach((item) => {
        const sku = normalizeSku(item.sku);
        if (sku && item.item_description) descriptionMap.set(sku, item.item_description);
        if (sku && !optionMap.has(sku)) optionMap.set(sku, { sku, item_description: item.item_description });
      });
      setDescriptionsBySku(descriptionMap);
      setItemDescriptionOptions(Array.from(optionMap.values()));
    }

    const invoice = invoiceResult.data?.[0];
    if (invoice) {
      setInvoiceCheck({
        lastSystemInvoice: toInputValue(invoice.last_system_invoice),
        lastPhysicalBlockInvoice: toInputValue(invoice.last_physical_block_invoice),
        blockExpirationDate: toInputValue(invoice.block_expiration_date),
      });
    }

    if (recountResult.data) {
      setRecounts(recountResult.data.map((row) => ({
        sku: row.sku || '',
        itemDescription: row.item_description || '',
        initialCount: toInputValue(row.initial_count),
        finalRecount: toInputValue(row.final_recount),
        comment: row.comment || '',
      })));
    }

    if (finishedResult.data) {
      setFinishedProducts(finishedResult.data.map((row) => ({
        itemDescription: row.item_description || '',
        systemStock: toInputValue(row.system_stock),
        physicalStock: toInputValue(row.physical_stock),
      })));
    }

    if (cashResult.data) {
      setCashClosures(cashResult.data.map((row) => ({
        cashRegister: row.cash_register || '',
        cashRegisterNumber: row.cash_register_number || '',
        cashierName: row.cashier_name || '',
        cashValue: toInputValue(row.cash_value),
        systemValue: toInputValue(row.system_value),
        cashDifference: toInputValue(row.cash_difference),
        comment: row.comment || '',
      })));
    }

    if (additionalObservationResult.data?.[0]) {
      setAdditionalObservation(((additionalObservationResult.data as AdditionalObservationRow[])[0].observation || ''));
    }

    const errors = [
      invoiceResult.error,
      recountResult.error,
      finishedResult.error,
      cashResult.error,
      additionalObservationResult.error,
    ].filter(Boolean);
    if (errors.length > 0) setMessage('Algunas secciones no pudieron cargarse. Revisa si las migraciones ya fueron aplicadas.');

    setLoading(false);
  }

  function resolveDescription(sku: string, currentDescription: string) {
    const normalizedSku = normalizeSku(sku);
    return descriptionsBySku.get(normalizedSku) || currentDescription || '';
  }

  function updateRecount(index: number, patch: Partial<RecountRow>) {
    setRecounts((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.sku !== undefined) {
        next.sku = normalizeSku(patch.sku);
        next.itemDescription = resolveDescription(next.sku, next.itemDescription);
      }
      return next;
    }));
  }

  function openSkuSearch(index: number) {
    setSkuSearchIndex(index);
    setSkuSearchQuery('');
  }

  function closeSkuSearch() {
    setSkuSearchIndex(null);
    setSkuSearchQuery('');
  }

  function selectSkuForRecount(item: ItemDescriptionRow) {
    if (skuSearchIndex === null) return;
    updateRecount(skuSearchIndex, {
      sku: normalizeSku(item.sku),
      itemDescription: item.item_description || '',
    });
    closeSkuSearch();
  }

  function updateFinishedProduct(index: number, patch: Partial<FinishedProductRow>) {
    setFinishedProducts((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return { ...row, ...patch };
    }));
  }

  async function saveInvoices() {
    if (!inventory_report_id) return false;
    const systemInvoice = parseInteger(invoiceCheck.lastSystemInvoice);
    const blockInvoice = parseInteger(invoiceCheck.lastPhysicalBlockInvoice);

    if (systemInvoice === null || blockInvoice === null || invoiceDifference === null) {
      setMessage('Completa facturas manuales con valores enteros válidos.');
      return false;
    }

    if (invoiceCheck.blockExpirationDate.trim() && !parseDateOnly(invoiceCheck.blockExpirationDate)) {
      setMessage('Ingresa una fecha de caducidad válida en formato AAAA-MM-DD.');
      return false;
    }

    await supabase.from('inventory_manual_invoice_checks').delete().eq('inventory_report_id', inventory_report_id);
    const { error } = await supabase.from('inventory_manual_invoice_checks').insert([{
      inventory_report_id,
      last_system_invoice: systemInvoice,
      last_physical_block_invoice: blockInvoice,
      block_expiration_date: invoiceCheck.blockExpirationDate.trim() || null,
      calculated_difference: invoiceDifference,
      comment: null,
    }]);

    if (error) setMessage('No se pudo guardar facturas manuales: ' + error.message);
    return !error;
  }

  async function saveRecounts() {
    if (!inventory_report_id) return false;

    const payload = recounts
      .filter((row) => normalizeSku(row.sku))
      .map((row) => {
        const initial = parseNumber(row.initialCount);
        const final = parseNumber(row.finalRecount);
        const difference = initial !== null && final !== null ? final - initial : null;
        return {
          inventory_report_id,
          sku: normalizeSku(row.sku),
          item_description: row.itemDescription || descriptionsBySku.get(normalizeSku(row.sku)) || 'Sin descripción encontrada',
          initial_count: initial,
          final_recount: final,
          difference,
          status: difference === 0 ? 'Recuento OK' : 'Recuento Modificado',
          comment: row.comment || null,
        };
      });

    if (payload.some((row) => row.initial_count === null || row.final_recount === null || row.difference === null)) {
      setMessage('Completa los reconteos con cantidades válidas.');
      return false;
    }

    await supabase.from('inventory_recounts').delete().eq('inventory_report_id', inventory_report_id);
    if (payload.length === 0) return true;

    const { error } = await supabase.from('inventory_recounts').insert(payload);
    if (error) setMessage('No se pudieron guardar reconteos: ' + error.message);
    return !error;
  }

  async function saveFinishedProducts() {
    if (!inventory_report_id) return false;

    const payload = finishedProducts
      .filter((row) => row.itemDescription.trim() || row.systemStock.trim() || row.physicalStock.trim())
      .map((row) => {
        const systemStock = parseNumber(row.systemStock);
        const physicalStock = parseNumber(row.physicalStock);
        return {
          inventory_report_id,
          sku: null,
          item_description: row.itemDescription || null,
          system_stock: systemStock,
          physical_stock: physicalStock,
          difference: systemStock !== null && physicalStock !== null ? physicalStock - systemStock : null,
          comment: null,
        };
      });

    await supabase.from('inventory_finished_product_differences').delete().eq('inventory_report_id', inventory_report_id);
    if (payload.length === 0) return true;

    const { error } = await supabase.from('inventory_finished_product_differences').insert(payload);
    if (error) setMessage('No se pudo guardar producto terminado: ' + error.message);
    return !error;
  }

  async function saveCashClosures() {
    if (!inventory_report_id) return false;

    const payload = cashClosures
      .filter((row) => row.cashRegister.trim() || row.cashRegisterNumber.trim() || row.cashierName.trim())
      .map((row) => {
        const physicalCash = parseNumber(row.cashValue);
        const systemCash = parseNumber(row.systemValue);
        const difference = physicalCash !== null && systemCash !== null ? physicalCash - systemCash : null;
        return {
          inventory_report_id,
          cash_register: row.cashRegister.trim(),
          cash_register_number: row.cashRegisterNumber.trim() || null,
          cashier_name: row.cashierName.trim(),
          cash_value: physicalCash,
          system_value: systemCash,
          cash_difference: difference,
          comment: null,
        };
      });

    if (payload.some((row) => !row.cash_register || !row.cashier_name || row.cash_value === null || row.cash_difference === null)) {
      setMessage('Completa cada cierre de caja con caja, cajero, valor y diferencia válidos.');
      return false;
    }

    await supabase.from('inventory_cash_closures').delete().eq('inventory_report_id', inventory_report_id);
    if (payload.length === 0) return true;

    const { error } = await supabase.from('inventory_cash_closures').insert(payload);
    if (error) setMessage('No se pudieron guardar cierres de caja: ' + error.message);
    return !error;
  }

  async function saveAdditionalObservation() {
    if (!inventory_report_id) return false;

    await supabase.from('inventory_additional_observations').delete().eq('inventory_report_id', inventory_report_id);

    if (!additionalObservation.trim()) return true;

    const { error } = await supabase.from('inventory_additional_observations').insert([{
      inventory_report_id,
      observation: additionalObservation.trim(),
    }]);

    if (error) setMessage('No se pudo guardar la observación adicional: ' + error.message);
    return !error;
  }

  async function saveAll(continueToEvidence = false) {
    setSaving(true);
    setMessage(null);

    const okInvoices = await saveInvoices();
    const okRecounts = okInvoices ? await saveRecounts() : false;
    const okFinished = okRecounts ? await saveFinishedProducts() : false;
    const okCash = okFinished ? await saveCashClosures() : false;
    const okObservation = okCash ? await saveAdditionalObservation() : false;

    setSaving(false);

    if (okInvoices && okRecounts && okFinished && okCash && okObservation) {
      await supabase
        .from('inventory_reports')
        .update({ status: 'manual_validations_completed', updated_at: new Date().toISOString() })
        .eq('id', inventory_report_id);

      setMessage('Validaciones manuales guardadas correctamente.');
      if (continueToEvidence) {
        router.push({
          pathname: '/modulos/inventarios/evidencias',
          params: { inventory_report_id },
        });
      }
    }
  }

  if (loading) {
    return (
      <InventoryShell title="Validaciones Manuales" subtitle="Cargando validaciones guardadas.">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brandColors.greenDark} />
          <Text style={styles.hint}>Cargando...</Text>
        </View>
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title="Validaciones Manuales"
      subtitle="Ingreso manual del auditor para facturas, reconteos, producto terminado y cierres de caja."
    >
      {message ? <Text style={styles.hint}>{message}</Text> : null}

      <View style={styles.form}>
        <Text style={styles.blockTitle}>1. Control de facturas manuales</Text>
        <Input label="Última factura registrada en sistema" value={invoiceCheck.lastSystemInvoice} onChangeText={(value) => setInvoiceCheck((current) => ({ ...current, lastSystemInvoice: value }))} />
        <Input label="Última factura en block físico" value={invoiceCheck.lastPhysicalBlockInvoice} onChangeText={(value) => setInvoiceCheck((current) => ({ ...current, lastPhysicalBlockInvoice: value }))} />
        <DateField
          label="Fecha de caducidad del block"
          value={invoiceCheck.blockExpirationDate}
          selectedDate={selectedBlockExpirationDate}
          visible={showBlockExpirationDatePicker}
          onOpen={() => setShowBlockExpirationDatePicker(true)}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setShowBlockExpirationDatePicker(false);
            if (date) setInvoiceCheck((current) => ({ ...current, blockExpirationDate: dateToIsoDate(date) }));
          }}
          onWebChange={(value) => setInvoiceCheck((current) => ({ ...current, blockExpirationDate: value }))}
        />
        {invoiceBlockExpirationStatus ? (
          <Text style={invoiceBlockExpirationStatus.isExpired ? styles.manualNegativeValue : styles.manualPositiveValue}>
            {invoiceBlockExpirationStatus.message}
          </Text>
        ) : null}
        <Text style={invoiceDifference === null || invoiceDifference === 0 ? styles.manualNeutralValue : invoiceDifference > 0 ? styles.manualPositiveValue : styles.manualNegativeValue}>
          Diferencia calculada: {formatDecimal(invoiceDifference)}
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>2. Reconteos realizados</Text>
        <Text style={styles.hint}>OK: {recountSummary.ok} · Modificados: {recountSummary.modified} · Total: {recountSummary.total}</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.recountTableHeader}>SKU</Text>
            <Text style={styles.recountDescriptionHeader}>Descripción</Text>
            <Text style={styles.recountTableHeader}>Conteo inicial</Text>
            <Text style={styles.recountTableHeader}>Nuevo reconteo</Text>
            <Text style={styles.recountActionHeader}></Text>
          </View>
          {recounts.map((row, index) => (
            <View key={`recount-${index}`} style={styles.tableRow}>
              <View style={[styles.recountTableInput, { paddingHorizontal: 7, paddingVertical: 8 }]}>
                <TextInput
                  value={row.sku}
                  onChangeText={(value) => updateRecount(index, { sku: value })}
                  onFocus={() => openSkuSearch(index)}
                  placeholder="SKU"
                  placeholderTextColor={brandColors.inputPlaceholder}
                  style={{ color: brandColors.inputText, fontSize: 12, padding: 0, width: '100%' }}
                />
              </View>
              <TextInput
                style={styles.recountDescriptionInput}
                value={row.itemDescription || ''}
                onChangeText={(value) => updateRecount(index, { itemDescription: value })}
                placeholder="Sin descripción encontrada"
              />
              <TextInput
                style={styles.recountTableInput}
                value={row.initialCount}
                onChangeText={(value) => updateRecount(index, { initialCount: value })}
                placeholder="0"
              />
              <TextInput
                style={styles.recountTableInput}
                value={row.finalRecount}
                onChangeText={(value) => updateRecount(index, { finalRecount: value })}
                placeholder="0"
              />
              <TouchableOpacity style={styles.recountRemoveButton} onPress={() => setRecounts((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                <Text style={styles.secondaryButtonText}>Quitar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setRecounts((current) => [...current, emptyRecount])}>
          <Text style={styles.secondaryButtonText}>Agregar reconteo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>3. Producto terminado</Text>
        <Text style={styles.hint}>Si no hay diferencias, esta sección puede quedar vacía.</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.recountDescriptionHeader}>Descripción</Text>
            <Text style={styles.recountTableHeader}>Stock teórico</Text>
            <Text style={styles.recountTableHeader}>Stock físico</Text>
            <Text style={styles.recountTableHeader}>Diferencia</Text>
            <Text style={styles.recountActionHeader}></Text>
          </View>
          {finishedProducts.map((row, index) => {
            const systemStock = parseNumber(row.systemStock);
            const physicalStock = parseNumber(row.physicalStock);
            const difference = systemStock !== null && physicalStock !== null ? physicalStock - systemStock : null;
            return (
              <View key={`finished-${index}`} style={styles.tableRow}>
                <TextInput
                  style={styles.recountDescriptionInput}
                  value={row.itemDescription}
                  onChangeText={(value) => updateFinishedProduct(index, { itemDescription: value })}
                  placeholder="Descripción"
                />
                <TextInput
                  style={styles.recountTableInput}
                  value={row.systemStock}
                  onChangeText={(value) => updateFinishedProduct(index, { systemStock: value })}
                  placeholder="0"
                />
                <TextInput
                  style={styles.recountTableInput}
                  value={row.physicalStock}
                  onChangeText={(value) => updateFinishedProduct(index, { physicalStock: value })}
                  placeholder="0"
                />
                <Text style={difference === null || difference === 0 ? styles.manualTableNeutralCell : difference > 0 ? styles.manualTablePositiveCell : styles.manualTableNegativeCell}>
                  {formatDecimal(difference)}
                </Text>
                <TouchableOpacity style={styles.recountRemoveButton} onPress={() => setFinishedProducts((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                  <Text style={styles.secondaryButtonText}>Quitar</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setFinishedProducts((current) => [...current, emptyFinishedProduct])}>
          <Text style={styles.secondaryButtonText}>Agregar diferencia de producto terminado</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>4. Cierres de caja</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.recountTableHeader}>Caja</Text>
            <Text style={styles.recountTableHeader}>Número de caja</Text>
            <Text style={styles.recountDescriptionHeader}>Cajero</Text>
            <Text style={styles.recountTableHeader}>Conteo físico</Text>
            <Text style={styles.recountTableHeader}>Sistema</Text>
            <Text style={styles.recountTableHeader}>Diferencia</Text>
            <Text style={styles.recountActionHeader}></Text>
          </View>
          {cashClosures.map((row, index) => {
            const physicalCash = parseNumber(row.cashValue);
            const systemCash = parseNumber(row.systemValue);
            const difference = physicalCash !== null && systemCash !== null ? physicalCash - systemCash : null;
            return (
              <View key={`cash-${index}`} style={styles.tableRow}>
                <TextInput style={styles.recountTableInput} value={row.cashRegister} onChangeText={(value) => setCashClosures((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, cashRegister: value } : item))} placeholder="Caja" />
                <TextInput style={styles.recountTableInput} value={row.cashRegisterNumber} onChangeText={(value) => setCashClosures((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, cashRegisterNumber: value } : item))} placeholder="Número" />
                <TextInput style={styles.recountDescriptionInput} value={row.cashierName} onChangeText={(value) => setCashClosures((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, cashierName: value } : item))} placeholder="Cajero" />
                <TextInput style={styles.recountTableInput} value={row.cashValue} onChangeText={(value) => setCashClosures((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, cashValue: value } : item))} placeholder="0" />
                <TextInput style={styles.recountTableInput} value={row.systemValue} onChangeText={(value) => setCashClosures((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, systemValue: value } : item))} placeholder="0" />
                <Text style={difference === null || difference === 0 ? styles.manualTableNeutralCell : difference > 0 ? styles.manualTablePositiveCell : styles.manualTableNegativeCell}>{formatDecimal(difference)}</Text>
                <TouchableOpacity style={styles.recountRemoveButton} onPress={() => setCashClosures((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                  <Text style={styles.secondaryButtonText}>Quitar</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setCashClosures((current) => [...current, emptyCashClosure])}>
          <Text style={styles.secondaryButtonText}>Agregar cierre de caja</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>5. Observación adicional</Text>
        <TextInput
          style={styles.textArea}
          value={additionalObservation}
          onChangeText={setAdditionalObservation}
          placeholder="Escribe cualquier novedad o comentario libre del auditor"
          multiline
        />
      </View>

      <View style={styles.grid}>
        <TouchableOpacity disabled={saving} style={[styles.primaryButton, saving && styles.disabledButton]} onPress={() => saveAll(false)}>
          <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar todo'}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={saving} style={[styles.primaryButton, saving && styles.disabledButton]} onPress={() => saveAll(true)}>
          <Text style={styles.primaryButtonText}>Guardar y continuar a evidencias</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={skuSearchIndex !== null} transparent animationType="fade" onRequestClose={closeSkuSearch}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 760, maxHeight: '82%' }]}>
            <Text style={styles.blockTitle}>Buscar SKU para reconteo</Text>
            <TextInput
              style={styles.input}
              value={skuSearchQuery}
              onChangeText={setSkuSearchQuery}
              placeholder="Buscar por SKU o descripción"
              placeholderTextColor={brandColors.inputPlaceholder}
              autoFocus
            />
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.evidenceMiniCardList}>
              {filteredSkuOptions.length === 0 ? (
                <Text style={styles.hint}>Sin resultados para la búsqueda.</Text>
              ) : filteredSkuOptions.map((item) => (
                <TouchableOpacity
                  key={`sku-option-${item.sku}`}
                  style={styles.evidenceMiniCard}
                  onPress={() => selectSkuForRecount(item)}
                  activeOpacity={0.85}
                >
                  <View style={styles.evidenceMiniInfo}>
                    <Text style={styles.evidenceMiniTitle}>{item.sku}</Text>
                    <Text style={styles.evidenceMiniMeta}>{item.item_description || 'Sin descripción encontrada'}</Text>
                  </View>
                  <Text style={styles.secondaryButtonText}>Seleccionar</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.footerActions}>
              <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={closeSkuSearch}>
                <Text style={styles.secondaryButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </InventoryShell>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

function Input({ label, value, onChangeText, placeholder }: InputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder || label} />
    </View>
  );
}

function DateField({
  label,
  value,
  selectedDate,
  visible,
  onOpen,
  onChange,
  onWebChange,
}: {
  label: string;
  value: string;
  selectedDate: Date;
  visible: boolean;
  onOpen: () => void;
  onChange: (event: DateTimePickerEvent, date?: Date) => void;
  onWebChange: (value: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const displayValue = value ? isoDateToDisplayDate(value) : '';
  const [manualValue, setManualValue] = React.useState(displayValue);

  React.useEffect(() => {
    setManualValue(displayValue);
  }, [displayValue]);

  const commitManualValue = () => {
    if (!manualValue.trim()) {
      onWebChange('');
      return;
    }

    const isoDate = displayDateToIsoDate(manualValue);
    if (isoDate) onWebChange(isoDate);
    else setManualValue(displayValue);
  };

  if (Platform.OS === 'web') {
    const openPicker = () => {
      const input = inputRef.current;
      if (!input) return;
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    };

    return (
      <View style={styles.dateTimeItem}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.webDateTimeShell, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, position: 'relative' }]}>
          <TextInput
            style={[styles.webDateTimeDisplay, { flex: 1, minWidth: 0 }]}
            value={manualValue}
            onChangeText={setManualValue}
            onBlur={commitManualValue}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={brandColors.inputPlaceholder}
          />
          <TouchableOpacity
            onPress={openPicker}
            activeOpacity={0.85}
            style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.greenSoft }}
          >
            <Text style={{ fontSize: 16 }}>📅</Text>
          </TouchableOpacity>
          {React.createElement('input', {
            ref: inputRef,
            type: 'date',
            value,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => onWebChange(event.target.value),
            style: webHiddenDateInputStyle,
            'aria-label': label,
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dateTimeItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.clockButton, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }]}>
        <TextInput
          style={[styles.clockValue, { flex: 1, minWidth: 0 }]}
          value={manualValue}
          onChangeText={setManualValue}
          onBlur={commitManualValue}
          placeholder="dd/mm/aaaa"
          placeholderTextColor={brandColors.inputPlaceholder}
        />
        <TouchableOpacity
          onPress={onOpen}
          style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.greenSoft }}
        >
          <Text style={{ fontSize: 16 }}>📅</Text>
        </TouchableOpacity>
      </View>
      {visible && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="calendar"
          onChange={onChange}
          positiveButton={{ label: 'Aceptar', textColor: brandColors.greenDark }}
          negativeButton={{ label: 'Cancelar', textColor: brandColors.greenDark }}
        />
      )}
    </View>
  );
}

const webHiddenDateInputStyle = {
  maxWidth: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  opacity: 0,
  position: 'absolute',
  right: 0,
  top: 0,
  width: 44,
  height: 44,
  cursor: 'pointer',
  pointerEvents: 'none',
} as const;






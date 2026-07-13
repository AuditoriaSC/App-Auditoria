import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';
import { listActiveResponsibles, ResponsibleRow } from '../../../../../src/services/responsiblesService';

type ProfileRow = {
  id: string;
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type LocalRow = {
  codigo_interno: string;
  nombre_local: string;
  region: string;
};

type ResponsibleOption = {
  id: string;
  codigo: string;
  nombre: string;
  cargo: string | null;
  region: string | null;
};

const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const cutoffYearOptions = Array.from({ length: 11 }, (_, index) => 2026 + index);
const defaultCutoffYear = cutoffYearOptions.includes(new Date().getFullYear()) ? new Date().getFullYear() : 2026;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateToIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoDateToDisplayDate(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function displayDateToIsoDate(value: string) {
  const [day, month, year] = value.trim().split('/').map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return dateToIsoDate(date);
}

function normalizeDisplayTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function maskTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function dateToTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDaysToIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return dateToIsoDate(date);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && dateToIsoDate(parsed) === value;
}

function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function pickerDate(dateValue: string, timeValue = '00:00') {
  const date = new Date(`${dateValue}T${timeValue || '00:00'}:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildCreateReportError(errorMessage?: string) {
  if (!errorMessage) return 'No se pudo crear el informe de inventario.';
  if (errorMessage.includes('inventory_module_access')) {
    return 'No se pudo crear el informe porque falta configurar el acceso interno del módulo Inventarios.';
  }
  if (errorMessage.toLowerCase().includes('row-level security')) {
    return 'No se pudo crear el informe por permisos del módulo Inventarios. Verifica que tu usuario tenga acceso habilitado.';
  }
  return 'No se pudo crear el informe de inventario: ' + errorMessage;
}

export default function CreateInventoryReportScreen() {
  const router = useRouter();
  const today = useMemo(() => dateToIsoDate(new Date()), []);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [responsibles, setResponsibles] = useState<ResponsibleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [localQuery, setLocalQuery] = useState('');
  const [selectedLocal, setSelectedLocal] = useState<LocalRow | null>(null);
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [responsibleQuery, setResponsibleQuery] = useState('');
  const [selectedResponsible, setSelectedResponsible] = useState<ResponsibleOption | null>(null);
  const [responsibleSearchOpen, setResponsibleSearchOpen] = useState(false);
  const [inventoryDate, setInventoryDate] = useState(today);
  const [inventoryCutoffMonth, setInventoryCutoffMonth] = useState('');
  const [inventoryCutoffYear, setInventoryCutoffYear] = useState(String(defaultCutoffYear));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hasSecondTimeRange, setHasSecondTimeRange] = useState(false);
  const [secondStartTime, setSecondStartTime] = useState('');
  const [secondEndTime, setSecondEndTime] = useState('');
  const [showInventoryDatePicker, setShowInventoryDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showSecondStartTimePicker, setShowSecondStartTimePicker] = useState(false);
  const [showSecondEndTimePicker, setShowSecondEndTimePicker] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setLoading(true);
      setMessage(null);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        if (active) {
          setMessage('No se pudo validar la sesión.');
          setLoading(false);
        }
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, region')
        .eq('id', user.id)
        .single<ProfileRow>();

      if (profileError || !profileData) {
        if (active) {
          setMessage('No se pudo cargar el auditor encargado.');
          setLoading(false);
        }
        return;
      }

      let localesQuery = supabase
        .from('locales')
        .select('codigo_interno, nombre_local, region')
        .order('codigo_interno', { ascending: true });

      if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
        localesQuery = localesQuery.eq('region', profileData.region);
      }

      const { data: localesData, error: localesError } = await localesQuery;
      const { data: responsiblesData, error: responsiblesError } = await listActiveResponsibles(profileData.role, profileData.region);

      if (!active) return;

      setProfile(profileData);
      if (localesError) setMessage('No se pudieron cargar los locales: ' + localesError.message);
      else setLocales(localesData || []);

      if (responsiblesError) setMessage('No se pudieron cargar los responsables: ' + responsiblesError.message);
      else setResponsibles((responsiblesData || []).map(mapResponsibleRow));

      setLoading(false);
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  const selectedCutoff = useMemo(() => {
    const month = Number(inventoryCutoffMonth);
    const year = Number(inventoryCutoffYear);
    if (!month || !year) return null;
    return {
      value: `${year}-${pad(month)}`,
      label: `${monthNames[month - 1]} ${year}`,
      month,
      year,
    };
  }, [inventoryCutoffMonth, inventoryCutoffYear]);
  const regularizationDate = useMemo(() => addDaysToIsoDate(inventoryDate, 1), [inventoryDate]);
  const selectedInventoryDate = useMemo(() => pickerDate(inventoryDate, startTime), [inventoryDate, startTime]);
  const selectedStartTime = useMemo(() => pickerDate(inventoryDate, startTime || '08:00'), [inventoryDate, startTime]);
  const selectedEndTime = useMemo(() => pickerDate(inventoryDate, endTime || '17:00'), [endTime, inventoryDate]);
  const selectedSecondStartTime = useMemo(() => pickerDate(inventoryDate, secondStartTime || '18:00'), [inventoryDate, secondStartTime]);
  const selectedSecondEndTime = useMemo(() => pickerDate(inventoryDate, secondEndTime || '20:00'), [inventoryDate, secondEndTime]);

  const filteredLocales = useMemo(() => {
    const term = normalize(localQuery);
    const source = term
      ? locales.filter((local) => normalize(`${local.codigo_interno} ${local.nombre_local} ${local.region}`).includes(term))
      : locales;
    return source.slice(0, 80);
  }, [localQuery, locales]);

  const filteredResponsibles = useMemo(() => {
    const term = normalize(responsibleQuery);
    const source = term
      ? responsibles.filter((responsible) => normalize(`${responsible.codigo} ${responsible.nombre} ${responsible.cargo || ''} ${responsible.region || ''}`).includes(term))
      : responsibles;
    return source.slice(0, 80);
  }, [responsibleQuery, responsibles]);

  const formError = useMemo(() => {
    if (!selectedLocal) return 'Selecciona un local.';
    if (!selectedCutoff) return 'Selecciona mes y año del corte de inventario.';
    if (!selectedResponsible) return 'Selecciona el líder o responsable del local.';
    if (!isIsoDate(inventoryDate)) return 'Ingresa una fecha de inventario válida.';
    if (!regularizationDate) return 'No se pudo calcular la fecha de regularización.';
    if (!isTime(startTime)) return 'Ingresa hora de inicio válida.';
    if (!isTime(endTime)) return 'Ingresa hora de finalización válida.';
    if (!profile?.id) return 'No se pudo validar el auditor encargado.';
    if (hasSecondTimeRange && !isTime(secondStartTime)) return 'Ingresa segunda hora de inicio válida.';
    if (hasSecondTimeRange && !isTime(secondEndTime)) return 'Ingresa segunda hora de finalización válida.';
    return null;
  }, [endTime, hasSecondTimeRange, inventoryDate, profile?.id, regularizationDate, secondEndTime, secondStartTime, selectedCutoff, selectedLocal, selectedResponsible, startTime]);

  const selectLocal = (local: LocalRow) => {
    setSelectedLocal(local);
    setLocalQuery(`${local.codigo_interno} · ${local.nombre_local}`);
    setLocalSearchOpen(false);
  };

  const selectResponsible = (responsible: ResponsibleOption) => {
    setSelectedResponsible(responsible);
    setResponsibleQuery(`${responsible.codigo} · ${responsible.nombre}`);
    setResponsibleSearchOpen(false);
  };

  const toggleSecondTimeRange = () => {
    setHasSecondTimeRange((current) => {
      if (current) {
        setSecondStartTime('');
        setSecondEndTime('');
      }
      return !current;
    });
  };

  const handleSave = async () => {
    if (formError || !selectedLocal || !selectedResponsible || !profile || !selectedCutoff) {
      setMessage(formError || 'Completa los campos obligatorios.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { data: report, error } = await supabase
      .from('inventory_reports')
      .insert([{
        local_codigo: selectedLocal.codigo_interno,
        local_name_snapshot: selectedLocal.nombre_local,
        region: selectedLocal.region,
        responsible_id: selectedResponsible.id,
        responsible_code_snapshot: selectedResponsible.codigo,
        responsible_name_snapshot: selectedResponsible.nombre,
        inventory_cutoff_month: selectedCutoff.month,
        inventory_cutoff_year: selectedCutoff.year,
        inventory_cutoff_label: selectedCutoff.label,
        inventory_date: inventoryDate,
        front_regularization_date: regularizationDate,
        start_time: startTime,
        end_time: endTime,
        has_second_time_range: hasSecondTimeRange,
        second_start_time: hasSecondTimeRange ? secondStartTime : null,
        second_end_time: hasSecondTimeRange ? secondEndTime : null,
        assigned_auditor_id: profile.id,
        assigned_auditor_name_snapshot: profile.full_name,
        created_by: profile.id,
        status: 'draft',
      }])
      .select('id')
      .single<{ id: string }>();

    setSaving(false);

    if (error || !report) {
      setMessage(buildCreateReportError(error?.message));
      return;
    }

    router.push({
      pathname: '/modulos/inventarios/carga-csv',
      params: { inventory_report_id: report.id },
    });
  };

  if (loading) {
    return (
      <InventoryShell title="Crear Informe de Inventario" subtitle="Cargando datos base del encabezado.">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brandColors.greenDark} />
          <Text style={styles.hint}>Cargando locales y auditor encargado...</Text>
        </View>
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title="Crear Informe de Inventario"
      subtitle="Crea el borrador inicial del informe. El auditor encargado se toma del usuario logueado y no se puede cambiar en esta fase."
    >
      <View style={styles.form}>
        {message ? <Text style={styles.errorText}>{message}</Text> : null}

        <View style={styles.twoColumnRow}>
          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>Local *</Text>
            <TouchableOpacity style={styles.searchSelectorButton} onPress={() => setLocalSearchOpen(true)} activeOpacity={0.85}>
              <Text style={selectedLocal ? styles.searchSelectorText : styles.searchSelectorPlaceholder}>
                {selectedLocal ? `${selectedLocal.codigo_interno} · ${selectedLocal.nombre_local}` : 'Buscar por código o nombre'}
              </Text>
              <Text style={styles.categoryDropdownIcon}>⌕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>Corte de Inventario *</Text>
            <View style={styles.cutoffInlineRow}>
              <SegmentSelector
                value={inventoryCutoffMonth}
                placeholder="Mes"
                options={monthNames.map((name, index) => ({ value: String(index + 1), label: name }))}
                onChange={setInventoryCutoffMonth}
              />
              <SegmentSelector
                value={inventoryCutoffYear}
                placeholder="Año"
                options={cutoffYearOptions.map((year) => ({ value: String(year), label: String(year) }))}
                onChange={setInventoryCutoffYear}
              />
            </View>
          </View>
        </View>

        <View style={styles.twoColumnRow}>
          <View style={styles.twoColumnItem}>
            <DateTimeField
              label="Fecha de inventario *"
              value={inventoryDate}
              mode="date"
              selectedDate={selectedInventoryDate}
              visible={showInventoryDatePicker}
              onOpen={() => setShowInventoryDatePicker(true)}
              onChange={(_event, date) => {
                if (Platform.OS !== 'ios') setShowInventoryDatePicker(false);
                if (date) setInventoryDate(dateToIsoDate(date));
              }}
              onWebChange={setInventoryDate}
            />
          </View>

          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>Fecha de regularización</Text>
            <TextInput
              style={styles.input}
              value={isoDateToDisplayDate(regularizationDate)}
              editable={false}
              placeholder="Se calcula automáticamente"
            />
          </View>
        </View>

        <View style={styles.twoColumnRow}>
          <View style={styles.twoColumnItem}>
            <DateTimeField
              label="Hora de inicio *"
              value={startTime}
              mode="time"
              selectedDate={selectedStartTime}
              visible={showStartTimePicker}
              onOpen={() => setShowStartTimePicker(true)}
              onChange={(_event, date) => {
                if (Platform.OS !== 'ios') setShowStartTimePicker(false);
                if (date) setStartTime(dateToTime(date));
              }}
              onWebChange={setStartTime}
            />
          </View>

          <View style={styles.twoColumnItem}>
            <DateTimeField
              label="Hora de finalización *"
              value={endTime}
              mode="time"
              selectedDate={selectedEndTime}
              visible={showEndTimePicker}
              onOpen={() => setShowEndTimePicker(true)}
              onChange={(_event, date) => {
                if (Platform.OS !== 'ios') setShowEndTimePicker(false);
                if (date) setEndTime(dateToTime(date));
              }}
              onWebChange={setEndTime}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={toggleSecondTimeRange}>
          <Text style={styles.secondaryButtonText}>
            {hasSecondTimeRange ? 'Quitar segundo horario' : 'Añadir segundo horario'}
          </Text>
        </TouchableOpacity>

        {hasSecondTimeRange ? (
          <View style={styles.twoColumnRow}>
            <View style={styles.twoColumnItem}>
              <DateTimeField
                label="Segunda hora de inicio *"
                value={secondStartTime}
                mode="time"
                selectedDate={selectedSecondStartTime}
                visible={showSecondStartTimePicker}
                onOpen={() => setShowSecondStartTimePicker(true)}
                onChange={(_event, date) => {
                  if (Platform.OS !== 'ios') setShowSecondStartTimePicker(false);
                  if (date) setSecondStartTime(dateToTime(date));
                }}
                onWebChange={setSecondStartTime}
              />
            </View>

            <View style={styles.twoColumnItem}>
              <DateTimeField
                label="Segunda hora de finalización *"
                value={secondEndTime}
                mode="time"
                selectedDate={selectedSecondEndTime}
                visible={showSecondEndTimePicker}
                onOpen={() => setShowSecondEndTimePicker(true)}
                onChange={(_event, date) => {
                  if (Platform.OS !== 'ios') setShowSecondEndTimePicker(false);
                  if (date) setSecondEndTime(dateToTime(date));
                }}
                onWebChange={setSecondEndTime}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.twoColumnRow}>
          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>Líder / responsable del local *</Text>
            <TouchableOpacity style={styles.searchSelectorButton} onPress={() => setResponsibleSearchOpen(true)} activeOpacity={0.85}>
              <Text style={selectedResponsible ? styles.searchSelectorText : styles.searchSelectorPlaceholder}>
                {selectedResponsible ? `${selectedResponsible.codigo} · ${selectedResponsible.nombre}` : 'Buscar por código o nombre'}
              </Text>
              <Text style={styles.categoryDropdownIcon}>⌕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>Auditor encargado</Text>
            <TextInput
              style={styles.input}
              value={profile?.full_name || ''}
              editable={false}
              placeholder="Usuario logueado"
            />
            <Text style={styles.hint}>Se toma del usuario logueado y no es editable.</Text>
          </View>
        </View>

        {formError ? <Text style={styles.hint}>{formError}</Text> : null}

        <View style={styles.footerActions}>
          <TouchableOpacity
            disabled={Boolean(formError) || saving}
            style={[styles.primaryButton, styles.footerPrimaryButton, (Boolean(formError) || saving) && styles.disabledButton]}
            onPress={handleSave}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Siguiente'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SearchModal
        visible={localSearchOpen}
        title="Buscar local"
        query={localQuery}
        onQueryChange={setLocalQuery}
        placeholder="Buscar por código, nombre o región"
        emptyText="No hay locales que coincidan con la búsqueda."
        onClose={() => setLocalSearchOpen(false)}
      >
        {filteredLocales.map((local) => (
          <TouchableOpacity key={local.codigo_interno} style={styles.evidenceMiniCard} onPress={() => selectLocal(local)}>
            <View style={styles.evidenceMiniInfo}>
              <Text style={styles.evidenceMiniTitle}>{local.codigo_interno} · {local.nombre_local}</Text>
              <Text style={styles.evidenceMiniMeta}>{local.region}</Text>
            </View>
            <Text style={styles.secondaryButtonText}>Seleccionar</Text>
          </TouchableOpacity>
        ))}
      </SearchModal>

      <SearchModal
        visible={responsibleSearchOpen}
        title="Buscar líder / responsable"
        query={responsibleQuery}
        onQueryChange={setResponsibleQuery}
        placeholder="Buscar por código, nombre, cargo o región"
        emptyText="No hay responsables activos que coincidan con la búsqueda."
        onClose={() => setResponsibleSearchOpen(false)}
      >
        {filteredResponsibles.map((responsible) => (
          <TouchableOpacity key={responsible.id} style={styles.evidenceMiniCard} onPress={() => selectResponsible(responsible)}>
            <View style={styles.evidenceMiniInfo}>
              <Text style={styles.evidenceMiniTitle}>{responsible.codigo} · {responsible.nombre}</Text>
              <Text style={styles.evidenceMiniMeta}>{responsible.cargo || 'Sin cargo'} · {responsible.region || 'Sin región'}</Text>
            </View>
            <Text style={styles.secondaryButtonText}>Seleccionar</Text>
          </TouchableOpacity>
        ))}
      </SearchModal>
    </InventoryShell>
  );
}

function mapResponsibleRow(row: ResponsibleRow): ResponsibleOption {
  return {
    id: row.id,
    codigo: row.responsible_code,
    nombre: row.responsible_name,
    cargo: row.position,
    region: row.region,
  };
}

function SegmentSelector({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.segmentSelector}>
      <TouchableOpacity style={styles.segmentSelectorButton} onPress={() => setOpen((current) => !current)}>
        <Text style={selected ? styles.searchSelectorText : styles.searchSelectorPlaceholder}>{selected?.label || placeholder}</Text>
        <Text style={styles.categoryDropdownIcon}>{open ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={styles.segmentSelectorPanel}>
          <ScrollView style={styles.segmentSelectorScroll} nestedScrollEnabled>
            {options.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.categoryDropdownOption, value === option.value && styles.categoryDropdownOptionActive]}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Text style={styles.categoryDropdownOptionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function SearchModal({
  visible,
  title,
  query,
  onQueryChange,
  placeholder,
  emptyText,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  emptyText: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const hasResults = React.Children.count(children) > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxWidth: 760, maxHeight: '82%' }]}>
          <Text style={styles.blockTitle}>{title}</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={onQueryChange}
            placeholder={placeholder}
            placeholderTextColor={brandColors.inputPlaceholder}
            autoFocus
          />
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.evidenceMiniCardList}>
            {hasResults ? children : <Text style={styles.hint}>{emptyText}</Text>}
          </ScrollView>
          <View style={styles.footerActions}>
            <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DateTimeField({
  label,
  value,
  mode,
  selectedDate,
  visible,
  onOpen,
  onChange,
  onWebChange,
}: {
  label: string;
  value: string;
  mode: 'date' | 'time';
  selectedDate: Date;
  visible: boolean;
  onOpen: () => void;
  onChange: (event: DateTimePickerEvent, date?: Date) => void;
  onWebChange: (value: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const displayValue = mode === 'date' ? isoDateToDisplayDate(value) : value;
  const [manualValue, setManualValue] = React.useState(displayValue);

  React.useEffect(() => {
    setManualValue(displayValue);
  }, [displayValue]);

  const commitManualValue = () => {
    if (mode === 'date') {
      const isoDate = displayDateToIsoDate(manualValue);
      if (isoDate) onWebChange(isoDate);
      else setManualValue(displayValue);
      return;
    }

    const normalizedTime = normalizeDisplayTime(manualValue);
    if (normalizedTime) onWebChange(normalizedTime);
    else setManualValue(displayValue);
  };

  if (Platform.OS === 'web') {
    const openPicker = () => {
      const input = inputRef.current;
      if (!input) return;
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    };

    return (
      <View style={styles.dateTimeItem}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.maskedDateTimeShell}>
          <TextInput
            style={[styles.webDateTimeDisplay, { flex: 1, minWidth: 0 }]}
            value={manualValue}
            onChangeText={(text) => setManualValue(mode === 'date' ? maskDateInput(text) : maskTimeInput(text))}
            onBlur={commitManualValue}
            placeholder={mode === 'date' ? 'dd/mm/aaaa' : 'hh:mm'}
            placeholderTextColor={brandColors.inputPlaceholder}
            keyboardType="numeric"
          />
          <TouchableOpacity onPress={openPicker} activeOpacity={0.85} style={styles.dateTimeIconButton}>
            <Text style={styles.dateTimeIconText}>{mode === 'date' ? '📅' : '◷'}</Text>
          </TouchableOpacity>
          {React.createElement('input', {
            ref: inputRef,
            type: mode,
            value,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => onWebChange(event.target.value),
            style: webHiddenPickerInputStyle,
            'aria-label': label,
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dateTimeItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.maskedDateTimeShell}>
        <TextInput
          style={[styles.clockValue, { flex: 1, minWidth: 0 }]}
          value={manualValue}
          onChangeText={(text) => setManualValue(mode === 'date' ? maskDateInput(text) : maskTimeInput(text))}
          onBlur={commitManualValue}
          placeholder={mode === 'date' ? 'dd/mm/aaaa' : 'hh:mm'}
          placeholderTextColor={brandColors.inputPlaceholder}
          keyboardType="numeric"
        />
        <TouchableOpacity onPress={onOpen} style={styles.dateTimeIconButton}>
          <Text style={styles.dateTimeIconText}>{mode === 'date' ? '📅' : '◷'}</Text>
        </TouchableOpacity>
      </View>
      {visible && (
        <DateTimePicker
          value={selectedDate}
          mode={mode}
          display={mode === 'date' ? 'calendar' : 'clock'}
          onChange={onChange}
          is24Hour
          positiveButton={{ label: 'Aceptar', textColor: brandColors.greenDark }}
          negativeButton={{ label: 'Cancelar', textColor: brandColors.greenDark }}
        />
      )}
    </View>
  );
}

const webHiddenPickerInputStyle = {
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
} as React.CSSProperties;

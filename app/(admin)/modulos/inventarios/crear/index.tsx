import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

const maxVisibleOptions = 8;

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

function buildCreateReportError(errorMessage?: string) {
  if (!errorMessage) return 'No se pudo crear el informe de inventario.';
  if (errorMessage.includes('inventory_module_access')) {
    return 'No se pudo crear el informe porque falta configurar el acceso interno del módulo Inventarios. Aplica la migración de acceso y habilita tu usuario para inventarios.';
  }
  if (errorMessage.toLowerCase().includes('row-level security')) {
    return 'No se pudo crear el informe por permisos del módulo Inventarios. Verifica que tu usuario tenga acceso habilitado.';
  }
  return 'No se pudo crear el informe de inventario: ' + errorMessage;
}

function pickerDate(dateValue: string, timeValue = '00:00') {
  const date = new Date(`${dateValue}T${timeValue || '00:00'}:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
      if (localesError) {
        setMessage('No se pudieron cargar los locales: ' + localesError.message);
      } else {
        setLocales(localesData || []);
      }
      if (responsiblesError) {
        setMessage('No se pudieron cargar los responsables: ' + responsiblesError.message);
      } else {
        setResponsibles((responsiblesData || []).map(mapResponsibleRow));
      }
      setLoading(false);
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  const regularizationDate = useMemo(() => addDaysToIsoDate(inventoryDate, 1), [inventoryDate]);
  const selectedInventoryDate = useMemo(() => pickerDate(inventoryDate, startTime), [inventoryDate, startTime]);
  const selectedStartTime = useMemo(() => pickerDate(inventoryDate, startTime || '08:00'), [inventoryDate, startTime]);
  const selectedEndTime = useMemo(() => pickerDate(inventoryDate, endTime || '17:00'), [endTime, inventoryDate]);
  const selectedSecondStartTime = useMemo(() => pickerDate(inventoryDate, secondStartTime || '18:00'), [inventoryDate, secondStartTime]);
  const selectedSecondEndTime = useMemo(() => pickerDate(inventoryDate, secondEndTime || '20:00'), [inventoryDate, secondEndTime]);

  const filteredLocales = useMemo(() => {
    const term = normalize(localQuery);
    const source = term
      ? locales.filter((local) =>
          normalize(`${local.codigo_interno} ${local.nombre_local} ${local.region}`).includes(term),
        )
      : locales;

    return source.slice(0, maxVisibleOptions);
  }, [localQuery, locales]);

  const filteredResponsibles = useMemo(() => {
    const term = normalize(responsibleQuery);
    const source = term
      ? responsibles.filter((responsible) =>
          normalize(`${responsible.codigo} ${responsible.nombre} ${responsible.cargo || ''} ${responsible.region || ''}`).includes(term),
        )
      : responsibles;

    return source.slice(0, maxVisibleOptions);
  }, [responsibleQuery, responsibles]);

  const formError = useMemo(() => {
    if (!selectedLocal) return 'Selecciona un local.';
    if (!selectedResponsible) return 'Selecciona el líder o responsable del local.';
    if (!isIsoDate(inventoryDate)) return 'Ingresa una fecha de inventario válida en formato AAAA-MM-DD.';
    if (!regularizationDate) return 'No se pudo calcular la fecha de regularización.';
    if (!isTime(startTime)) return 'Ingresa hora de inicio válida en formato HH:MM.';
    if (!isTime(endTime)) return 'Ingresa hora de finalización válida en formato HH:MM.';
    if (!profile?.id) return 'No se pudo validar el auditor encargado.';
    if (hasSecondTimeRange && !isTime(secondStartTime)) return 'Ingresa segunda hora de inicio válida en formato HH:MM.';
    if (hasSecondTimeRange && !isTime(secondEndTime)) return 'Ingresa segunda hora de finalización válida en formato HH:MM.';
    return null;
  }, [endTime, hasSecondTimeRange, inventoryDate, profile?.id, regularizationDate, secondEndTime, secondStartTime, selectedLocal, selectedResponsible, startTime]);

  const handleLocalSearch = (value: string) => {
    setLocalQuery(value);
    setSelectedLocal(null);
    setLocalSearchOpen(true);
  };

  const handleResponsibleSearch = (value: string) => {
    setResponsibleQuery(value);
    setSelectedResponsible(null);
    setResponsibleSearchOpen(true);
  };

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

  const handleInventoryDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowInventoryDatePicker(false);
    if (date) setInventoryDate(dateToIsoDate(date));
  };

  const handleStartTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowStartTimePicker(false);
    if (date) setStartTime(dateToTime(date));
  };

  const handleEndTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowEndTimePicker(false);
    if (date) setEndTime(dateToTime(date));
  };

  const handleSecondStartTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowSecondStartTimePicker(false);
    if (date) setSecondStartTime(dateToTime(date));
  };

  const handleSecondEndTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowSecondEndTimePicker(false);
    if (date) setSecondEndTime(dateToTime(date));
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
    if (formError || !selectedLocal || !selectedResponsible || !profile) {
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
      <InventoryShell
        title="Crear Informe de Inventario"
        subtitle="Cargando datos base del encabezado."
      >
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

        <View style={styles.field}>
          <Text style={styles.label}>Local *</Text>
          <TextInput
            style={styles.input}
            value={localQuery}
            onChangeText={handleLocalSearch}
            onFocus={() => setLocalSearchOpen(true)}
            placeholder="Buscar por código o nombre"
          />
          {localSearchOpen ? (
            <View style={styles.optionsPanel}>
              {filteredLocales.length > 0 ? filteredLocales.map((local) => (
                <TouchableOpacity key={local.codigo_interno} style={styles.optionRow} onPress={() => selectLocal(local)}>
                  <Text style={styles.optionTitle}>{local.codigo_interno} · {local.nombre_local}</Text>
                  <Text style={styles.optionSubtitle}>{local.region}</Text>
                </TouchableOpacity>
              )) : (
                <Text style={styles.hint}>No hay locales que coincidan con la búsqueda.</Text>
              )}
            </View>
          ) : null}
          {selectedLocal ? (
            <Text style={styles.hint}>
              Se guardará código {selectedLocal.codigo_interno} y snapshot “{selectedLocal.nombre_local}”.
            </Text>
          ) : null}
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
              onChange={handleInventoryDateChange}
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
              onChange={handleStartTimeChange}
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
              onChange={handleEndTimeChange}
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
                onChange={handleSecondStartTimeChange}
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
                onChange={handleSecondEndTimeChange}
                onWebChange={setSecondEndTime}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.twoColumnRow}>
          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>Líder / responsable del local *</Text>
            <TextInput
              style={styles.input}
              value={responsibleQuery}
              onChangeText={handleResponsibleSearch}
              onFocus={() => setResponsibleSearchOpen(true)}
              placeholder="Buscar por código o nombre"
            />
            {responsibleSearchOpen ? (
              <View style={styles.optionsPanel}>
                {filteredResponsibles.length > 0 ? filteredResponsibles.map((responsible) => (
                  <TouchableOpacity key={responsible.id} style={styles.optionRow} onPress={() => selectResponsible(responsible)}>
                    <Text style={styles.optionTitle}>{responsible.codigo} · {responsible.nombre}</Text>
                    <Text style={styles.optionSubtitle}>{responsible.cargo || 'Sin cargo'} · {responsible.region || 'Sin región'}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={styles.hint}>No hay responsables activos que coincidan con la búsqueda.</Text>
                )}
              </View>
            ) : null}
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
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    };

    return (
      <View style={styles.dateTimeItem}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.webDateTimeShell}>
          <TextInput
            style={styles.webDateTimeDisplay}
            value={manualValue}
            onChangeText={setManualValue}
            onBlur={commitManualValue}
            placeholder={mode === 'date' ? 'dd/mm/aaaa' : 'hh:mm'}
            placeholderTextColor={brandColors.inputPlaceholder}
          />
          <TouchableOpacity onPress={openPicker} activeOpacity={0.85}>
            <Text style={styles.clockHint}>{mode === 'date' ? 'Calendario' : 'Reloj'}</Text>
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
      <View style={styles.clockButton}>
        <TextInput
          style={styles.clockValue}
          value={manualValue}
          onChangeText={setManualValue}
          onBlur={commitManualValue}
          placeholder={mode === 'date' ? 'dd/mm/aaaa' : 'hh:mm'}
          placeholderTextColor={brandColors.inputPlaceholder}
        />
        <TouchableOpacity onPress={onOpen}>
          <Text style={styles.clockHint}>{mode === 'date' ? 'Abrir calendario' : 'Abrir reloj'}</Text>
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
} as React.CSSProperties;

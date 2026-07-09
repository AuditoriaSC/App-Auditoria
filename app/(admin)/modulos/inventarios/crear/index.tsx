import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';

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

const maxVisibleOptions = 8;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateToIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export default function CreateInventoryReportScreen() {
  const router = useRouter();
  const today = useMemo(() => dateToIsoDate(new Date()), []);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [localQuery, setLocalQuery] = useState('');
  const [selectedLocal, setSelectedLocal] = useState<LocalRow | null>(null);
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [inventoryDate, setInventoryDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hasSecondTimeRange, setHasSecondTimeRange] = useState(false);
  const [secondStartTime, setSecondStartTime] = useState('');
  const [secondEndTime, setSecondEndTime] = useState('');

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

      if (!active) return;

      setProfile(profileData);
      if (localesError) {
        setMessage('No se pudieron cargar los locales: ' + localesError.message);
      } else {
        setLocales(localesData || []);
      }
      setLoading(false);
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  const regularizationDate = useMemo(() => addDaysToIsoDate(inventoryDate, 1), [inventoryDate]);

  const filteredLocales = useMemo(() => {
    const term = normalize(localQuery);
    const source = term
      ? locales.filter((local) =>
          normalize(`${local.codigo_interno} ${local.nombre_local} ${local.region}`).includes(term),
        )
      : locales;

    return source.slice(0, maxVisibleOptions);
  }, [localQuery, locales]);

  const formError = useMemo(() => {
    if (!selectedLocal) return 'Selecciona un local.';
    if (!isIsoDate(inventoryDate)) return 'Ingresa una fecha de inventario válida en formato AAAA-MM-DD.';
    if (!regularizationDate) return 'No se pudo calcular la fecha de regularización.';
    if (!isTime(startTime)) return 'Ingresa hora de inicio válida en formato HH:MM.';
    if (!isTime(endTime)) return 'Ingresa hora de finalización válida en formato HH:MM.';
    if (!profile?.id) return 'No se pudo validar el auditor encargado.';
    if (hasSecondTimeRange && !isTime(secondStartTime)) return 'Ingresa segunda hora de inicio válida en formato HH:MM.';
    if (hasSecondTimeRange && !isTime(secondEndTime)) return 'Ingresa segunda hora de finalización válida en formato HH:MM.';
    return null;
  }, [endTime, hasSecondTimeRange, inventoryDate, profile?.id, regularizationDate, secondEndTime, secondStartTime, selectedLocal, startTime]);

  const handleLocalSearch = (value: string) => {
    setLocalQuery(value);
    setSelectedLocal(null);
    setLocalSearchOpen(true);
  };

  const selectLocal = (local: LocalRow) => {
    setSelectedLocal(local);
    setLocalQuery(`${local.codigo_interno} · ${local.nombre_local}`);
    setLocalSearchOpen(false);
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
    if (formError || !selectedLocal || !profile) {
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
      setMessage('No se pudo crear el informe de inventario: ' + (error?.message || 'sin detalle'));
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
        title="Crear Informe de Inventario — Encabezado"
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
      title="Crear Informe de Inventario — Encabezado"
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

        <View style={styles.field}>
          <Text style={styles.label}>Fecha de inventario *</Text>
          <TextInput
            style={styles.input}
            value={inventoryDate}
            onChangeText={setInventoryDate}
            placeholder="AAAA-MM-DD"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Fecha de regularización</Text>
          <TextInput
            style={styles.input}
            value={regularizationDate}
            editable={false}
            placeholder="Se calcula automáticamente"
          />
          <Text style={styles.hint}>Se calcula automáticamente como fecha de inventario + 1 día.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Hora de inicio *</Text>
          <TextInput
            style={styles.input}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="HH:MM"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Hora de finalización *</Text>
          <TextInput
            style={styles.input}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="HH:MM"
          />
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={toggleSecondTimeRange}>
          <Text style={styles.secondaryButtonText}>
            {hasSecondTimeRange ? 'Quitar segundo horario' : 'Añadir segundo horario'}
          </Text>
        </TouchableOpacity>

        {hasSecondTimeRange ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Segunda hora de inicio *</Text>
              <TextInput
                style={styles.input}
                value={secondStartTime}
                onChangeText={setSecondStartTime}
                placeholder="HH:MM"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Segunda hora de finalización *</Text>
              <TextInput
                style={styles.input}
                value={secondEndTime}
                onChangeText={setSecondEndTime}
                placeholder="HH:MM"
              />
            </View>
          </>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Auditor encargado</Text>
          <TextInput
            style={styles.input}
            value={profile?.full_name || ''}
            editable={false}
            placeholder="Usuario logueado"
          />
          <Text style={styles.hint}>Este campo se toma del usuario logueado y no es editable para auditor.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Estado inicial</Text>
          <TextInput style={styles.input} value="draft" editable={false} />
        </View>

        {formError ? <Text style={styles.hint}>{formError}</Text> : null}

        <TouchableOpacity
          disabled={Boolean(formError) || saving}
          style={[styles.primaryButton, (Boolean(formError) || saving) && styles.disabledButton]}
          onPress={handleSave}
        >
          <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar encabezado'}</Text>
        </TouchableOpacity>
      </View>
    </InventoryShell>
  );
}

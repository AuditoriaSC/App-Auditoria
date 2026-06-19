import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { supabase } from '../../../src/supabaseClient';
import { listActiveResponsibles, searchResponsibles } from '../../../src/services/responsiblesService';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type LocalComercial = {
  codigo_interno: string;
  nombre_local: string;
  region: string;
};

type ResponsableOption = {
  id: string;
  codigo: string;
  nombre: string;
  cargo: string | null;
  region: string | null;
};

const visitTypes = ['Sabatina', 'Nocturna'];
const maxVisibleOptions = 6;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateToIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateToTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function NuevaAuditoriaPage() {
  const router = useRouter();

  const now = useMemo(() => new Date(), []);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [locales, setLocales] = useState<LocalComercial[]>([]);
  const [responsables, setResponsables] = useState<ResponsableOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [tipoVisita, setTipoVisita] = useState('');
  const [localQuery, setLocalQuery] = useState('');
  const [localSeleccionado, setLocalSeleccionado] = useState<LocalComercial | null>(null);
  const [responsableQuery, setResponsableQuery] = useState('');
  const [responsableSeleccionado, setResponsableSeleccionado] = useState<ResponsableOption | null>(null);
  const [fechaInicio, setFechaInicio] = useState(dateToIsoDate(now));
  const [horaInicio, setHoraInicio] = useState(dateToTime(now));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [responsableSearchOpen, setResponsableSearchOpen] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar la sesion.');
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role, region')
      .eq('id', user.id)
      .single<ProfileRow>();

    if (profileError || !profileData) {
      setMessage('No se encontro el perfil del auditor.');
      setLoading(false);
      return;
    }

    setProfile(profileData);

    let localQueryBuilder = supabase
      .from('locales')
      .select('codigo_interno, nombre_local, region')
      .order('sort_order', { ascending: true })
      .order('codigo_interno', { ascending: true });

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      localQueryBuilder = localQueryBuilder.eq('region', profileData.region);
    }

    const { data: localData, error: localError } = await localQueryBuilder;

    if (localError) {
      setMessage('No se pudieron cargar los locales: ' + localError.message);
    } else {
      setLocales(localData || []);
    }

    const { data: responsibleData, error: responsibleError } = await listActiveResponsibles(profileData.role, profileData.region);

    if (responsibleError) {
      setMessage('No se pudieron cargar los responsables: ' + responsibleError.message);
    } else {
      setResponsables((responsibleData || []).map(mapResponsibleRow));
    }

    setLoading(false);
  };

  const filteredLocales = useMemo(() => {
    const term = normalize(localQuery);
    const source = term
      ? locales.filter((local) =>
          normalize(`${local.codigo_interno} ${local.nombre_local} ${local.region}`).includes(term),
        )
      : locales;

    return source.slice(0, maxVisibleOptions);
  }, [localQuery, locales]);

  const filteredResponsables = useMemo(() => {
    const term = normalize(responsableQuery);
    const source = term
      ? responsables.filter((responsable) =>
          normalize(`${responsable.codigo} ${responsable.nombre} ${responsable.region || ''}`).includes(term),
        )
      : responsables;

    return source.slice(0, maxVisibleOptions);
  }, [responsableQuery, responsables]);

  const regionVisita = localSeleccionado?.region || (profile?.region === 'Global' ? '' : profile?.region || '');
  const responsableCompleto = responsableSeleccionado
    ? `${responsableSeleccionado.codigo} - ${responsableSeleccionado.nombre}`
    : '';

  const isFormValid =
    Boolean(tipoVisita) &&
    Boolean(localSeleccionado) &&
    Boolean(responsableSeleccionado?.id) &&
    Boolean(fechaInicio.trim()) &&
    Boolean(horaInicio.trim());

  const selectedDate = useMemo(() => {
    const date = new Date(`${fechaInicio}T${horaInicio || '00:00'}:00`);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }, [fechaInicio, horaInicio]);

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (date) setFechaInicio(dateToIsoDate(date));
  };

  const handleTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowTimePicker(false);
    if (date) setHoraInicio(dateToTime(date));
  };

  const handleLocalSearch = (value: string) => {
    setLocalQuery(value);
    setLocalSeleccionado(null);
  };

  const handleResponsableSearch = (value: string) => {
    setResponsableQuery(value);
    setResponsableSeleccionado(null);
  };

  useEffect(() => {
    if (!profile || !responsableSearchOpen) return;

    const timeout = setTimeout(async () => {
      const { data, error } = await searchResponsibles(responsableQuery, profile.role, profile.region);

      if (!error) {
        setResponsables((data || []).map(mapResponsibleRow));
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [profile, responsableQuery, responsableSearchOpen]);

  const selectLocal = (local: LocalComercial) => {
    setLocalSeleccionado(local);
    setLocalQuery(`${local.codigo_interno} · ${local.nombre_local}`);
    setLocalSearchOpen(false);
  };

  const selectResponsable = (responsable: ResponsableOption) => {
    setResponsableSeleccionado(responsable);
    setResponsableQuery(`${responsable.codigo} · ${responsable.nombre}`);
    setResponsableSearchOpen(false);
  };

  const handleCrearVisita = async () => {
    if (!isFormValid) {
      setMessage('Completa tipo de visita, local, responsable, fecha y hora de inicio.');
      return;
    }

    const startDate = new Date(`${fechaInicio}T${horaInicio}:00`);
    if (Number.isNaN(startDate.getTime())) {
      setMessage('Revisa la fecha u hora de inicio.');
      return;
    }

    setIsCreating(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar la sesion.');
      setIsCreating(false);
      return;
    }

    const { data: report, error: reportError } = await supabase
      .from('audit_reports')
      .insert([{
        user_id: user.id,
        local_codigo: localSeleccionado?.codigo_interno,
        region: regionVisita,
        visit_type_id: tipoVisita,
        responsible_id: responsableSeleccionado?.id,
        responsible_code: responsableSeleccionado?.codigo,
        responsible_name_snapshot: responsableSeleccionado?.nombre,
        responsible_name: responsableCompleto,
        local_code_snapshot: localSeleccionado?.codigo_interno,
        local_name_snapshot: localSeleccionado?.nombre_local,
        auditor_name_snapshot: profile?.full_name || 'Auditor',
        auditor_team: profile?.full_name || 'Auditor',
        start_date: fechaInicio,
        start_time: horaInicio,
        status: 'draft',
        created_at: startDate.toISOString(),
      }])
      .select('id')
      .single();

    setIsCreating(false);

    if (reportError || !report) {
      setMessage('No se pudo crear la visita: ' + (reportError?.message || 'sin detalle'));
      return;
    }

    router.push({
      pathname: `/checklist/${report.id}`,
      params: {
        region: regionVisita,
        local_id: localSeleccionado?.codigo_interno || '',
        visit_type_id: tipoVisita,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Preparando nueva visita...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Creacion de visita</Text>
        <Text style={styles.subtitle}>Configura la visita antes de abrir el checklist correspondiente.</Text>
      </View>

      {message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      <FormSection step="1" title="Tipo, fecha y hora">
        <Text style={styles.label}>Tipo de visita</Text>
        <View style={styles.visitTypeSegment}>
          {visitTypes.map((type) => {
            const active = tipoVisita === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.visitTypeButton, active && styles.visitTypeButtonActive]}
                onPress={() => setTipoVisita(type)}
                activeOpacity={0.85}
              >
                <Text style={[styles.visitTypeText, active && styles.visitTypeTextActive]}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.dateTimeGrid}>
          <DateTimeField
            label="Fecha de inicio"
            value={fechaInicio}
            mode="date"
            selectedDate={selectedDate}
            visible={showDatePicker}
            onOpen={() => setShowDatePicker(true)}
            onChange={handleDateChange}
            onWebChange={setFechaInicio}
          />

          <DateTimeField
            label="Hora de inicio"
            value={horaInicio}
            mode="time"
            selectedDate={selectedDate}
            visible={showTimePicker}
            onOpen={() => setShowTimePicker(true)}
            onChange={handleTimeChange}
            onWebChange={setHoraInicio}
          />
        </View>
      </FormSection>

      <FormSection step="2" title="Local">
        <OverlaySelectTrigger
          label="Buscar local por codigo o nombre"
          placeholder="Ej: GM o Malecon"
          value={localQuery}
          onOpen={() => setLocalSearchOpen(true)}
          selected={Boolean(localSeleccionado)}
        />
      </FormSection>

      <FormSection step="3" title="Responsable">
        <OverlaySelectTrigger
          label="Buscar responsable por codigo o nombre"
          placeholder="Ej: L001 o Maria"
          value={responsableQuery}
          onOpen={() => setResponsableSearchOpen(true)}
          selected={Boolean(responsableSeleccionado)}
        />

        <View style={styles.twoColumns}>
          <TextInput
            style={styles.input}
            placeholder="Codigo"
            editable={false}
            value={responsableSeleccionado?.codigo || parseResponsibleDraft(responsableQuery).codigo}
            onChangeText={(value) => {
              const parsed = parseResponsibleDraft(responsableQuery);
              const next = { id: '', codigo: value.toUpperCase(), nombre: parsed.nombre, cargo: null, region: null };
              setResponsableSeleccionado(next.codigo || next.nombre ? next : null);
              setResponsableQuery(`${next.codigo}${next.nombre ? ` · ${next.nombre}` : ''}`);
              setResponsableSearchOpen(false);
            }}
            autoCapitalize="characters"
          />
          <TextInput
            style={styles.input}
            placeholder="Nombre"
            editable={false}
            value={responsableSeleccionado?.nombre || parseResponsibleDraft(responsableQuery).nombre}
            onChangeText={(value) => {
              const parsed = parseResponsibleDraft(responsableQuery);
              const next = { id: '', codigo: parsed.codigo, nombre: value, cargo: null, region: null };
              setResponsableSeleccionado(next.codigo || next.nombre ? next : null);
              setResponsableQuery(`${next.codigo}${next.nombre ? ` · ${next.nombre}` : ''}`);
              setResponsableSearchOpen(false);
            }}
          />
        </View>
      </FormSection>

      <FormSection step="4" title="Confirmacion">
        <View style={styles.confirmCard}>
          <InfoRow label="Tipo de visita" value={tipoVisita || 'Pendiente'} />
          <InfoRow label="Local" value={localSeleccionado?.nombre_local || 'Pendiente'} />
          <InfoRow label="Codigo local" value={localSeleccionado?.codigo_interno || 'Pendiente'} />
          <InfoRow label="Region" value={regionVisita || 'Pendiente'} />
          <InfoRow label="Responsable" value={responsableSeleccionado?.nombre || 'Pendiente'} />
          <InfoRow label="Codigo responsable" value={responsableSeleccionado?.codigo || 'Pendiente'} />
          <InfoRow label="Auditor" value={profile?.full_name || 'Sin auditor'} />
          <InfoRow label="Fecha" value={fechaInicio || 'Pendiente'} />
          <InfoRow label="Hora" value={horaInicio || 'Pendiente'} />
        </View>
      </FormSection>

      <TouchableOpacity
        style={[styles.createButton, (!isFormValid || isCreating) && styles.createButtonDisabled]}
        onPress={handleCrearVisita}
        disabled={!isFormValid || isCreating}
      >
        <Text style={styles.createButtonText}>{isCreating ? 'Creando visita...' : 'Crear visita'}</Text>
      </TouchableOpacity>

      <SearchOverlay
        visible={localSearchOpen}
        title="Seleccionar local"
        searchLabel="Buscar por codigo o nombre"
        placeholder="Ej: GM o Malecon"
        query={localQuery}
        onQueryChange={handleLocalSearch}
        onClose={() => setLocalSearchOpen(false)}
        emptyText="No hay locales que coincidan."
      >
        {filteredLocales.map((local) => (
          <TouchableOpacity key={local.codigo_interno} style={styles.optionCard} onPress={() => selectLocal(local)}>
            <Text style={styles.optionTitle}>{local.codigo_interno} · {local.nombre_local}</Text>
            <Text style={styles.optionMeta}>Region {local.region}</Text>
          </TouchableOpacity>
        ))}
      </SearchOverlay>

      <SearchOverlay
        visible={responsableSearchOpen}
        title="Seleccionar responsable"
        searchLabel="Buscar por codigo o nombre"
        placeholder="Ej: L001 o Maria"
        query={responsableQuery}
        onQueryChange={handleResponsableSearch}
        onClose={() => setResponsableSearchOpen(false)}
        emptyText="No hay responsables activos que coincidan."
      >
        {filteredResponsables.map((responsable) => (
          <TouchableOpacity key={responsable.id} style={styles.optionCard} onPress={() => selectResponsable(responsable)}>
            <Text style={styles.optionTitle}>{responsable.codigo} · {responsable.nombre}</Text>
          </TouchableOpacity>
        ))}
      </SearchOverlay>
    </ScrollView>
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
  if (Platform.OS === 'web') {
    return (
      <View style={styles.dateTimeItem}>
        <Text style={styles.label}>{label}</Text>
        {React.createElement('input', {
          type: mode,
          value,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => onWebChange(event.target.value),
          style: webInputStyle,
        })}
      </View>
    );
  }

  return (
    <View style={styles.dateTimeItem}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.clockButton} onPress={onOpen}>
        <Text style={styles.clockValue}>{value}</Text>
        <Text style={styles.clockHint}>{mode === 'date' ? 'Abrir calendario' : 'Abrir reloj'}</Text>
      </TouchableOpacity>
      {visible && (
        <DateTimePicker
          value={selectedDate}
          mode={mode}
          display={mode === 'date' ? 'calendar' : 'clock'}
          onChange={onChange}
          is24Hour
        />
      )}
    </View>
  );
}

function FormSection({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.stepCircle}>
          <Text style={styles.stepText}>{step}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function OverlaySelectTrigger({
  label,
  placeholder,
  value,
  onOpen,
  selected,
}: {
  label: string;
  placeholder: string;
  value: string;
  onOpen: () => void;
  selected: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={[styles.searchInput, selected && styles.searchInputSelected]} onPress={onOpen}>
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>{value || placeholder}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SearchOverlay({
  visible,
  title,
  searchLabel,
  placeholder,
  query,
  onQueryChange,
  onClose,
  emptyText,
  children,
}: {
  visible: boolean;
  title: string;
  searchLabel: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>{searchLabel}</Text>
          <TextInput
            style={styles.modalSearchInput}
            placeholder={placeholder}
            value={query}
            onChangeText={onQueryChange}
            autoFocus={Platform.OS === 'web'}
          />
          <ScrollView style={styles.modalOptions} keyboardShouldPersistTaps="handled">
            {React.Children.count(children) > 0 ? children : <Text style={styles.emptyText}>{emptyText}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function buildResponsableOptions(rows: { responsible_name: string | null }[]) {
  const seen = new Map<string, Pick<ResponsableOption, 'codigo' | 'nombre'>>();

  for (const row of rows) {
    if (!row.responsible_name) continue;
    const parsed = parseStoredResponsible(row.responsible_name);
    if (!parsed.codigo && !parsed.nombre) continue;
    seen.set(`${parsed.codigo}-${parsed.nombre}`, parsed);
  }

  return Array.from(seen.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function parseStoredResponsible(value: string): Pick<ResponsableOption, 'codigo' | 'nombre'> {
  const parts = value.split(' - ');
  if (parts.length >= 2) {
    return { codigo: parts[0].trim(), nombre: parts.slice(1).join(' - ').trim() };
  }

  return { codigo: 'SIN-CODIGO', nombre: value.trim() };
}

function parseResponsibleDraft(value: string): Pick<ResponsableOption, 'codigo' | 'nombre'> {
  const cleaned = value.replace('·', '-');
  const parts = cleaned.split('-');
  return {
    codigo: (parts[0] || '').trim().toUpperCase(),
    nombre: (parts.slice(1).join('-') || '').trim(),
  };
}

function mapResponsibleRow(row: {
  id: string;
  responsible_code: string;
  responsible_name: string;
  position: string | null;
  region: string | null;
}): ResponsableOption {
  return {
    id: row.id,
    codigo: row.responsible_code,
    nombre: row.responsible_name,
    cargo: row.position,
    region: row.region,
  };
}

const webInputStyle = {
  width: '100%',
  height: 46,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  boxSizing: 'border-box',
  padding: '0 10px',
  fontSize: 14,
  fontWeight: 800,
  color: '#111827',
  backgroundColor: '#fff',
};

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40, backgroundColor: '#f3f6f8', width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 8, color: '#64748b' },
  header: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 18, marginBottom: 14 },
  title: { fontSize: 25, fontWeight: '900', color: '#111827' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 5, lineHeight: 18 },
  messageBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 8, padding: 12, marginBottom: 14 },
  messageText: { color: '#9a3412', fontWeight: '700' },
  section: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ccfbf1', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#0f766e', fontWeight: '900' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  label: { fontSize: 12, fontWeight: '900', color: '#475569', marginBottom: 6 },
  visitTypeSegment: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, padding: 5, backgroundColor: '#f8fafc', marginBottom: 14 },
  visitTypeButton: { flex: 1, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  visitTypeButtonActive: { backgroundColor: '#0f766e' },
  visitTypeText: { color: '#475569', fontWeight: '900' },
  visitTypeTextActive: { color: '#fff' },
  dateTimeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  dateTimeItem: { flex: 1, minWidth: 145 },
  clockButton: { minHeight: 62, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#f8fafc', paddingHorizontal: 12, justifyContent: 'center' },
  clockValue: { fontSize: 19, fontWeight: '900', color: '#111827' },
  clockHint: { fontSize: 11, fontWeight: '700', color: '#0f766e', marginTop: 2 },
  searchInput: { minHeight: 54, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 15, marginBottom: 8 },
  searchInputSelected: { borderColor: '#0f766e', backgroundColor: '#f0fdfa' },
  triggerText: { color: '#111827', fontSize: 15, fontWeight: '800' },
  triggerPlaceholder: { color: '#94a3b8', fontWeight: '700' },
  helperText: { color: '#64748b', fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 4 },
  optionsList: { gap: 8 },
  optionCard: { borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 12, backgroundColor: '#f8fafc' },
  optionTitle: { color: '#111827', fontWeight: '900', fontSize: 14 },
  optionMeta: { color: '#64748b', fontWeight: '700', fontSize: 12, marginTop: 3 },
  emptyText: { color: '#64748b', fontStyle: 'italic', paddingVertical: 8 },
  twoColumns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  input: { flex: 1, minHeight: 52, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 15 },
  confirmCard: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e5edf3', gap: 12 },
  infoLabel: { color: '#64748b', fontSize: 12, fontWeight: '900' },
  infoValue: { flex: 1, textAlign: 'right', color: '#111827', fontWeight: '800' },
  createButton: { minHeight: 54, borderRadius: 8, backgroundColor: '#0f766e', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  createButtonDisabled: { backgroundColor: '#99c9c2', opacity: 0.8 },
  createButtonText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '82%', backgroundColor: '#fff', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#dbe4ea' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  modalCloseButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 7, backgroundColor: '#f1f5f9' },
  modalCloseText: { color: '#334155', fontWeight: '800' },
  modalSearchInput: { minHeight: 54, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 15, marginBottom: 12 },
  modalOptions: { maxHeight: 360 },
});

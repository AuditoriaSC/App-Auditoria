import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';
import { useDashboardBackHandler } from '../../../src/navigation/useDashboardBackHandler';
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
  sort_order?: number | null;
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
  useDashboardBackHandler();
  const goToDashboard = () => router.replace('/dashboard');

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
  const fechaInicio = dateToIsoDate(now);
  const horaInicio = dateToTime(now);
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [responsableSearchOpen, setResponsableSearchOpen] = useState(false);
  const [newLocalOpen, setNewLocalOpen] = useState(false);
  const [newLocalSaving, setNewLocalSaving] = useState(false);
  const [newLocalDraft, setNewLocalDraft] = useState({ codigo_interno: '', nombre_local: '', region: '' });

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
      setMessage(buildMissingProfileMessage(user.email, user.id, profileError?.message));
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
  const canCreateLocal = profile?.role === 'admin' || profile?.role === 'super_admin';
  const responsableCompleto = responsableSeleccionado
    ? `${responsableSeleccionado.codigo} - ${responsableSeleccionado.nombre}`
    : '';

  const isFormValid =
    Boolean(tipoVisita) &&
    Boolean(localSeleccionado) &&
    Boolean(responsableSeleccionado?.id);

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

  const openNewLocalForm = () => {
    const defaultRegion = profile?.role === 'super_admin' || profile?.region === 'Global' ? '' : profile?.region || '';
    setNewLocalDraft({
      codigo_interno: localQuery.trim().toUpperCase(),
      nombre_local: '',
      region: defaultRegion,
    });
    setLocalSearchOpen(false);
    setNewLocalOpen(true);
  };

  const createLocal = async () => {
    if (!profile) return;

    const codigo = newLocalDraft.codigo_interno.trim().toUpperCase();
    const nombre = newLocalDraft.nombre_local.trim();
    const region = newLocalDraft.region.trim();

    if (!codigo || !nombre || !region) {
      setMessage('Completa codigo, nombre y region del nuevo local.');
      return;
    }

    if (profile.role !== 'super_admin' && profile.region !== 'Global' && region !== profile.region) {
      setMessage('Solo puedes crear locales dentro de tu region.');
      return;
    }

    if (locales.some((local) => local.codigo_interno === codigo)) {
      setMessage('Ya existe un local con ese codigo.');
      return;
    }

    setNewLocalSaving(true);
    setMessage(null);

    const local: LocalComercial = { codigo_interno: codigo, nombre_local: nombre, region };
    const { error } = await supabase
      .from('locales')
      .insert([local]);

    if (error) {
      setMessage('No se pudo crear el local. Revisa permisos o si el codigo ya existe.');
      setNewLocalSaving(false);
      return;
    }

    setLocales((current) => [...current, local].sort((left, right) => left.codigo_interno.localeCompare(right.codigo_interno)));
    selectLocal(local);
    setNewLocalOpen(false);
    setNewLocalSaving(false);
    setMessage('Local creado y seleccionado.');
  };

  const selectResponsable = (responsable: ResponsableOption) => {
    setResponsableSeleccionado(responsable);
    setResponsableQuery(`${responsable.codigo} · ${responsable.nombre}`);
    setResponsableSearchOpen(false);
  };

  const handleCrearVisita = async () => {
    if (!isFormValid) {
      setMessage('Completa tipo de visita, local y responsable.');
      return;
    }

    const startDate = new Date();
    const actualStartDate = dateToIsoDate(startDate);
    const actualStartTime = dateToTime(startDate);

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
        start_date: actualStartDate,
        start_time: actualStartTime,
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

    router.replace({
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
        <ActivityIndicator size="large" color={brandColors.greenDark} />
        <Text style={styles.loadingText}>Preparando nueva visita...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Creacion de visita</Text>
            <Text style={styles.subtitle}>Configura la visita antes de abrir el checklist correspondiente.</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={goToDashboard} accessibilityLabel="Volver al Dashboard">
            <Text style={styles.backButtonText}>🏠</Text>
          </TouchableOpacity>
        </View>
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
          <ReadOnlyDateTimeField
            label="Fecha de inicio"
            value={fechaInicio}
          />

          <ReadOnlyDateTimeField
            label="Hora de inicio"
            value={horaInicio}
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
            placeholderTextColor={brandColors.inputPlaceholder}
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
            placeholderTextColor={brandColors.inputPlaceholder}
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
        {canCreateLocal && localQuery.trim().length > 0 && filteredLocales.length === 0 && (
          <TouchableOpacity style={styles.addOptionCard} onPress={openNewLocalForm}>
            <Text style={styles.addOptionTitle}>+ Agregar nuevo local</Text>
            <Text style={styles.optionMeta}>Crear local y seleccionarlo para esta visita</Text>
          </TouchableOpacity>
        )}
      </SearchOverlay>

      <NewLocalModal
        visible={newLocalOpen}
        draft={newLocalDraft}
        canChooseRegion={profile?.role === 'super_admin' || profile?.region === 'Global'}
        saving={newLocalSaving}
        onChange={setNewLocalDraft}
        onClose={() => setNewLocalOpen(false)}
        onSave={createLocal}
      />

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

function ReadOnlyDateTimeField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dateTimeItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.clockButton}>
        <Text style={styles.clockValue}>{value}</Text>
        <Text style={styles.clockHint}>Se registrará automáticamente al iniciar</Text>
      </View>
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

function NewLocalModal({
  visible,
  draft,
  canChooseRegion,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  draft: { codigo_interno: string; nombre_local: string; region: string };
  canChooseRegion: boolean;
  saving: boolean;
  onChange: (value: { codigo_interno: string; nombre_local: string; region: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Agregar nuevo local</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Codigo del local</Text>
          <TextInput
            style={styles.modalSearchInput}
            value={draft.codigo_interno}
            onChangeText={(value) => onChange({ ...draft, codigo_interno: value.toUpperCase() })}
            placeholder="Ej: GM"
            placeholderTextColor={brandColors.inputPlaceholder}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Nombre del local</Text>
          <TextInput
            style={styles.modalSearchInput}
            value={draft.nombre_local}
            onChangeText={(value) => onChange({ ...draft, nombre_local: value })}
            placeholder="Nombre comercial"
            placeholderTextColor={brandColors.inputPlaceholder}
          />

          <Text style={styles.label}>Region</Text>
          {canChooseRegion ? (
            <View style={styles.modalSegment}>
              {['Costa', 'Sierra'].map((region) => {
                const active = draft.region === region;
                return (
                  <TouchableOpacity
                    key={region}
                    style={[styles.modalSegmentButton, active && styles.modalSegmentButtonActive]}
                    onPress={() => onChange({ ...draft, region })}
                  >
                    <Text style={[styles.modalSegmentText, active && styles.modalSegmentTextActive]}>{region}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <TextInput style={styles.modalSearchInput} value={draft.region} editable={false} />
          )}

          <TouchableOpacity style={[styles.createButton, saving && styles.createButtonDisabled]} onPress={onSave} disabled={saving}>
            <Text style={styles.createButtonText}>{saving ? 'Guardando...' : 'Guardar local'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
            placeholderTextColor={brandColors.inputPlaceholder}
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

function buildMissingProfileMessage(email?: string | null, uid?: string, detail?: string) {
  return [
    'No se encontro el perfil del auditor autenticado.',
    `Correo: ${email || 'sin correo'}`,
    `UID Auth: ${uid || 'sin uid'}`,
    detail ? `Detalle: ${detail}` : null,
  ].filter(Boolean).join('\n');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.background },
  container: { padding: 18, paddingBottom: 40, backgroundColor: brandColors.background, width: '100%', maxWidth: 820, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  header: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 18, marginBottom: 14, width: '100%' },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  headerText: { flex: 1, minWidth: 220 },
  title: { fontSize: 25, fontWeight: '900', color: brandColors.textPrimary },
  subtitle: { fontSize: 13, color: brandColors.textSecondary, marginTop: 5, lineHeight: 18 },
  backButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: brandColors.greenDark, backgroundColor: brandColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { fontSize: 20, lineHeight: 24 },
  messageBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, padding: 12, marginBottom: 14 },
  messageText: { color: brandColors.coffeeDark, fontWeight: '700' },
  section: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 18, marginBottom: 14, width: '100%' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: brandColors.greenSoft, borderWidth: 1, borderColor: brandColors.green, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: brandColors.greenDark, fontWeight: '900' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: brandColors.textPrimary },
  label: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 6 },
  visitTypeSegment: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'stretch' },
  visitTypeButton: { flex: 1, flexBasis: 160, minHeight: 42, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.white },
  visitTypeButtonActive: { backgroundColor: brandColors.greenDark, borderColor: brandColors.greenDark },
  visitTypeText: { color: brandColors.textSecondary, fontWeight: '900' },
  visitTypeTextActive: { color: brandColors.white },
  dateTimeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2, alignItems: 'stretch' },
  dateTimeItem: { flex: 1, flexBasis: 240, minWidth: 0 },
  clockButton: { minHeight: 52, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.creamSoft, paddingHorizontal: 12, justifyContent: 'center' },
  clockValue: { fontSize: 19, fontWeight: '900', color: brandColors.textPrimary },
  clockHint: { fontSize: 11, fontWeight: '700', color: brandColors.greenDark, marginTop: 2 },
  searchInput: { minHeight: 52, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontSize: 15, marginBottom: 8, justifyContent: 'center' },
  searchInputSelected: { borderColor: brandColors.greenDark, backgroundColor: brandColors.greenSoft },
  triggerText: { color: brandColors.textPrimary, fontSize: 15, fontWeight: '800' },
  triggerPlaceholder: { color: '#94a3b8', fontWeight: '700' },
  helperText: { color: brandColors.textSecondary, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 4 },
  optionsList: { gap: 8 },
  optionCard: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 12, backgroundColor: brandColors.creamSoft, width: '100%' },
  optionTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 14 },
  optionMeta: { color: brandColors.textSecondary, fontWeight: '700', fontSize: 12, marginTop: 3 },
  addOptionCard: { borderWidth: 1, borderColor: brandColors.green, borderRadius: 8, padding: 12, backgroundColor: brandColors.greenSoft, marginTop: 8, width: '100%' },
  addOptionTitle: { color: brandColors.greenDark, fontWeight: '900', fontSize: 14 },
  emptyText: { color: brandColors.textSecondary, fontStyle: 'italic', paddingVertical: 8 },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  input: { flex: 1, flexBasis: 240, minHeight: 52, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontSize: 15 },
  confirmCard: { backgroundColor: brandColors.creamSoft, borderRadius: 8, padding: 12, width: '100%' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 9, borderTopWidth: 1, borderTopColor: brandColors.border, gap: 12 },
  infoLabel: { color: brandColors.textSecondary, fontSize: 12, fontWeight: '900' },
  infoValue: { flex: 1, textAlign: 'right', color: brandColors.textPrimary, fontWeight: '800' },
  createButton: { minHeight: 54, borderRadius: 8, backgroundColor: brandColors.greenDark, alignItems: 'center', justifyContent: 'center', marginBottom: 20, width: '100%' },
  createButtonDisabled: { backgroundColor: brandColors.green, opacity: 0.8 },
  createButtonText: { color: brandColors.white, fontWeight: '900', fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 600, alignSelf: 'center', maxHeight: '82%', backgroundColor: brandColors.white, borderRadius: 10, padding: 18, borderWidth: 1, borderColor: brandColors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: brandColors.textPrimary },
  modalCloseButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border },
  modalCloseText: { color: brandColors.greenDark, fontWeight: '800' },
  modalSearchInput: { minHeight: 52, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontSize: 15, marginBottom: 12 },
  modalSegment: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, padding: 5, backgroundColor: brandColors.creamSoft, marginBottom: 14 },
  modalSegmentButton: { flex: 1, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalSegmentButtonActive: { backgroundColor: brandColors.greenDark },
  modalSegmentText: { color: brandColors.textSecondary, fontWeight: '900' },
  modalSegmentTextActive: { color: brandColors.white },
  modalOptions: { maxHeight: 360 },
});

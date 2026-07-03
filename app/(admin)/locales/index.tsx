import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type LocalRow = {
  codigo_interno: string;
  nombre_local: string;
  region: string;
  sort_order: number | null;
  created_at: string | null;
};

const regions = ['Costa', 'Sierra'];
const allRegions = ['TODAS', ...regions];

export default function GestionLocalesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('TODAS');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState({ codigo_interno: '', nombre_local: '', region: 'Costa', sort_order: '' });

  useEffect(() => {
    loadData();
  }, []);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isSuperAdmin = profile?.role === 'super_admin' || profile?.region === 'Global';

  const goToDashboard = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };

  const filteredLocales = useMemo(() => {
    const term = normalize(search);
    return locales.filter((local) => {
      const matchesSearch = !term || normalize(`${local.codigo_interno} ${local.nombre_local}`).includes(term);
      const matchesRegion = regionFilter === 'TODAS' || local.region === regionFilter;
      return matchesSearch && matchesRegion;
    });
  }, [locales, regionFilter, search]);

  const loadData = async () => {
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
      setMessage('No se encontro el perfil del usuario.');
      setLoading(false);
      return;
    }

    setProfile(profileData);
    if (profileData.role === 'auditor') {
      setMessage('No tienes permisos para administrar locales.');
      setLoading(false);
      return;
    }

    const defaultRegion = profileData.role === 'super_admin' || profileData.region === 'Global' ? 'Costa' : profileData.region;
    setDraft((current) => ({ ...current, region: defaultRegion }));

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      setRegionFilter(profileData.region);
    }

    let query = supabase
      .from('locales')
      .select('codigo_interno, nombre_local, region, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('codigo_interno', { ascending: true });

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      query = query.eq('region', profileData.region);
    }

    const { data, error } = await query;

    if (error) {
      setMessage('No se pudieron cargar los locales.');
    } else {
      setLocales((data || []) as LocalRow[]);
    }

    setLoading(false);
  };

  const startEdit = (local: LocalRow) => {
    setEditingCode(local.codigo_interno);
    setDraft({
      codigo_interno: local.codigo_interno,
      nombre_local: local.nombre_local,
      region: local.region,
      sort_order: local.sort_order === null || local.sort_order === undefined ? '' : String(local.sort_order),
    });
  };

  const resetDraft = () => {
    const fallbackRegion = isSuperAdmin ? 'Costa' : profile?.region || 'Costa';
    setEditingCode(null);
    setDraft({ codigo_interno: '', nombre_local: '', region: fallbackRegion, sort_order: '' });
  };

  const saveLocal = async () => {
    if (!draft.codigo_interno.trim() || !draft.nombre_local.trim() || !draft.region.trim()) {
      setMessage('Completa codigo, nombre y region.');
      return;
    }

    if (!isSuperAdmin && draft.region !== profile?.region) {
      setMessage('Solo puedes crear o editar locales de tu region.');
      return;
    }

    const sortOrder = draft.sort_order.trim() ? Number(draft.sort_order) : null;
    if (Number.isNaN(sortOrder ?? 0)) {
      setMessage('La posicion debe ser numerica.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      codigo_interno: draft.codigo_interno.trim().toUpperCase(),
      nombre_local: draft.nombre_local.trim(),
      region: draft.region,
      sort_order: editingCode ? sortOrder : null,
    };

    const existing = locales.find((local) => local.codigo_interno === payload.codigo_interno);
    if (!editingCode && existing) {
      setMessage('Ya existe un local con ese codigo.');
      setSaving(false);
      return;
    }

    const result = editingCode
      ? await supabase
          .from('locales')
          .update({
            nombre_local: payload.nombre_local,
            region: payload.region,
            sort_order: payload.sort_order,
          })
          .eq('codigo_interno', editingCode)
      : await supabase
          .from('locales')
          .insert([payload]);

    if (result.error) {
      setMessage('No se pudo guardar el local. Revisa permisos o si el codigo ya existe.');
    } else {
      if (editingCode) {
        setLocales((current) =>
          current
            .map((local) => (local.codigo_interno === editingCode ? { ...local, ...payload } : local))
            .sort(compareLocales),
        );
      } else {
        const nextLocales = applyAlphabeticSortOrder(
          [...locales, { ...payload, created_at: new Date().toISOString() }],
          payload.region,
        );
        const updateError = await persistRegionSortOrder(nextLocales.filter((local) => local.region === payload.region));

        if (updateError) {
          setMessage('Local creado, pero no se pudo reordenar automaticamente por permisos.');
        } else {
          setMessage('Local guardado y ordenado por codigo.');
        }

        setLocales(nextLocales.sort(compareLocales));
      }
      resetDraft();
      if (editingCode) setMessage('Local guardado.');
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando locales...</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{message || 'Acceso no permitido.'}</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Locales</Text>
          <Text style={styles.subtitle}>Administra el catalogo operativo sin borrar registros historicos.</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{editingCode ? 'Editar local' : 'Nuevo local'}</Text>
        <View style={styles.formGrid}>
          <TextInput
            style={styles.formInput}
            value={draft.codigo_interno}
            onChangeText={(value) => setDraft((current) => ({ ...current, codigo_interno: value.toUpperCase() }))}
            placeholder="Codigo"
            placeholderTextColor={brandColors.inputPlaceholder}
            editable={!editingCode}
            autoCapitalize="characters"
          />
          <TextInput
            style={styles.formInput}
            value={draft.nombre_local}
            onChangeText={(value) => setDraft((current) => ({ ...current, nombre_local: value }))}
            placeholder="Nombre del local"
            placeholderTextColor={brandColors.inputPlaceholder}
          />
          <View style={styles.formPickerShell}>
            <Picker
              selectedValue={draft.region}
              onValueChange={(value) => setDraft((current) => ({ ...current, region: String(value) }))}
              enabled={isSuperAdmin}
              style={styles.formPicker}
              dropdownIconColor={brandColors.greenDark}
            >
              {regions.map((region) => (
                <Picker.Item key={region} label={region} value={region} />
              ))}
            </Picker>
          </View>
          <TextInput
            style={styles.formInput}
            value={draft.sort_order}
            onChangeText={(value) => setDraft((current) => ({ ...current, sort_order: value }))}
            placeholder="Posicion"
            placeholderTextColor={brandColors.inputPlaceholder}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.formActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={saveLocal} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar local'}</Text>
          </TouchableOpacity>
          {editingCode && (
            <TouchableOpacity style={styles.secondaryButton} onPress={resetDraft}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterBand}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por codigo o nombre"
          placeholderTextColor="#94a3b8"
        />
        {isSuperAdmin && (
          <View style={styles.filterItem}>
            <Text style={styles.label}>Region</Text>
            <View style={styles.pickerShell}>
              <Picker selectedValue={regionFilter} onValueChange={setRegionFilter} style={styles.picker} dropdownIconColor={brandColors.greenDark}>
                {allRegions.map((region) => (
                  <Picker.Item key={region} label={region === 'TODAS' ? 'Todas' : region} value={region} />
                ))}
              </Picker>
            </View>
          </View>
        )}
      </View>

      {filteredLocales.map((local) => (
        <View key={local.codigo_interno} style={styles.card}>
          <View style={styles.cardText}>
            <Text style={styles.localTitle}>{local.codigo_interno} · {local.nombre_local}</Text>
            <Text style={styles.meta}>{local.region} · Pos. {local.sort_order ?? '-'}</Text>
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => startEdit(local)}>
            <Text style={styles.secondaryButtonText}>Editar</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function applyAlphabeticSortOrder(locales: LocalRow[], region: string) {
  const regionLocales = locales
    .filter((local) => local.region === region)
    .sort((left, right) => left.codigo_interno.localeCompare(right.codigo_interno));

  const sortByCode = new Map(regionLocales.map((local, index) => [local.codigo_interno, index + 1]));

  return locales.map((local) => (
    local.region === region
      ? { ...local, sort_order: sortByCode.get(local.codigo_interno) ?? local.sort_order }
      : local
  ));
}

async function persistRegionSortOrder(locales: LocalRow[]) {
  const results = await Promise.all(
    locales.map((local) =>
      supabase
        .from('locales')
        .update({ sort_order: local.sort_order })
        .eq('codigo_interno', local.codigo_interno),
    ),
  );

  return results.find((result) => result.error)?.error || null;
}

function compareLocales(left: LocalRow, right: LocalRow) {
  return Number(left.sort_order ?? 999999) - Number(right.sort_order ?? 999999)
    || left.codigo_interno.localeCompare(right.codigo_interno);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.greenDark },
  container: { padding: 18, paddingBottom: 36, backgroundColor: brandColors.background, width: '100%', maxWidth: 980, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  errorText: { color: brandColors.danger, fontWeight: '800', marginBottom: 12 },
  header: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 18, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  title: { fontSize: 25, fontWeight: '900', color: brandColors.textPrimary },
  subtitle: { marginTop: 4, color: brandColors.textSecondary, fontWeight: '600', lineHeight: 18 },
  message: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, padding: 12, marginBottom: 14, color: brandColors.coffeeDark, fontWeight: '800' },
  formCard: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 14 },
  formTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 16, marginBottom: 10 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  formActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' },
  filterBand: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 12, marginBottom: 14, gap: 10 },
  filterItem: { minWidth: 170, flexGrow: 1, flexShrink: 0, flexBasis: 170 },
  label: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700', flex: 1, minWidth: 150 },
  formInput: { height: 44, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700', flexGrow: 1, flexShrink: 1, flexBasis: 126, minWidth: 118 },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700' },
  pickerShell: { height: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, backgroundColor: brandColors.creamSoft, justifyContent: 'center', overflow: 'hidden', width: '100%', minWidth: 160 },
  picker: { height: 48, color: brandColors.textPrimary, fontWeight: '700', backgroundColor: brandColors.creamSoft },
  formPickerShell: { height: 46, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, backgroundColor: brandColors.white, justifyContent: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 126, minWidth: 118 },
  formPicker: { height: 46, color: brandColors.textPrimary, fontWeight: '700', backgroundColor: brandColors.white },
  card: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  cardText: { flex: 1 },
  localTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 15 },
  meta: { marginTop: 5, color: brandColors.textSecondary, fontSize: 12, fontWeight: '700' },
  primaryButton: { minHeight: 44, backgroundColor: brandColors.greenDark, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: brandColors.white, fontWeight: '900' },
  secondaryButton: { minHeight: 44, backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: brandColors.textSecondary, fontWeight: '900' },
});


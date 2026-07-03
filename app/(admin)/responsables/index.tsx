import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type ResponsibleRow = {
  id: string;
  responsible_code: string;
  responsible_name: string;
  position: string | null;
  region: string | null;
  is_active: boolean;
  source: string | null;
  last_sync_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CsvResponsible = {
  responsible_code: string;
  responsible_name: string;
  position: string | null;
  region: string | null;
};

type ImportSummary = {
  creados: number;
  actualizados: number;
  inactivados: number;
  sinCambios: number;
  errores: string[];
};

const regions = ['TODAS', 'Costa', 'Sierra'];
const template = 'responsible_code,responsible_name,position,region\nL001,Maria Perez,Lider,Costa\nL002,Juan Mora,Encargado,Sierra\n';

export default function ResponsablesAdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [responsibles, setResponsibles] = useState<ResponsibleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('TODAS');

  useEffect(() => {
    loadData();
  }, []);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isSuperAdmin = profile?.role === 'super_admin' || profile?.region === 'Global';

  const goToDashboard = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard');
  };

  const filteredResponsibles = useMemo(() => {
    const term = normalize(search);
    return responsibles.filter((responsible) => {
      const matchesSearch =
        !term || normalize(`${responsible.responsible_code} ${responsible.responsible_name}`).includes(term);
      const matchesRegion = regionFilter === 'TODAS'
        || responsible.region === regionFilter
        || (!isSuperAdmin && responsible.region === null);
      return matchesSearch && matchesRegion;
    });
  }, [isSuperAdmin, regionFilter, responsibles, search]);

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
      setMessage('No tienes permisos para administrar responsables.');
      setLoading(false);
      return;
    }

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      setRegionFilter(profileData.region);
    }

    let query = supabase
      .from('responsibles')
      .select('id, responsible_code, responsible_name, position, region, is_active, source, last_sync_at, created_at, updated_at')
      .order('responsible_code', { ascending: true });

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      query = query.or(`region.eq.${profileData.region},region.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      setMessage('No se pudieron cargar los responsables.');
    } else {
      setResponsibles((data || []) as ResponsibleRow[]);
    }

    setLoading(false);
  };

  const handleCsvText = async (text: string) => {
    if (!profile) return;
    setImporting(true);
    setMessage(null);
    setSummary(null);

    const parsed = parseResponsibleCsv(text, profile, isSuperAdmin);
    const importSummary: ImportSummary = { creados: 0, actualizados: 0, inactivados: 0, sinCambios: 0, errores: parsed.errores };

    if (parsed.rows.length > 0) {
      const codes = parsed.rows.map((row) => row.responsible_code);
      const { data: existingRows, error: existingError } = await supabase
        .from('responsibles')
        .select('id, responsible_code, responsible_name, position, region, is_active')
        .in('responsible_code', codes);

      if (existingError) {
        setSummary({ ...importSummary, errores: [...importSummary.errores, 'No se pudo validar duplicados existentes.'] });
        setImporting(false);
        return;
      }

      const existingByCode = new Map((existingRows || []).map((row) => [row.responsible_code, row]));
      const now = new Date().toISOString();
      const importedRegions = Array.from(new Set(parsed.rows.map((row) => row.region).filter(Boolean))) as string[];

      for (const row of parsed.rows) {
        const existing = existingByCode.get(row.responsible_code);

        if (existing && !isSuperAdmin && existing.region && existing.region !== profile.region) {
          importSummary.errores.push(`${row.responsible_code}: pertenece a otra region.`);
          continue;
        }

        const payload = {
          responsible_code: row.responsible_code,
          responsible_name: row.responsible_name,
          position: row.position,
          region: row.region,
          is_active: true,
          source: 'csv',
          last_sync_at: now,
          updated_at: now,
        };

        const result = existing
          ? await supabase.from('responsibles').update(payload).eq('id', existing.id)
          : await supabase.from('responsibles').insert([payload]);

        if (result.error) {
          importSummary.errores.push(`${row.responsible_code}: no se pudo guardar.`);
        } else if (!existing) {
          importSummary.creados += 1;
        } else if (isSameResponsible(existing, row)) {
          importSummary.sinCambios += 1;
        } else {
          importSummary.actualizados += 1;
        }
      }

      const targetRegions = isSuperAdmin ? importedRegions : [profile.region];
      if (targetRegions.length > 0) {
        let missingQuery = supabase
          .from('responsibles')
          .select('id')
          .eq('is_active', true)
          .in('region', targetRegions);

        if (codes.length > 0) {
          missingQuery = missingQuery.not('responsible_code', 'in', `(${codes.map((code) => `"${code}"`).join(',')})`);
        }

        const { data: missingRows, error: missingError } = await missingQuery;
        if (missingError) {
          importSummary.errores.push('No se pudo validar responsables ausentes para inactivar.');
        } else {
          const missingIds = (missingRows || []).map((row) => row.id);
          if (missingIds.length > 0) {
            const { error: inactiveError } = await supabase
              .from('responsibles')
              .update({ is_active: false, source: 'csv', last_sync_at: now, updated_at: now })
              .in('id', missingIds);

            if (inactiveError) {
              importSummary.errores.push('No se pudieron inactivar responsables ausentes.');
            } else {
              importSummary.inactivados = missingIds.length;
            }
          }
        }
      }
    }

    setSummary(importSummary);
    setMessage('Importacion procesada.');
    setImporting(false);
    await loadData();
  };

  const toggleResponsible = async (responsible: ResponsibleRow) => {
    const action = responsible.is_active ? 'desactivar' : 'activar';
    const confirmed = typeof window === 'undefined' ? true : window.confirm(`Quieres ${action} este responsable?`);
    if (!confirmed) return;

    setSavingId(responsible.id);
    const { error } = await supabase
      .from('responsibles')
      .update({ is_active: !responsible.is_active, updated_at: new Date().toISOString() })
      .eq('id', responsible.id);

    if (error) {
      setMessage('No se pudo cambiar el estado del responsable.');
    } else {
      setResponsibles((current) =>
        current.map((item) => (item.id === responsible.id ? { ...item, is_active: !responsible.is_active } : item)),
      );
    }
    setSavingId(null);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando responsables...</Text>
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
          <Text style={styles.title}>Responsables</Text>
          <Text style={styles.subtitle}>Catalogo vivo para seleccionar lideres al crear una visita.</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Importar CSV</Text>
        <Text style={styles.helperText}>Columnas: responsible_code, responsible_name, position, region.</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={downloadTemplate}>
            <Text style={styles.secondaryButtonText}>Descargar plantilla</Text>
          </TouchableOpacity>
          <CsvFileInput onText={handleCsvText} disabled={importing} />
        </View>
      </View>

      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen de importacion</Text>
          <Text style={styles.summaryText}>
            Creados: {summary.creados} · Actualizados: {summary.actualizados} · Inactivados: {summary.inactivados} · Sin cambios: {summary.sinCambios} · Errores: {summary.errores.length}
          </Text>
          {summary.errores.map((error, index) => (
            <Text key={`${error}-${index}`} style={styles.errorLine}>{error}</Text>
          ))}
        </View>
      )}

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
                {regions.map((region) => (
                  <Picker.Item key={region} label={region === 'TODAS' ? 'Todas' : region} value={region} />
                ))}
              </Picker>
            </View>
          </View>
        )}
      </View>

      {filteredResponsibles.map((responsible) => (
        <View key={responsible.id} style={[styles.card, !responsible.is_active && styles.disabledCard]}>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{responsible.responsible_code} · {responsible.responsible_name}</Text>
            <Text style={styles.meta}>{responsible.position || 'Sin cargo'} · {responsible.region || 'Sin region'} · {responsible.source || 'manual'}</Text>
          </View>
          <View style={styles.statusColumn}>
            <Text style={styles.statusText}>{responsible.is_active ? 'Activo' : 'Inactivo'}</Text>
            <Switch value={responsible.is_active} onValueChange={() => toggleResponsible(responsible)} disabled={savingId === responsible.id} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function CsvFileInput({ onText, disabled }: { onText: (text: string) => void; disabled: boolean }) {
  if (Platform.OS !== 'web') {
    return (
      <Text style={styles.helperText}>La importacion CSV esta disponible desde la version web.</Text>
    );
  }

  return React.createElement('input', {
    type: 'file',
    accept: '.csv,text/csv',
    disabled,
    onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      onText(await file.text());
      event.target.value = '';
    },
    style: webFileInputStyle,
  });
}

function parseResponsibleCsv(text: string, profile: ProfileRow, isSuperAdmin: boolean) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const errores: string[] = [];
  const rows: CsvResponsible[] = [];
  let omitidos = 0;

  if (lines.length < 2) {
    return { rows, errores: ['El archivo no contiene registros.'], omitidos: 0 };
  }

  const headers = splitCsvLine(lines[0]).map((header) => normalizeHeader(header));
  const required = ['responsible_code', 'responsible_name'];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    return { rows, errores: [`Faltan columnas obligatorias: ${missing.join(', ')}.`], omitidos: 0 };
  }

  const seen = new Set<string>();
  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const row = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]?.trim() || '']));
    const code = String(row.responsible_code || '').toUpperCase();
    const name = String(row.responsible_name || '').trim();
    const region = String(row.region || '').trim() || (isSuperAdmin ? '' : profile.region);

    if (!code || !name) {
      omitidos += 1;
      errores.push(`Fila ${index + 1}: codigo y nombre son obligatorios.`);
      continue;
    }

    if (seen.has(code)) {
      omitidos += 1;
      errores.push(`Fila ${index + 1}: codigo duplicado en el archivo (${code}).`);
      continue;
    }

    if (!region) {
      omitidos += 1;
      errores.push(`Fila ${index + 1}: region obligatoria.`);
      continue;
    }

    if (!isSuperAdmin && region !== profile.region) {
      omitidos += 1;
      errores.push(`Fila ${index + 1}: region fuera de permisos (${region}).`);
      continue;
    }

    seen.add(code);
    rows.push({
      responsible_code: code,
      responsible_name: name,
      position: String(row.position || '').trim() || null,
      region,
    });
  }

  return { rows, errores, omitidos };
}

function isSameResponsible(existing: Partial<ResponsibleRow>, row: CsvResponsible) {
  return (
    String(existing.responsible_name || '').trim() === row.responsible_name &&
    String(existing.position || '').trim() === String(row.position || '').trim() &&
    String(existing.region || '').trim() === String(row.region || '').trim() &&
    existing.is_active === true
  );
}

function splitCsvLine(line: string) {
  const delimiter = line.includes(';') && !line.includes(',') ? ';' : ',';
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"'));
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"'));
  return result;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function downloadTemplate() {
  if (Platform.OS !== 'web') return;
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'responsables_template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

const webFileInputStyle = {
  minHeight: 43,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: 9,
  backgroundColor: brandColors.white,
  fontWeight: 700,
};

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
  formTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 16, marginBottom: 6 },
  helperText: { color: brandColors.textSecondary, fontWeight: '700', lineHeight: 18 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, alignItems: 'center' },
  filterBand: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 12, marginBottom: 14, gap: 10 },
  filterItem: { minWidth: 170, flexGrow: 1, flexShrink: 0, flexBasis: 170 },
  label: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 6 },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700' },
  pickerShell: { height: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, backgroundColor: brandColors.creamSoft, justifyContent: 'center', overflow: 'hidden' },
  picker: { height: 48, color: brandColors.textPrimary, fontWeight: '700', backgroundColor: brandColors.creamSoft },
  summaryCard: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryTitle: { color: brandColors.textPrimary, fontWeight: '900', marginBottom: 4 },
  summaryText: { color: brandColors.textSecondary, fontWeight: '800' },
  errorLine: { color: brandColors.danger, fontWeight: '700', marginTop: 3 },
  card: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  disabledCard: { opacity: 0.62, backgroundColor: brandColors.creamSoft },
  cardText: { flex: 1 },
  cardTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 15 },
  meta: { marginTop: 5, color: brandColors.textSecondary, fontSize: 12, fontWeight: '700' },
  statusColumn: { alignItems: 'center' },
  statusText: { color: brandColors.textSecondary, fontWeight: '900', fontSize: 11 },
  secondaryButton: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  secondaryButtonText: { color: brandColors.textSecondary, fontWeight: '900' },
});


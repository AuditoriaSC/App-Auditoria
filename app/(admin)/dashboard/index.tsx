import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/supabaseClient';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type VisibleStatus = 'EN_PROCESO' | 'FINALIZADA' | 'ENVIADA';

type VisitRow = {
  id: string;
  region: string;
  visit_type_id: string;
  responsible_name: string | null;
  auditor_team: string | null;
  local_codigo: string | null;
  local_code_snapshot: string | null;
  local_name_snapshot: string | null;
  responsible_code: string | null;
  responsible_name_snapshot: string | null;
  auditor_name_snapshot: string | null;
  status: string;
  should_send: boolean | null;
  start_date: string | null;
  start_time: string | null;
  final_grade: number | null;
  final_percentage: number | null;
  created_at: string;
  updated_at: string;
  locales?: { nombre_local: string | null } | { nombre_local: string | null }[] | null;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
};

type AnswerRow = {
  report_id: string;
  value: 'cumple' | 'no_cumple';
};

type SummaryRow = {
  key: string;
  label: string;
  reports: number;
  average: number;
  incidents: number;
};

const visitTypes = ['TODOS', 'Sabatina', 'Nocturna'];
const statusOptions = ['TODOS', 'EN_PROCESO', 'FINALIZADA', 'ENVIADA'];
const regions = ['TODAS', 'Costa', 'Sierra'];

const round = (value: number) => Math.round(value * 100) / 100;

export default function AdminDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [regionFilter, setRegionFilter] = useState('TODAS');
  const [visitTypeFilter, setVisitTypeFilter] = useState('TODOS');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError('No se pudo validar la sesion.');
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role, region')
      .eq('id', user.id)
      .single<ProfileRow>();

    if (profileError || !profileData) {
      setError('No se encontro el perfil del usuario.');
      setLoading(false);
      return;
    }

    setProfile(profileData);
    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      setRegionFilter(profileData.region);
    }

    const { data: visitRows, error: visitsError } = await supabase
      .from('audit_reports')
      .select('id, region, visit_type_id, responsible_name, auditor_team, local_codigo, local_code_snapshot, local_name_snapshot, responsible_code, responsible_name_snapshot, auditor_name_snapshot, status, should_send, start_date, start_time, final_grade, final_percentage, created_at, updated_at, locales(nombre_local), profiles(full_name)')
      .order('start_date', { ascending: false })
      .order('start_time', { ascending: false })
      .order('created_at', { ascending: false });

    if (visitsError) {
      setError(visitsError.message);
      setLoading(false);
      return;
    }

    const ids = (visitRows || []).map((visit) => visit.id);
    let answerRows: AnswerRow[] = [];

    if (ids.length > 0) {
      const { data: answerData, error: answersError } = await supabase
        .from('audit_answers_final')
        .select('report_id, value')
        .in('report_id', ids);

      if (answersError) {
        setError(answersError.message);
        setLoading(false);
        return;
      }

      answerRows = answerData || [];
    }

    setVisits((visitRows || []) as VisitRow[]);
    setAnswers(answerRows);
    setLoading(false);
  };

  const visibleVisits = useMemo(() => {
    const term = normalize(searchQuery);

    return visits.filter((visit) => {
      const permittedRegion =
        profile?.role === 'super_admin' || profile?.region === 'Global'
          ? regionFilter
          : profile?.region || regionFilter;

      const matchesRegion = permittedRegion === 'TODAS' || visit.region === permittedRegion;
      const matchesType = visitTypeFilter === 'TODOS' || visit.visit_type_id === visitTypeFilter;
      const matchesStatus = statusFilter === 'TODOS' || getVisibleStatus(visit) === statusFilter;
      const matchesSearch =
        !term ||
        normalize(`${getLocalName(visit)} ${getLocalCode(visit)} ${getAuditorName(visit)} ${getResponsibleName(visit)}`).includes(term);

      return matchesRegion && matchesType && matchesStatus && matchesSearch;
    });
  }, [profile, regionFilter, searchQuery, statusFilter, visitTypeFilter, visits]);

  const incidentCountByReport = useMemo(() => {
    return answers.reduce<Record<string, number>>((acc, answer) => {
      if (answer.value === 'no_cumple') {
        acc[answer.report_id] = (acc[answer.report_id] || 0) + 1;
      }
      return acc;
    }, {});
  }, [answers]);

  const finalizedVisits = visibleVisits.filter((visit) => getVisibleStatus(visit) !== 'EN_PROCESO');
  const average = finalizedVisits.length > 0
    ? round(finalizedVisits.reduce((total, visit) => total + Number(visit.final_grade || 0), 0) / finalizedVisits.length)
    : 0;
  const totalIncidents = visibleVisits.reduce((total, visit) => total + (incidentCountByReport[visit.id] || 0), 0);

  const byVisitType = useMemo(
    () => buildSummary(visibleVisits, incidentCountByReport, (visit) => visit.visit_type_id),
    [incidentCountByReport, visibleVisits],
  );

  const canDeleteVisits = profile?.role === 'admin' || profile?.role === 'super_admin';

  const handleDeleteVisit = async (visit: VisitRow) => {
    const visibleStatus = getVisibleStatus(visit);
    if (!canDeleteVisits || visibleStatus === 'ENVIADA') return;

    const local = getLocalName(visit);
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Eliminar la visita de ${local}? Esta accion no se puede deshacer.`);

    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from('audit_reports')
      .delete()
      .eq('id', visit.id);

    if (deleteError) {
      alert('No se pudo borrar la visita: ' + deleteError.message);
      return;
    }

    setVisits((current) => current.filter((item) => item.id !== visit.id));
    setAnswers((current) => current.filter((answer) => answer.report_id !== visit.id));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando visitas...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={loadDashboard}>
          <Text style={styles.primaryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.region === 'Global';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.welcome}>Bienvenido, {profile?.full_name || 'Usuario'}</Text>
          <Text style={styles.scope}>{formatRole(profile?.role)} · {getRegionScope(profile)}</Text>
        </View>
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSignOut}>
            <Text style={styles.secondaryButtonText}>Cerrar sesion</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/nueva-auditoria')}>
            <Text style={styles.primaryButtonText}>Nueva visita</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Visitas visibles" value={String(visibleVisits.length)} />
        <SummaryCard label="Finalizadas" value={String(finalizedVisits.length)} />
        <SummaryCard label="Promedio" value={average.toFixed(2)} />
        <SummaryCard label="Incidencias" value={String(totalIncidents)} />
      </View>

      <View style={styles.filterBand}>
        <View style={styles.filterRow}>
          <FilterSelect label="Tipo de visita" value={visitTypeFilter} onChange={setVisitTypeFilter} options={visitTypes} />
          {isSuperAdmin && <FilterSelect label="Estado" value={statusFilter} onChange={setStatusFilter} options={statusOptions} />}
          {isSuperAdmin && <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regions} />}
        </View>
        <View style={styles.searchItem}>
          <Text style={styles.label}>Buscar</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Local, codigo, auditor o responsable"
            placeholderTextColor="#94a3b8"
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Visitas recientes</Text>
        <TouchableOpacity onPress={loadDashboard}>
          <Text style={styles.linkText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      {visibleVisits.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No hay visitas para estos filtros</Text>
          <Text style={styles.emptyText}>Crea una nueva visita o ajusta los filtros para ver resultados.</Text>
        </View>
      ) : (
        visibleVisits.map((visit) => (
          <VisitCard
            key={visit.id}
            visit={visit}
            canDelete={canDeleteVisits && getVisibleStatus(visit) !== 'ENVIADA'}
            onDelete={() => handleDeleteVisit(visit)}
            onPress={() => {
              if (visit.status !== 'finalized') {
                router.push({
                  pathname: `/checklist/${visit.id}`,
                  params: {
                    region: visit.region,
                    local_id: getLocalCode(visit),
                    visit_type_id: visit.visit_type_id,
                  },
                });
              }
            }}
          />
        ))
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Resumen por tipo</Text>
      </View>
      <View style={styles.summaryList}>
        {byVisitType.map((row) => (
          <View key={row.key} style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>{row.label}</Text>
              <Text style={styles.summaryMeta}>{row.reports} visitas</Text>
            </View>
            <View style={styles.summaryNumbers}>
              <Text style={styles.summaryAverage}>{row.average.toFixed(2)}</Text>
              <Text style={styles.summaryIncident}>{row.incidents} inc.</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryCardLabel}>{label}</Text>
      <Text style={styles.summaryCardValue}>{value}</Text>
    </View>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <View style={styles.filterItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerShell}>
        <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
          {options.map((option) => (
            <Picker.Item key={option} label={formatFilterLabel(option)} value={option} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function VisitCard({ visit, canDelete, onDelete, onPress }: { visit: VisitRow; canDelete: boolean; onDelete: () => void; onPress: () => void }) {
  const visibleStatus = getVisibleStatus(visit);
  const hasGrade = visibleStatus !== 'EN_PROCESO' && visit.final_grade !== null && visit.final_grade !== undefined;

  return (
    <TouchableOpacity style={styles.visitCard} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleGroup}>
          <Text style={styles.visitDate}>{formatVisitDateTime(visit)}</Text>
          <Text style={styles.visitTitle}>{getLocalName(visit)}</Text>
          <Text style={styles.visitSubtitle}>{getLocalCode(visit) || 'Sin codigo'} · {visit.visit_type_id}</Text>
        </View>
        <StatusBadge status={visibleStatus} />
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.footerMetric}>{getAuditorName(visit)}</Text>
        <View style={styles.footerActions}>
          <Text style={styles.footerGrade}>{hasGrade ? `Calificacion ${Number(visit.final_grade || 0).toFixed(2)} / 10` : 'Sin calificacion'}</Text>
          {canDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Text style={styles.deleteButtonText}>Borrar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StatusBadge({ status }: { status: VisibleStatus }) {
  return (
    <View style={[styles.badge, status === 'ENVIADA' ? styles.badgeSent : status === 'FINALIZADA' ? styles.badgeFinalized : styles.badgeProcess]}>
      <Text style={[styles.badgeText, status === 'ENVIADA' ? styles.badgeTextSent : status === 'FINALIZADA' ? styles.badgeTextFinalized : styles.badgeTextProcess]}>
        {formatVisibleStatus(status)}
      </Text>
    </View>
  );
}

function buildSummary(
  visits: VisitRow[],
  incidents: Record<string, number>,
  getLabel: (visit: VisitRow) => string,
): SummaryRow[] {
  const groups = new Map<string, { total: number; reports: number; incidents: number; finalized: number }>();

  for (const visit of visits) {
    const label = getLabel(visit);
    const current = groups.get(label) || { total: 0, reports: 0, incidents: 0, finalized: 0 };
    current.reports += 1;
    current.incidents += incidents[visit.id] || 0;
    if (getVisibleStatus(visit) !== 'EN_PROCESO') {
      current.total += Number(visit.final_grade || 0);
      current.finalized += 1;
    }
    groups.set(label, current);
  }

  return Array.from(groups.entries()).map(([label, item]) => ({
    key: label,
    label,
    reports: item.reports,
    average: item.finalized > 0 ? round(item.total / item.finalized) : 0,
    incidents: item.incidents,
  }));
}

function getRelationName<T extends string>(value: Record<T, string | null> | Record<T, string | null>[] | null | undefined, key: T) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.[key] || null;
}

function getVisibleStatus(visit: VisitRow): VisibleStatus {
  if (visit.status !== 'finalized') return 'EN_PROCESO';
  return visit.should_send ? 'ENVIADA' : 'FINALIZADA';
}

function getLocalName(visit: VisitRow) {
  return visit.local_name_snapshot || getRelationName(visit.locales, 'nombre_local') || 'Local sin nombre';
}

function getLocalCode(visit: VisitRow) {
  return visit.local_code_snapshot || visit.local_codigo || '';
}

function getAuditorName(visit: VisitRow) {
  return visit.auditor_name_snapshot || getRelationName(visit.profiles, 'full_name') || visit.auditor_team || 'Auditor no asignado';
}

function getResponsibleName(visit: VisitRow) {
  const name = visit.responsible_name_snapshot || visit.responsible_name || '';
  return visit.responsible_code ? `${visit.responsible_code} ${name}` : name;
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getRegionScope(profile: ProfileRow | null) {
  if (!profile) return 'Sin region';
  if (profile.role === 'super_admin') return 'Todas las regiones';
  return profile.region;
}

function formatRole(role?: string) {
  if (role === 'super_admin') return 'Super admin';
  if (role === 'admin') return 'Admin';
  return 'Auditor';
}

function formatFilterLabel(value: string) {
  if (value === 'TODOS') return 'Todos';
  if (value === 'TODAS') return 'Todas';
  if (value === 'EN_PROCESO') return 'En proceso';
  if (value === 'FINALIZADA') return 'Finalizada';
  if (value === 'ENVIADA') return 'Enviada';
  return value;
}

function formatVisibleStatus(status: VisibleStatus) {
  if (status === 'EN_PROCESO') return 'EN PROCESO';
  if (status === 'FINALIZADA') return 'FINALIZADA';
  return 'ENVIADA';
}

function formatVisitDateTime(visit: VisitRow) {
  if (visit.start_date) {
    return `${formatDateString(visit.start_date)}${visit.start_time ? ` · ${String(visit.start_time).slice(0, 5)}` : ''}`;
  }
  const created = new Date(visit.created_at);
  return `${formatDate(created)} · ${formatTime(created)}`;
}

function formatDateString(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatDate(date: Date) {
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTime(date: Date) {
  if (Number.isNaN(date.getTime())) return 'Sin hora';
  return date.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 36, backgroundColor: '#f3f6f8', width: '100%', maxWidth: 980, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 8, color: '#64748b' },
  errorText: { color: '#b91c1c', fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  hero: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 18, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  heroText: { flex: 1 },
  welcome: { fontSize: 24, fontWeight: '800', color: '#111827' },
  scope: { marginTop: 4, fontSize: 13, color: '#64748b', fontWeight: '600' },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 7, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  secondaryButton: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#334155', fontWeight: '900', fontSize: 14 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  summaryCard: { flexGrow: 1, flexBasis: 150, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 14 },
  summaryCardLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  summaryCardValue: { fontSize: 22, color: '#111827', fontWeight: '900', marginTop: 6 },
  filterBand: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 12, marginBottom: 14, gap: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  filterItem: { minWidth: 150, flex: 1 },
  searchItem: { width: '100%' },
  label: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 6 },
  pickerShell: { height: 42, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, overflow: 'hidden', backgroundColor: '#f8fafc', justifyContent: 'center' },
  picker: { height: 42, color: '#111827', fontWeight: '700', backgroundColor: '#f8fafc' },
  searchInput: { minHeight: 44, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff', color: '#111827', fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 10 },
  sectionTitle: { fontSize: 17, color: '#111827', fontWeight: '900' },
  linkText: { color: '#0f766e', fontWeight: '800' },
  emptyCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 18, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  emptyText: { marginTop: 4, color: '#64748b' },
  visitCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 8, padding: 13, marginBottom: 9 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  cardTitleGroup: { flex: 1 },
  visitDate: { fontSize: 12, color: '#64748b', fontWeight: '800', marginBottom: 3 },
  visitTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  visitSubtitle: { marginTop: 2, fontSize: 12, color: '#64748b', fontWeight: '700' },
  badge: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  badgeProcess: { backgroundColor: '#fef3c7' },
  badgeFinalized: { backgroundColor: '#dbeafe' },
  badgeSent: { backgroundColor: '#dcfce7' },
  badgeText: { fontSize: 11, fontWeight: '900' },
  badgeTextProcess: { color: '#92400e' },
  badgeTextFinalized: { color: '#1d4ed8' },
  badgeTextSent: { color: '#166534' },
  cardFooter: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#edf2f7', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  footerMetric: { flex: 1, color: '#0f172a', fontWeight: '800' },
  footerGrade: { color: '#0f766e', fontWeight: '900' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButton: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  deleteButtonText: { color: '#be123c', fontSize: 12, fontWeight: '900' },
  summaryList: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, paddingHorizontal: 14, marginBottom: 18 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#edf2f7', paddingVertical: 12 },
  summaryLabel: { color: '#111827', fontWeight: '800' },
  summaryMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  summaryNumbers: { alignItems: 'flex-end' },
  summaryAverage: { color: '#0f172a', fontWeight: '900' },
  summaryIncident: { color: '#b91c1c', fontWeight: '800', fontSize: 12, marginTop: 2 },
});

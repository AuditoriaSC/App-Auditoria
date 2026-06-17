import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../../../src/supabaseClient';

type ReportRow = {
  id: string;
  region: string;
  visit_type_id: string;
  responsible_name: string;
  local_codigo: string | null;
  final_grade: number;
  final_percentage: number;
  updated_at: string;
  locales?: {
    nombre_local: string | null;
  } | { nombre_local: string | null }[] | null;
};

type AnswerRow = {
  report_id: string;
  value: 'cumple' | 'no_cumple';
};

type ProfileRow = {
  role: string;
};

type SummaryRow = {
  key: string;
  label: string;
  reports: number;
  average: number;
  incidents: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

export default function AdminDashboard() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState('TODAS');
  const [visitTypeFilter, setVisitTypeFilter] = useState('TODOS');
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
      setError('No se pudo validar la sesión.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single<ProfileRow>();

    if (profileError || !profile) {
      setError('No se encontró el perfil del usuario.');
      setLoading(false);
      return;
    }

    setRole(profile.role);

    const { data: reportRows, error: reportsError } = await supabase
      .from('audit_reports')
      .select('id, region, visit_type_id, responsible_name, local_codigo, final_grade, final_percentage, updated_at, locales(nombre_local)')
      .eq('status', 'finalized')
      .order('updated_at', { ascending: false });

    if (reportsError) {
      setError(reportsError.message);
      setLoading(false);
      return;
    }

    const reportIds = (reportRows || []).map((report) => report.id);
    let answerRows: AnswerRow[] = [];

    if (reportIds.length > 0) {
      const { data: answersData, error: answersError } = await supabase
        .from('audit_answers_final')
        .select('report_id, value')
        .in('report_id', reportIds);

      if (answersError) {
        setError(answersError.message);
        setLoading(false);
        return;
      }

      answerRows = answersData || [];
    }

    setReports((reportRows || []) as ReportRow[]);
    setAnswers(answerRows);
    setLoading(false);
  };

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesRegion = regionFilter === 'TODAS' || report.region === regionFilter;
      const matchesVisitType = visitTypeFilter === 'TODOS' || report.visit_type_id === visitTypeFilter;
      return matchesRegion && matchesVisitType;
    });
  }, [reports, regionFilter, visitTypeFilter]);

  const incidentCountByReport = useMemo(() => {
    return answers.reduce<Record<string, number>>((acc, answer) => {
      if (answer.value === 'no_cumple') {
        acc[answer.report_id] = (acc[answer.report_id] || 0) + 1;
      }

      return acc;
    }, {});
  }, [answers]);

  const globalAverage = useMemo(() => {
    if (filteredReports.length === 0) return 0;
    return round(
      filteredReports.reduce((total, report) => total + Number(report.final_percentage || 0), 0) /
        filteredReports.length,
    );
  }, [filteredReports]);

  const totalIncidents = useMemo(() => {
    return filteredReports.reduce((total, report) => total + (incidentCountByReport[report.id] || 0), 0);
  }, [filteredReports, incidentCountByReport]);

  const byVisitType = useMemo(() => buildSummary(filteredReports, incidentCountByReport, (report) => report.visit_type_id), [filteredReports, incidentCountByReport]);
  const byRegion = useMemo(() => buildSummary(filteredReports, incidentCountByReport, (report) => report.region), [filteredReports, incidentCountByReport]);
  const byLeader = useMemo(() => buildSummary(filteredReports, incidentCountByReport, (report) => report.responsible_name || 'Sin responsable'), [filteredReports, incidentCountByReport]);
  const byLocal = useMemo(() => buildSummary(filteredReports, incidentCountByReport, (report) => getLocalName(report)), [filteredReports, incidentCountByReport]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0070f3" />
        <Text style={styles.loadingText}>Cargando indicadores...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.reloadButton} onPress={loadDashboard}>
          <Text style={styles.reloadButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (role !== 'super_admin') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Dashboard ejecutivo</Text>
        <Text style={styles.mutedText}>Esta vista está disponible para usuarios super_admin.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard ejecutivo</Text>
          <Text style={styles.subtitle}>Resumen de auditorías finalizadas</Text>
        </View>
        <TouchableOpacity style={styles.reloadButton} onPress={loadDashboard}>
          <Text style={styles.reloadButtonText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterItem}>
          <Text style={styles.label}>Región</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={regionFilter} onValueChange={setRegionFilter}>
              <Picker.Item label="Todas" value="TODAS" />
              <Picker.Item label="Costa" value="Costa" />
              <Picker.Item label="Sierra" value="Sierra" />
            </Picker>
          </View>
        </View>

        <View style={styles.filterItem}>
          <Text style={styles.label}>Tipo de visita</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={visitTypeFilter} onValueChange={setVisitTypeFilter}>
              <Picker.Item label="Todos" value="TODOS" />
              <Picker.Item label="Sabatina" value="Sabatina" />
              <Picker.Item label="Nocturna" value="Nocturna" />
            </Picker>
          </View>
        </View>
      </View>

      <View style={styles.kpiGrid}>
        <Kpi label="Auditorías" value={String(filteredReports.length)} />
        <Kpi label="Promedio" value={`${globalAverage}%`} />
        <Kpi label="Incidencias" value={String(totalIncidents)} />
      </View>

      <SummarySection title="Promedio por tipo" rows={byVisitType} />
      <SummarySection title="Promedio por región" rows={byRegion} />
      <SummarySection title="Incidencias por líder" rows={byLeader} sortByIncidents />
      <SummarySection title="Incidencias por local" rows={byLocal} sortByIncidents />
    </ScrollView>
  );
}

function buildSummary(
  reports: ReportRow[],
  incidents: Record<string, number>,
  getLabel: (report: ReportRow) => string,
): SummaryRow[] {
  const groups = new Map<string, { total: number; reports: number; incidents: number }>();

  for (const report of reports) {
    const label = getLabel(report);
    const current = groups.get(label) || { total: 0, reports: 0, incidents: 0 };
    current.total += Number(report.final_percentage || 0);
    current.reports += 1;
    current.incidents += incidents[report.id] || 0;
    groups.set(label, current);
  }

  return Array.from(groups.entries()).map(([label, item]) => ({
    key: label,
    label,
    reports: item.reports,
    average: item.reports > 0 ? round(item.total / item.reports) : 0,
    incidents: item.incidents,
  }));
}

function getLocalName(report: ReportRow) {
  const relatedLocal = Array.isArray(report.locales) ? report.locales[0] : report.locales;
  return relatedLocal?.nombre_local || report.local_codigo || 'Sin local';
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function SummarySection({ title, rows, sortByIncidents = false }: { title: string; rows: SummaryRow[]; sortByIncidents?: boolean }) {
  const sortedRows = [...rows].sort((a, b) => {
    if (sortByIncidents) return b.incidents - a.incidents;
    return b.average - a.average;
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {sortedRows.length === 0 ? (
        <Text style={styles.mutedText}>Sin datos para los filtros seleccionados.</Text>
      ) : (
        sortedRows.map((row) => (
          <View key={row.key} style={styles.summaryRow}>
            <View style={styles.summaryMain}>
              <Text style={styles.summaryLabel}>{row.label}</Text>
              <Text style={styles.summaryMeta}>{row.reports} auditorías</Text>
            </View>
            <View style={styles.summaryNumbers}>
              <Text style={styles.summaryAverage}>{row.average}%</Text>
              <Text style={styles.summaryIncident}>{row.incidents} inc.</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 760, alignSelf: 'center', width: '100%', backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 3 },
  loadingText: { marginTop: 8, color: '#64748b' },
  errorText: { color: '#dc2626', fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  mutedText: { color: '#64748b', fontSize: 13 },
  reloadButton: { backgroundColor: '#0070f3', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 6 },
  reloadButtonText: { color: '#fff', fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  filterItem: { flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 5 },
  pickerContainer: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', overflow: 'hidden' },
  kpiGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  kpiCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 16 },
  kpiLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  kpiValue: { fontSize: 24, color: '#0f172a', fontWeight: 'bold', marginTop: 6 },
  section: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  summaryMain: { flex: 1, paddingRight: 12 },
  summaryLabel: { fontSize: 14, fontWeight: '700', color: '#334155' },
  summaryMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  summaryNumbers: { alignItems: 'flex-end', minWidth: 82 },
  summaryAverage: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  summaryIncident: { fontSize: 12, color: '#dc2626', fontWeight: '700', marginTop: 2 },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type ExportReportRow = {
  id: string;
  region: string | null;
  local_name_snapshot: string | null;
  local_code_snapshot: string | null;
  auditor_name_snapshot: string | null;
  responsible_name_snapshot: string | null;
  start_date: string | null;
  final_grade: number | null;
  status: string | null;
  should_send: boolean | null;
  created_at: string | null;
  locales?: { nombre_local: string | null; codigo_interno: string | null } | { nombre_local: string | null; codigo_interno: string | null }[] | null;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
};

type ExportAnswerRow = {
  report_id: string;
  value: string | null;
  observation: string | null;
  numeric_items: unknown;
  checklist_questions?: {
    question_text: string | null;
    question_type: string | null;
    sort_order: number | null;
    created_at: string | null;
  } | {
    question_text: string | null;
    question_type: string | null;
    sort_order: number | null;
    created_at: string | null;
  }[] | null;
};

type CsvColumn = {
  key: string;
  header: string;
  getValue: (report: ExportReportRow, answers: ExportAnswerRow[]) => string;
};

const resources = [
  {
    title: 'Preguntas',
    description: 'Editar textos, puntajes, posicion y estado del checklist.',
    route: '/preguntas',
  },
  {
    title: 'Locales',
    description: 'Crear y mantener locales por region sin tocar Supabase directo.',
    route: '/locales',
  },
  {
    title: 'Responsables',
    description: 'Importar lideres por CSV y activar o desactivar el catalogo vivo.',
    route: '/responsables',
  },
  {
    title: 'Invitaciones',
    description: 'Crear, cancelar y revisar invitaciones de nuevos usuarios.',
    route: '/invitaciones',
  },
  {
    title: 'Usuarios',
    description: 'Administrar roles, regiones y estado de usuarios existentes.',
    route: '/usuarios',
  },
];

export default function AdministradorRecursosPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar la sesion.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role, region')
      .eq('id', user.id)
      .single<ProfileRow>();

    if (error || !data) {
      setMessage('No se encontro el perfil del usuario.');
    } else {
      setProfile(data);
    }

    setLoading(false);
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const goToDashboard = () => {
    router.replace('/dashboard');
  };

  const exportHistoryCsv = async () => {
    if (!profile) return;
    if (Platform.OS !== 'web') {
      setMessage('La descarga CSV esta disponible desde la version web.');
      return;
    }

    setExporting(true);
    setMessage(null);

    let reportQuery = supabase
      .from('audit_reports')
      .select('id, region, local_name_snapshot, local_code_snapshot, auditor_name_snapshot, responsible_name_snapshot, start_date, final_grade, status, should_send, created_at, locales(nombre_local, codigo_interno), profiles!audit_reports_user_id_fkey(full_name)')
      .eq('status', 'finalized')
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (profile.role === 'admin' && profile.region !== 'Global') {
      reportQuery = reportQuery.eq('region', profile.region);
    }

    const { data: reportsData, error: reportsError } = await reportQuery;
    if (reportsError) {
      setMessage('No se pudo generar el historico de visitas.');
      setExporting(false);
      return;
    }

    const reports = (reportsData || []) as ExportReportRow[];
    if (reports.length === 0) {
      setMessage('No hay visitas para exportar.');
      setExporting(false);
      return;
    }

    const reportIds = reports.map((report) => report.id);
    const { data: answersData, error: answersError } = await supabase
      .from('audit_answers_final')
      .select('report_id, value, observation, numeric_items, checklist_questions(question_text, question_type, sort_order, created_at)')
      .in('report_id', reportIds);

    if (answersError) {
      setMessage('No se pudieron cargar las respuestas del historico.');
      setExporting(false);
      return;
    }

    const answersByReport = ((answersData || []) as ExportAnswerRow[]).reduce<Record<string, ExportAnswerRow[]>>((acc, answer) => {
      if (!acc[answer.report_id]) acc[answer.report_id] = [];
      acc[answer.report_id].push(answer);
      return acc;
    }, {});

    Object.values(answersByReport).forEach((answers) => answers.sort(compareExportAnswers));

    const baseHeaders = [
      'Nombre del Local',
      'Codigo del Local',
      'Nombre del Auditor',
      'Fecha de Visita',
      'Nombre del Responsable',
      'Calificacion Obtenida',
    ];
    const dynamicColumns = buildDynamicColumns(answersByReport);
    const headers = [...baseHeaders, ...dynamicColumns.map((column) => column.header), 'Status de Envio'];

    const rows = reports.map((report) => {
      const answers = answersByReport[report.id] || [];
      const answerColumns = dynamicColumns.map((column) => column.getValue(report, answers));

      return [
        report.local_name_snapshot || getRelationValue(report.locales, 'nombre_local') || '',
        report.local_code_snapshot || getRelationValue(report.locales, 'codigo_interno') || '',
        report.auditor_name_snapshot || getRelationValue(report.profiles, 'full_name') || '',
        report.start_date || formatDateForCsv(report.created_at),
        report.responsible_name_snapshot || '',
        report.final_grade == null ? '' : Number(report.final_grade).toFixed(2),
        ...answerColumns,
        formatSendStatus(report),
      ];
    });

    const csv = toCsv([headers, ...rows]);
    downloadCsv(csv, `historico_visitas_${new Date().toISOString().slice(0, 10)}.csv`);
    setMessage('Historico CSV generado.');
    setExporting(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando recursos...</Text>
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

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.center}>
        <View style={styles.webOnlyCard}>
          <Text style={styles.cardTitle}>Administrador de Recursos</Text>
          <Text style={styles.webOnlyTitle}>Disponible en Web</Text>
          <Text style={styles.cardDescription}>La administración de preguntas, locales, responsables, usuarios, invitaciones y exportaciones se realiza desde la plataforma web.</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
            <Text style={styles.secondaryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Administrador de Recursos</Text>
          <Text style={styles.subtitle}>{profile?.role === 'super_admin' ? 'Todas las regiones' : profile?.region}</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.grid}>
        {resources.map((resource) => (
          <TouchableOpacity
            key={resource.route}
            style={[styles.card, Platform.OS !== 'web' && resource.route === '/invitaciones' && styles.disabledCard]}
            onPress={() => {
              if (Platform.OS !== 'web' && resource.route === '/invitaciones') return;
              router.push(resource.route);
            }}
            activeOpacity={0.84}
          >
            <Text style={styles.cardTitle}>{resource.title}</Text>
            <Text style={styles.cardDescription}>{resource.description}</Text>
            <Text style={styles.cardAction}>{Platform.OS !== 'web' && resource.route === '/invitaciones' ? 'Disponible en web' : 'Abrir'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.exportCard}>
        <Text style={styles.cardTitle}>Exportar historico CSV</Text>
        <Text style={styles.cardDescription}>
          Descarga una fila por visita con preguntas, respuestas, observaciones y estado de envio.
        </Text>
        <TouchableOpacity style={[styles.primaryButton, exporting && styles.disabledButton]} onPress={exportHistoryCsv} disabled={exporting}>
          <Text style={styles.primaryButtonText}>{exporting ? 'Generando...' : 'Descargar CSV'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function getRelationValue<T extends string>(value: Record<T, string | null> | Record<T, string | null>[] | null | undefined, key: T) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.[key] || null;
}

function getQuestionText(answer: ExportAnswerRow) {
  const question = Array.isArray(answer.checklist_questions) ? answer.checklist_questions[0] : answer.checklist_questions;
  return question?.question_text || '';
}

function getQuestionType(answer: ExportAnswerRow) {
  const question = Array.isArray(answer.checklist_questions) ? answer.checklist_questions[0] : answer.checklist_questions;
  return question?.question_type || '';
}

function getQuestionSort(answer: ExportAnswerRow) {
  const question = Array.isArray(answer.checklist_questions) ? answer.checklist_questions[0] : answer.checklist_questions;
  return question?.sort_order ?? 9999;
}

function getQuestionCreatedAt(answer: ExportAnswerRow) {
  const question = Array.isArray(answer.checklist_questions) ? answer.checklist_questions[0] : answer.checklist_questions;
  return question?.created_at || '';
}

function compareExportAnswers(left: ExportAnswerRow, right: ExportAnswerRow) {
  const sortDiff = getQuestionSort(left) - getQuestionSort(right);
  if (sortDiff !== 0) return sortDiff;
  return getQuestionCreatedAt(left).localeCompare(getQuestionCreatedAt(right));
}

function buildDynamicColumns(answersByReport: Record<string, ExportAnswerRow[]>): CsvColumn[] {
  const columns = new Map<string, CsvColumn>();

  Object.values(answersByReport).flat().sort(compareExportAnswers).forEach((answer) => {
    const questionText = getQuestionText(answer) || 'Pregunta';
    const questionKey = normalizeColumnKey(questionText);
    const items = parseNumericItems(answer.numeric_items);

    if (items.length > 0) {
      items.forEach((item, index) => {
        const label = item.label || item.description || item.name || `Item ${index + 1}`;
        const itemKey = `${questionKey}:${normalizeColumnKey(label)}:${index}`;
        addColumn(columns, `${itemKey}:system`, `${label} Sistema`, (_report, answers) => getNumericItemValue(answers, questionText, label, index, 'theoretical'));
        addColumn(columns, `${itemKey}:physical`, `${label} Fisico`, (_report, answers) => getNumericItemValue(answers, questionText, label, index, 'physical'));
        addColumn(columns, `${itemKey}:difference`, `${label} Diferencia`, (_report, answers) => getNumericItemValue(answers, questionText, label, index, 'difference'));
      });

      addColumn(columns, `${questionKey}:observation`, `${questionText} Observacion`, (_report, answers) => findAnswer(answers, questionText)?.observation || '');
      return;
    }

    addColumn(columns, `${questionKey}:answer`, `${questionText} Respuesta`, (_report, answers) => formatAnswerValue(findAnswer(answers, questionText)?.value || null));
    addColumn(columns, `${questionKey}:observation`, `${questionText} Observacion`, (_report, answers) => findAnswer(answers, questionText)?.observation || '');
  });

  return Array.from(columns.values());
}

function addColumn(columns: Map<string, CsvColumn>, key: string, header: string, getValue: CsvColumn['getValue']) {
  if (columns.has(key)) return;
  columns.set(key, { key, header, getValue });
}

function findAnswer(answers: ExportAnswerRow[], questionText: string) {
  return answers.find((answer) => getQuestionText(answer) === questionText);
}

type NumericItem = {
  label?: string;
  description?: string;
  name?: string;
  theoretical?: string | number | null;
  system?: string | number | null;
  physical?: string | number | null;
  difference?: string | number | null;
};

function parseNumericItems(value: unknown): NumericItem[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as NumericItem[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function getNumericItemValue(
  answers: ExportAnswerRow[],
  questionText: string,
  label: string,
  index: number,
  field: 'theoretical' | 'physical' | 'difference',
) {
  const answer = findAnswer(answers, questionText);
  const items = parseNumericItems(answer?.numeric_items);
  const item = items.find((current, currentIndex) => {
    const currentLabel = current.label || current.description || current.name || `Item ${currentIndex + 1}`;
    return currentLabel === label && currentIndex === index;
  }) || items[index];

  if (!item) return '';
  if (field === 'theoretical') return formatCsvNumber(item.theoretical ?? item.system);
  if (field === 'physical') return formatCsvNumber(item.physical);

  const explicitDifference = item.difference;
  if (explicitDifference !== undefined && explicitDifference !== null && explicitDifference !== '') {
    return formatCsvNumber(explicitDifference);
  }

  const theoretical = Number(String(item.theoretical ?? item.system ?? '').replace(',', '.'));
  const physical = Number(String(item.physical ?? '').replace(',', '.'));
  if (!Number.isFinite(theoretical) || !Number.isFinite(physical)) return '';
  return formatCsvNumber(physical - theoretical);
}

function formatCsvNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric)) return String(value);
  return String(Math.round(numeric * 100) / 100);
}

function normalizeColumnKey(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
}

function formatAnswerValue(value: string | null) {
  if (value === 'cumple') return 'Cumple';
  if (value === 'no_cumple') return 'No Cumple';
  if (value === 'no_aplica') return 'No Aplica';
  return value || '';
}

function formatSendStatus(report: ExportReportRow) {
  if (report.status === 'finalized' && report.should_send) return 'Enviada';
  if (report.status === 'resent') return 'Reenviada';
  if (report.status === 'finalized') return 'Finalizada';
  return 'En proceso';
}

function formatDateForCsv(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

function toCsv(rows: string[][]) {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\n')}`;
}

function escapeCsvCell(value: string) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.greenDark },
  container: { padding: 16, paddingBottom: 32, backgroundColor: brandColors.background, width: '100%', maxWidth: 980, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  errorText: { color: brandColors.danger, fontWeight: '800', marginBottom: 12 },
  message: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, padding: 12, marginBottom: 14, color: brandColors.coffeeDark, fontWeight: '800' },
  header: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 16, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  headerText: { flex: 1, minWidth: 220 },
  title: { fontSize: 24, fontWeight: '900', color: brandColors.textPrimary },
  subtitle: { marginTop: 4, color: brandColors.textSecondary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: 230, minWidth: 0, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.white, padding: 14 },
  webOnlyCard: { width: '100%', maxWidth: 460, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.white, padding: 18 },
  webOnlyTitle: { color: brandColors.greenDark, fontWeight: '900', fontSize: 18, marginTop: 8 },
  disabledCard: { opacity: 0.68, backgroundColor: brandColors.creamSoft },
  cardTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 16 },
  cardDescription: { color: brandColors.textSecondary, fontWeight: '700', fontSize: 12, lineHeight: 17, marginTop: 6 },
  cardAction: { color: brandColors.greenDark, fontWeight: '900', marginTop: 12 },
  exportCard: { marginTop: 12, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.white, padding: 14 },
  primaryButton: { alignSelf: 'flex-start', marginTop: 12, backgroundColor: brandColors.greenDark, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: brandColors.white, fontWeight: '900' },
  disabledButton: { opacity: 0.7 },
  secondaryButton: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: brandColors.textSecondary, fontWeight: '900' },
});

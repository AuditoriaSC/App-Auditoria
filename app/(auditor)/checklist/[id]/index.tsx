import { createElement, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import NetInfo from '@react-native-community/netinfo';
import { brandColors } from '../../../../constants/theme';
import { useDashboardBackHandler } from '../../../../src/navigation/useDashboardBackHandler';
import SecureEvidenceImage from '../../../../src/features/audits/components/secure-evidence-image';
import { supabase } from '../../../../src/supabaseClient';
import { offlineStorage } from '../../../../src/offlineStorage';
import { AppNoticeModal } from '../../../../src/components/AppNoticeModal';
import {
  DepositDeclarationRow,
  ProductWriteoffRow,
  calculateDualScore,
  createStableRowId,
  validateDepositDeclarationRow,
  validateProductWriteoffRow,
} from '../../../../src/features/audits/domain/dual-compliance';

type AnswerValue = 'cumple' | 'no_cumple' | null;
type QuestionType = 'compliance' | 'cash_count' | 'pending_deposit' | 'product_writeoff' | 'inventory' | 'cup_count' | 'raw_material_count' | 'follow_up' | 'additional_novelty';

interface CountItem {
  label: string;
  theoreticalValue: string;
  physicalValue: string;
  locked?: boolean;
  unit?: string;
  crossGroup?: string;
  conversionFactor?: number;
}

interface Question {
  id: string;
  question_text: string;
  region: string;
  visit_type_id: string;
  is_active: boolean;
  score_points: number;
  question_type?: QuestionType | null;
  is_scored?: boolean | null;
  requires_observation_on_fail?: boolean | null;
  min_evidence?: number | null;
  max_evidence?: number | null;
  numeric_mode?: string | null;
  item_schema?: { label?: string; name?: string; unit?: string; cross_group?: string; crossGroup?: string; conversion_factor?: number; conversionFactor?: number }[] | null;
  dual_compliance?: boolean | null;
}

interface AnswerState {
  value: AnswerValue;
  observation: string;
  evidenceUrls: string[];
  localImageUris: string[];
  pendingEvidences: PendingEvidence[];
  removedEvidenceUrls: string[];
  uploading: boolean;
  theoreticalValue: string;
  physicalValue: string;
  currentShift: string;
  previousShift: string;
  countItems: CountItem[];
  localCompliance: AnswerValue;
  leaderCompliance: AnswerValue;
  productWriteoffRows: ProductWriteoffRow[];
  depositDeclarationRows: DepositDeclarationRow[];
}

interface DraftAnswerRow {
  report_id: string;
  question_id: string;
  value: AnswerValue;
  observation: string | null;
  evidence_url: string | null;
  evidence_urls: string[];
  numeric_value_theoretical: number | null;
  numeric_value_physical: number | null;
  numeric_value_current: number | null;
  numeric_value_previous: number | null;
  numeric_items: {
    label?: string;
    theoretical?: number | null;
    physical?: number | null;
    unit?: string | null;
    cross_group?: string | null;
    conversion_factor?: number | null;
  }[] | null;
  local_compliance: AnswerValue;
  leader_compliance: AnswerValue;
  detail_rows?: DetailRowPayload[];
}

interface DetailRowPayload {
  id: string;
  row_kind: 'product_writeoff' | 'deposit_declaration';
  sort_order: number;
  lot_date: string | null;
  writeoff_date: string | null;
  description: string | null;
  quantity: number | null;
  record_date: string | null;
  notebook_amount: number | null;
  system_amount: number | null;
  responsible_id: string;
  responsible_code_snapshot: string | null;
  responsible_name_snapshot: string;
}

interface ResponsibleOption {
  id: string;
  responsible_code: string;
  responsible_name: string;
}

interface ReportHeader {
  id: string;
  user_id: string | null;
  visit_type_id: string | null;
  status: string | null;
  should_send: boolean | null;
  resent_count: number | null;
  local_code_snapshot: string | null;
  local_name_snapshot: string | null;
  local_codigo: string | null;
  responsible_name_snapshot: string | null;
  responsible_code: string | null;
  auditor_name_snapshot: string | null;
  auditor_team: string | null;
  locales?: { nombre_local: string | null } | null;
  profiles?: { full_name: string | null } | null;
}

interface ProfileRow {
  id: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string | null;
}

interface PickedImage {
  uri: string;
  base64: string | null;
  mimeType: string;
}

interface PendingEvidence extends PickedImage {
  id: string;
  replaces: string | null;
}

type NoticeState = {
  title: string;
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
} | null;

const emptyAnswer: AnswerState = {
  value: null,
  observation: '',
  evidenceUrls: [],
  localImageUris: [],
  pendingEvidences: [],
  removedEvidenceUrls: [],
  uploading: false,
  theoreticalValue: '',
  physicalValue: '',
  currentShift: '',
  previousShift: '',
  countItems: [],
  localCompliance: null,
  leaderCompliance: null,
  productWriteoffRows: [],
  depositDeclarationRows: [],
};

const appLogo = require('../../../../assets/brand/sweet-coffee-logo.png');

function getQuestionType(question: Question): QuestionType {
  return question.question_type || 'compliance';
}

function getMaxEvidence(question: Question) {
  if (getQuestionType(question) === 'additional_novelty') return 4;
  return question.max_evidence || 2;
}

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasNoveltyContent(answer: AnswerState) {
  return Boolean(answer.observation.trim()) || activeEvidenceCount(answer) > 0;
}

function activeEvidenceCount(answer: AnswerState) {
  return answer.evidenceUrls.filter((reference) => !answer.removedEvidenceUrls.includes(reference)).length
    + answer.localImageUris.length
    + answer.pendingEvidences.length;
}

function isMultiItemCount(type: QuestionType) {
  return type === 'inventory' || type === 'cup_count' || type === 'raw_material_count';
}

function isCountOnlyQuestion(type: QuestionType) {
  return type === 'inventory' || type === 'raw_material_count';
}

function requiresComplianceAnswer(type: QuestionType) {
  return type !== 'additional_novelty' && !isCountOnlyQuestion(type);
}

function isScoredQuestion(question: Question) {
  const type = getQuestionType(question);
  if (question.is_scored === false) return false;
  return !['follow_up', 'additional_novelty', 'inventory', 'raw_material_count'].includes(type);
}

function formatPoints(points: number) {
  return Number(points || 0).toFixed(2);
}

function canEditReport(report: ReportHeader, profile: ProfileRow) {
  if (profile.role === 'admin' || profile.role === 'super_admin' || profile.region === 'Global') return true;
  return report.user_id === profile.id;
}

function base64ToArrayBuffer(base64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const bytes: number[] = [];

  for (let index = 0; index < cleanBase64.length;) {
    const encoded1 = chars.indexOf(cleanBase64.charAt(index++));
    const encoded2 = chars.indexOf(cleanBase64.charAt(index++));
    const encoded3 = chars.indexOf(cleanBase64.charAt(index++));
    const encoded4 = chars.indexOf(cleanBase64.charAt(index++));
    const chr1 = (encoded1 << 2) | (encoded2 >> 4);
    const chr2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    const chr3 = ((encoded3 & 3) << 6) | encoded4;

    bytes.push(chr1);
    if (encoded3 !== 64 && encoded3 !== -1) bytes.push(chr2);
    if (encoded4 !== 64 && encoded4 !== -1) bytes.push(chr3);
  }

  return new Uint8Array(bytes).buffer;
}

function buildInitialCountItems(question: Question): CountItem[] {
  const schema = Array.isArray(question.item_schema) ? question.item_schema : [];
  const items = schema
    .map((item) => ({
      label: item.label || item.name || '',
      unit: item.unit,
      crossGroup: item.cross_group || item.crossGroup,
      conversionFactor: item.conversion_factor ?? item.conversionFactor ?? 1,
    }))
    .filter((item) => item.label)
    .map((item) => ({ ...item, theoreticalValue: '', physicalValue: '', locked: true }));

  return items.length > 0 ? items : [{ label: '', theoreticalValue: '', physicalValue: '', locked: false }];
}

function countItemDifference(item: CountItem) {
  const theoretical = toNumber(item.theoreticalValue);
  const physical = toNumber(item.physicalValue);
  return theoretical !== null && physical !== null ? physical - theoretical : null;
}

function rawMaterialCrossGroups(items: CountItem[]) {
  const groups = new Map<string, { result: number; items: number }>();

  items.forEach((item) => {
    const groupName = item.crossGroup?.trim();
    const difference = countItemDifference(item);

    if (!groupName || difference === null) return;

    const factor = Number.isFinite(Number(item.conversionFactor)) ? Number(item.conversionFactor) : 1;
    const current = groups.get(groupName) || { result: 0, items: 0 };
    groups.set(groupName, {
      result: current.result + difference * factor,
      items: current.items + 1,
    });
  });

  return Array.from(groups.entries())
    .filter(([, group]) => group.items > 1)
    .map(([name, group]) => ({
      name,
      result: group.result,
    }));
}

function answerToDraftRow(reportId: string, question: Question, answer: AnswerState): DraftAnswerRow {
  const type = getQuestionType(question);
  const countItems = answer.countItems.length > 0 ? answer.countItems : buildInitialCountItems(question);
  const numericItems = isMultiItemCount(type)
    ? countItems
        .filter((item) => item.locked || item.label.trim() || item.theoreticalValue.trim() || item.physicalValue.trim())
        .map((item) => ({
          label: item.label.trim(),
          theoretical: toNumber(item.theoreticalValue),
          physical: toNumber(item.physicalValue),
          difference: countItemDifference(item),
          unit: item.unit || null,
          cross_group: item.crossGroup || null,
          conversion_factor: item.conversionFactor ?? 1,
        }))
    : [];
  const firstNumericItem = numericItems[0];

  return {
    report_id: reportId,
    question_id: question.id,
    value: type === 'additional_novelty' || isCountOnlyQuestion(type)
      ? 'cumple'
      : question.dual_compliance
        ? answer.localCompliance
        : answer.value,
    observation: answer.observation.trim(),
    evidence_url: answer.evidenceUrls[0] || null,
    evidence_urls: answer.evidenceUrls,
    numeric_value_theoretical: firstNumericItem?.theoretical ?? toNumber(answer.theoreticalValue),
    numeric_value_physical: firstNumericItem?.physical ?? toNumber(answer.physicalValue),
    numeric_value_current: toNumber(answer.currentShift),
    numeric_value_previous: toNumber(answer.previousShift),
    numeric_items: numericItems,
    local_compliance: question.dual_compliance ? answer.localCompliance : null,
    leader_compliance: question.dual_compliance ? answer.leaderCompliance : null,
    detail_rows: detailRowsFromAnswer(answer),
  };
}

function draftRowToAnswer(question: Question, row: DraftAnswerRow): AnswerState {
  const type = getQuestionType(question);
  const numericItems = Array.isArray(row.numeric_items) ? row.numeric_items : [];
  const countItems = isMultiItemCount(type)
    ? (numericItems.length > 0
        ? numericItems.map((item) => ({
          label: item.label || '',
          theoreticalValue: item.theoretical === null || item.theoretical === undefined ? '' : String(item.theoretical),
          physicalValue: item.physical === null || item.physical === undefined ? '' : String(item.physical),
          unit: item.unit || undefined,
          crossGroup: item.cross_group || undefined,
          conversionFactor: item.conversion_factor ?? 1,
          locked: true,
        }))
        : buildInitialCountItems(question))
    : [];

  return {
    ...emptyAnswer,
    value: row.value,
    localCompliance: row.local_compliance ?? row.value,
    leaderCompliance: row.leader_compliance ?? null,
    observation: row.observation || '',
    evidenceUrls: Array.isArray(row.evidence_urls) && row.evidence_urls.length > 0 ? row.evidence_urls : row.evidence_url ? [row.evidence_url] : [],
    theoreticalValue: row.numeric_value_theoretical === null || row.numeric_value_theoretical === undefined ? '' : String(row.numeric_value_theoretical),
    physicalValue: row.numeric_value_physical === null || row.numeric_value_physical === undefined ? '' : String(row.numeric_value_physical),
    currentShift: row.numeric_value_current === null || row.numeric_value_current === undefined ? '' : String(row.numeric_value_current),
    previousShift: row.numeric_value_previous === null || row.numeric_value_previous === undefined ? '' : String(row.numeric_value_previous),
    countItems,
    productWriteoffRows: [],
    depositDeclarationRows: [],
  };
}

function detailRowsFromAnswer(answer: AnswerState): DetailRowPayload[] {
  const productRows: DetailRowPayload[] = answer.productWriteoffRows.map((row, index) => ({
    id: row.id,
    row_kind: 'product_writeoff',
    sort_order: index,
    lot_date: row.lotDate || null,
    writeoff_date: row.writeoffDate || null,
    description: row.description.trim() || null,
    quantity: toNumber(row.quantity),
    record_date: null,
    notebook_amount: null,
    system_amount: null,
    responsible_id: row.responsibleId,
    responsible_code_snapshot: row.responsibleCode || null,
    responsible_name_snapshot: row.responsibleName,
  }));
  const depositRows: DetailRowPayload[] = answer.depositDeclarationRows.map((row, index) => ({
    id: row.id,
    row_kind: 'deposit_declaration',
    sort_order: index,
    lot_date: null,
    writeoff_date: null,
    description: null,
    quantity: null,
    record_date: row.date || null,
    notebook_amount: toNumber(row.notebookAmount),
    system_amount: toNumber(row.systemAmount),
    responsible_id: row.responsibleId,
    responsible_code_snapshot: row.responsibleCode || null,
    responsible_name_snapshot: row.responsibleName,
  }));
  return [...productRows, ...depositRows];
}

function applyDetailRows(answer: AnswerState, rows: DetailRowPayload[]): AnswerState {
  return {
    ...answer,
    productWriteoffRows: rows
      .filter((row) => row.row_kind === 'product_writeoff')
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((row) => ({
        id: row.id,
        lotDate: row.lot_date || '',
        writeoffDate: row.writeoff_date || '',
        description: row.description || '',
        quantity: row.quantity === null ? '' : String(row.quantity),
        responsibleId: row.responsible_id,
        responsibleCode: row.responsible_code_snapshot || '',
        responsibleName: row.responsible_name_snapshot,
      })),
    depositDeclarationRows: rows
      .filter((row) => row.row_kind === 'deposit_declaration')
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((row) => ({
        id: row.id,
        date: row.record_date || '',
        notebookAmount: row.notebook_amount === null ? '' : String(row.notebook_amount),
        systemAmount: row.system_amount === null ? '' : String(row.system_amount),
        responsibleId: row.responsible_id,
        responsibleCode: row.responsible_code_snapshot || '',
        responsibleName: row.responsible_name_snapshot,
      })),
  };
}

export default function ChecklistDinamicoPage() {
  const router = useRouter();
  const { id: reportId, region, visit_type_id, local_id } = useLocalSearchParams();
  useDashboardBackHandler();
  const goToDashboard = () => router.replace('/modulos/evaluaciones');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(true);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [reportHeader, setReportHeader] = useState<ReportHeader | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editReason, setEditReason] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [finalizedSendChoice, setFinalizedSendChoice] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [responsibleOptions, setResponsibleOptions] = useState<ResponsibleOption[]>([]);
  const [sourceQuestion, setSourceQuestion] = useState<Question | null>(null);
  const [replacementTarget, setReplacementTarget] = useState<string | null>(null);

  const showNotice = (nextNotice: NonNullable<NoticeState>) => setNotice(nextNotice);
  const closeNotice = () => setNotice(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function loadData() {
      if (!region || !visit_type_id) {
        setError('Faltan parametros obligatorios.');
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('No se pudo validar el usuario.');
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, region')
        .eq('id', user.id)
        .single<ProfileRow>();

      if (profileError || !profileData) {
        setError('No se pudo cargar el perfil del usuario.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const [
        { data, error: supabaseError },
        { data: reportData, error: reportError },
        { data: responsibleRows },
      ] = await Promise.all([
        supabase
          .from('checklist_questions')
          .select('*')
          .eq('visit_type_id', visit_type_id)
          .eq('is_active', true)
          .in('region', [String(region), 'Global'])
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('audit_reports')
          .select('id, user_id, visit_type_id, status, should_send, resent_count, local_code_snapshot, local_name_snapshot, local_codigo, responsible_name_snapshot, responsible_code, auditor_name_snapshot, auditor_team, locales(nombre_local), profiles!audit_reports_user_id_fkey(full_name)')
          .eq('id', reportId)
          .single<ReportHeader>(),
        supabase
          .from('responsibles')
          .select('id, responsible_code, responsible_name')
          .eq('is_active', true)
          .order('responsible_name', { ascending: true }),
      ]);
      setResponsibleOptions((responsibleRows || []) as ResponsibleOption[]);

      if (supabaseError) {
        setError('No se pudieron cargar las preguntas. Revisa tu conexión e intenta nuevamente.');
        setLoading(false);
        return;
      }

      if (!reportError && reportData) {
        setReportHeader(reportData);
        if (!canEditReport(reportData, profileData)) {
          setError('No tienes permisos para editar esta visita.');
          setLoading(false);
          return;
        }
      }

      const loadedQuestions = data || [];
      setQuestions(loadedQuestions);

      const initialAnswers: Record<string, AnswerState> = {};
      loadedQuestions.forEach((q: Question) => {
        const type = getQuestionType(q);
        initialAnswers[q.id] = {
          ...emptyAnswer,
          countItems: isMultiItemCount(type) ? buildInitialCountItems(q) : [],
        };
      });

      const isFinalReport = reportData?.status === 'finalized';
      const answerTable = isFinalReport ? 'audit_answers_final' : 'audit_answers_draft';
      const { data: remoteRows, error: draftError } = await supabase
        .from(answerTable)
        .select('report_id, question_id, value, observation, evidence_url, evidence_urls, numeric_value_theoretical, numeric_value_physical, numeric_value_current, numeric_value_previous, numeric_items, local_compliance, leader_compliance')
        .eq('report_id', reportId);

      if (draftError) {
        setSaveWarning('No se pudo cargar el borrador remoto. Se usara el respaldo local si existe.');
      }

      const questionsById = new Map(loadedQuestions.map((question: Question) => [question.id, question]));
      (remoteRows || []).forEach((row) => {
        const question = questionsById.get(row.question_id);
        if (question) initialAnswers[row.question_id] = draftRowToAnswer(question, row as DraftAnswerRow);
      });

      const { data: detailRows, error: detailError } = await supabase
        .from('audit_answer_detail_rows')
        .select('id, question_id, row_kind, sort_order, lot_date, writeoff_date, description, quantity, record_date, notebook_amount, system_amount, responsible_id, responsible_code_snapshot, responsible_name_snapshot')
        .eq('report_id', reportId)
        .not(isFinalReport ? 'final_answer_id' : 'draft_answer_id', 'is', null);

      if (!detailError) {
        const detailsByQuestion = new Map<string, DetailRowPayload[]>();
        (detailRows || []).forEach((row: any) => {
          const current = detailsByQuestion.get(row.question_id) || [];
          current.push(row as DetailRowPayload);
          detailsByQuestion.set(row.question_id, current);
        });
        detailsByQuestion.forEach((rows, questionId) => {
          if (initialAnswers[questionId]) initialAnswers[questionId] = applyDetailRows(initialAnswers[questionId], rows);
        });
      }

      const savedDraft = isFinalReport ? null : await offlineStorage.getDraft(String(reportId));
      setAnswers(savedDraft ? { ...initialAnswers, ...savedDraft } : initialAnswers);
      setLoading(false);
    }

    loadData();
  }, [region, visit_type_id, reportId]);

  const persistRemoteDraft = async (questionId: string, answer: AnswerState) => {
    if (!isOnline) return;
    const question = questions.find((item) => item.id === questionId);
    if (!question || !reportId) return;

    const draftPayload = answerToDraftRow(String(reportId), question, answer);
    const { detail_rows: detailRows = [], ...answerColumns } = draftPayload;
    const { data: savedAnswer, error: upsertError } = await supabase
      .from('audit_answers_draft')
      .upsert(answerColumns, { onConflict: 'report_id,question_id' })
      .select('id')
      .single();

    if (upsertError) {
      setSaveWarning('No se pudo guardar este cambio en Supabase. Se mantiene respaldo local.');
    } else {
      const { error: deleteRowsError } = await supabase
        .from('audit_answer_detail_rows')
        .delete()
        .eq('draft_answer_id', savedAnswer.id);
      if (deleteRowsError) {
        setSaveWarning('La respuesta se guardó, pero no se pudieron actualizar sus líneas.');
        return;
      }
      if (detailRows.length > 0) {
        const { error: insertRowsError } = await supabase
          .from('audit_answer_detail_rows')
          .insert(detailRows.map((row) => ({
            ...row,
            report_id: reportId,
            question_id: questionId,
            draft_answer_id: savedAnswer.id,
            final_answer_id: null,
          })));
        if (insertRowsError) {
          setSaveWarning('La respuesta se guardó, pero no se pudieron actualizar sus líneas.');
          return;
        }
      }
      setSaveWarning(null);
    }
  };

  const updateField = async (questionId: string, fieldsToUpdate: Partial<AnswerState>) => {
    const currentAnswer = { ...emptyAnswer, ...answers[questionId] };
    const nextAnswer = { ...currentAnswer, ...fieldsToUpdate };
    const updatedAnswers = { ...answers, [questionId]: nextAnswer };

    setAnswers(updatedAnswers);
    setHasChanges(true);
    if (reportHeader?.status !== 'finalized') {
      await offlineStorage.saveDraft(String(reportId), updatedAnswers);
      await persistRemoteDraft(questionId, nextAnswer);
    }
  };

  const pickImageFromSource = async (source: 'camera' | 'library'): Promise<PickedImage | null> => {
    if (source === 'camera') {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        showNotice({ title: 'Permiso de cámara requerido', message: 'Habilita el acceso a la cámara desde la configuración del dispositivo para tomar una foto.', variant: 'warning' });
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return null;
      const asset = result.assets[0];
      return { uri: asset.uri, base64: asset.base64 || null, mimeType: asset.mimeType || 'image/jpeg' };
    }

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showNotice({ title: 'Permiso de galería requerido', message: 'Habilita el acceso a tus imágenes desde la configuración del dispositivo para seleccionar una evidencia.', variant: 'warning' });
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0];
    return { uri: asset.uri, base64: asset.base64 || null, mimeType: asset.mimeType || 'image/jpeg' };
  };

  const handlePickImage = async (question: Question, source?: 'camera' | 'library') => {
    const questionId = question.id;
    const currentAnswer = { ...emptyAnswer, ...answers[questionId] };
    const maxEvidence = getMaxEvidence(question);

    if (activeEvidenceCount(currentAnswer) >= maxEvidence && !replacementTarget) {
      showNotice({ title: 'Límite de imágenes alcanzado', message: `Esta pregunta permite hasta ${maxEvidence} imágenes. Retira o reemplaza una evidencia para continuar.`, variant: 'warning' });
      return;
    }

    if (!source) {
      setSourceQuestion(question);
      return;
    }

    const pickedImage = await pickImageFromSource(source);
    if (!pickedImage) return;

    if (!isOnline && reportHeader?.status !== 'finalized') {
      const nextLocalImages = [...currentAnswer.localImageUris, pickedImage.uri].slice(0, maxEvidence);
      await updateField(questionId, { localImageUris: nextLocalImages, uploading: false });
      showNotice({ title: 'Imagen guardada en el borrador', message: 'La imagen se sincronizará cuando recuperes la conexión y guardes la visita.', variant: 'success' });
      return;
    }

    const pending: PendingEvidence = { ...pickedImage, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, replaces: replacementTarget };
    await updateField(questionId, {
      pendingEvidences: [...currentAnswer.pendingEvidences.filter((item) => item.replaces !== replacementTarget || !replacementTarget), pending],
      removedEvidenceUrls: replacementTarget ? Array.from(new Set([...currentAnswer.removedEvidenceUrls, replacementTarget])) : currentAnswer.removedEvidenceUrls,
    });
    setReplacementTarget(null);
    showNotice({ title: replacementTarget ? 'Reemplazo preparado' : 'Imagen preparada', message: 'El cambio se aplicará únicamente cuando guardes la visita.', variant: 'success' });
  };

  const requestReplaceEvidence = (question: Question, reference: string) => showNotice({
    title: '¿Deseas reemplazar esta imagen?',
    message: 'La imagen anterior dejará de mostrarse en esta visita una vez que guardes los cambios.',
    variant: 'warning',
    confirmLabel: 'Reemplazar',
    cancelLabel: 'Cancelar',
    onConfirm: () => { closeNotice(); setReplacementTarget(reference); setSourceQuestion(question); },
  });

  const requestRemoveEvidence = (questionId: string, reference: string) => showNotice({
    title: '¿Deseas eliminar esta imagen?',
    message: 'Esta acción quitará la imagen de la visita. Si ya fue enviada en un informe anterior, se conservará la trazabilidad histórica.',
    variant: 'danger',
    confirmLabel: 'Retirar imagen',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const current = { ...emptyAnswer, ...answers[questionId] };
      updateField(questionId, { removedEvidenceUrls: Array.from(new Set([...current.removedEvidenceUrls, reference])) });
      closeNotice();
    },
  });

  const removePendingEvidence = (questionId: string, pendingId: string) => {
    const current = { ...emptyAnswer, ...answers[questionId] };
    const pending = current.pendingEvidences.find((item) => item.id === pendingId);
    updateField(questionId, {
      pendingEvidences: current.pendingEvidences.filter((item) => item.id !== pendingId),
      removedEvidenceUrls: pending?.replaces ? current.removedEvidenceUrls.filter((reference) => reference !== pending.replaces) : current.removedEvidenceUrls,
    });
  };

  const getValidationMessage = (question: Question, answer: AnswerState) => {
    const type = getQuestionType(question);
    const localValue = question.dual_compliance ? answer.localCompliance : answer.value;
    const observationRequired = localValue === 'no_cumple' && question.requires_observation_on_fail !== false;

    if (type === 'additional_novelty') return null;

    if (type === 'cash_count' && (!answer.theoreticalValue.trim() || !answer.physicalValue.trim())) {
      return 'Completa valor teorico y valor fisico.';
    }

    if (isMultiItemCount(type)) {
      const countItems = answer.countItems.length > 0 ? answer.countItems : buildInitialCountItems(question);
      const usedItems = countItems.filter((item) => item.locked || item.label.trim() || item.theoreticalValue.trim() || item.physicalValue.trim());
      if (usedItems.length === 0) return 'Registra al menos un item con stock teorico y fisico.';
      const incompleteItem = usedItems.find((item) => !item.label.trim() || !item.theoreticalValue.trim() || !item.physicalValue.trim());
      if (incompleteItem) return 'Completa nombre, stock teorico y stock fisico en cada item registrado.';
      if (isCountOnlyQuestion(type)) return null;
    }

    if (question.dual_compliance) {
      if (!answer.localCompliance) return 'Selecciona el cumplimiento del Local.';
      if (!answer.leaderCompliance) return 'Selecciona el cumplimiento del Líder.';
    } else if (!answer.value) {
      return 'Selecciona CUMPLE o NO CUMPLE.';
    }
    if (
      type !== 'follow_up'
      && observationRequired
      && !answer.observation.trim()
      && !(type === 'product_writeoff' && answer.productWriteoffRows.length > 0)
    ) return 'Agrega una observacion para NO CUMPLE.';

    if (type === 'pending_deposit' && (!answer.currentShift.trim() || !answer.previousShift.trim())) {
      return 'Completa turno actual y turno anterior.';
    }

    if (type === 'product_writeoff') {
      const invalidRow = answer.productWriteoffRows.map(validateProductWriteoffRow).find(Boolean);
      if (invalidRow) return invalidRow;
      const hasFailure = answer.localCompliance === 'no_cumple' || answer.leaderCompliance === 'no_cumple';
      if (hasFailure && !answer.observation.trim() && answer.productWriteoffRows.length === 0) {
        return 'Si Local o Líder no cumple, agrega una observación o al menos una línea de baja.';
      }
    }

    if (type === 'pending_deposit') {
      const invalidRow = answer.depositDeclarationRows.map(validateDepositDeclarationRow).find(Boolean);
      if (invalidRow) return invalidRow;
    }

    return null;
  };

  const checkFormValidation = () => {
    if (questions.length === 0) return false;
    return questions.every((q) => !getValidationMessage(q, { ...emptyAnswer, ...answers[q.id] }));
  };

  const calculateScore = (payload: DraftAnswerRow[]) => {
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    return calculateDualScore(payload.flatMap((answer) => {
      const question = questionsById.get(answer.question_id);
      if (!question) return [];
      return [{
        questionId: answer.question_id,
        points: Number(question.score_points || 0),
        isScored: isScoredQuestion(question),
        dualCompliance: question.dual_compliance === true,
        value: answer.value,
        localCompliance: answer.local_compliance,
        leaderCompliance: answer.leader_compliance,
      }];
    }));
  };

  const addProductWriteoffRow = (questionId: string) => {
    const current = { ...emptyAnswer, ...answers[questionId] };
    updateField(questionId, {
      productWriteoffRows: [...current.productWriteoffRows, {
        id: createStableRowId(),
        lotDate: '',
        writeoffDate: '',
        description: '',
        quantity: '',
        responsibleId: '',
        responsibleCode: '',
        responsibleName: '',
      }],
    });
  };

  const updateProductWriteoffRow = (questionId: string, rowId: string, fields: Partial<ProductWriteoffRow>) => {
    const current = { ...emptyAnswer, ...answers[questionId] };
    updateField(questionId, {
      productWriteoffRows: current.productWriteoffRows.map((row) => row.id === rowId ? { ...row, ...fields } : row),
    });
  };

  const addDepositDeclarationRow = (questionId: string) => {
    const current = { ...emptyAnswer, ...answers[questionId] };
    updateField(questionId, {
      depositDeclarationRows: [...current.depositDeclarationRows, {
        id: createStableRowId(),
        date: '',
        notebookAmount: '',
        systemAmount: '',
        responsibleId: '',
        responsibleCode: '',
        responsibleName: '',
      }],
    });
  };

  const updateDepositDeclarationRow = (questionId: string, rowId: string, fields: Partial<DepositDeclarationRow>) => {
    const current = { ...emptyAnswer, ...answers[questionId] };
    updateField(questionId, {
      depositDeclarationRows: current.depositDeclarationRows.map((row) => row.id === rowId ? { ...row, ...fields } : row),
    });
  };

  const requestRemoveDetailRow = (questionId: string, rowId: string, rowKind: 'product_writeoff' | 'deposit_declaration') => {
    showNotice({
      title: '¿Eliminar esta línea?',
      message: 'La línea se retirará de la visita cuando guardes los cambios.',
      variant: 'danger',
      confirmLabel: 'Eliminar línea',
      cancelLabel: 'Cancelar',
      onConfirm: () => {
        const current = { ...emptyAnswer, ...answers[questionId] };
        updateField(questionId, rowKind === 'product_writeoff'
          ? { productWriteoffRows: current.productWriteoffRows.filter((row) => row.id !== rowId) }
          : { depositDeclarationRows: current.depositDeclarationRows.filter((row) => row.id !== rowId) });
        closeNotice();
      },
    });
  };

  const sendUpdatedReport = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finalize-report`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
        Authorization: `Bearer ${sessionData.session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
      },
      body: JSON.stringify({ reportId, region, isResend: true }),
    });

    const sendData = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = sendData && typeof sendData === 'object' && 'error' in sendData ? String(sendData.error) : `HTTP ${response.status}`;
      throw new Error(`Reenvio de correo: ${detail}`);
    }
  };

  const sendFinalizedReport = async () => {
    const { error: sendChoiceError } = await supabase
      .from('audit_reports')
      .update({ should_send: true, updated_at: new Date().toISOString() })
      .eq('id', reportId);
    if (sendChoiceError) throw sendChoiceError;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finalize-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          Authorization: `Bearer ${sessionData.session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
        },
        body: JSON.stringify({ reportId, region, isResend: false }),
      });
      const sendData = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = sendData && typeof sendData === 'object' && 'error' in sendData ? String(sendData.error) : `HTTP ${response.status}`;
        throw new Error(`Envio de correo: ${detail}`);
      }
    } catch (sendError) {
      await supabase.from('audit_reports').update({ should_send: false, updated_at: new Date().toISOString() }).eq('id', reportId);
      throw sendError;
    }
  };

  const handleSubmitFinalEdit = async (payload: DraftAnswerRow[]) => {
    if (!reportHeader || !profile) return;
    const wasSent = reportHeader.should_send === true;
    const wantsInitialSend = !wasSent && finalizedSendChoice === true;
    const reason = editReason.trim();

    if (!wasSent && finalizedSendChoice === null) {
      showNotice({ title: 'Elige cómo guardar la visita', message: 'Selecciona si deseas guardar sin enviar o guardar y enviar el informe.', variant: 'warning' });
      return;
    }

    if (hasChanges && !reason) {
      showNotice({ title: 'Motivo de edición requerido', message: 'Describe brevemente por qué estás modificando esta visita antes de guardar.', variant: 'warning' });
      return;
    }

    if (!hasChanges) {
      if (wantsInitialSend) await sendFinalizedReport();
      router.replace('/modulos/evaluaciones');
      return;
    }

    const { data, error: editError } = await supabase.functions.invoke('manage-report-edit', {
      body: { action: 'submit', reportId, reason, answers: payload, sendAfterApproval: wantsInitialSend },
    });
    if (editError || !data?.ok) throw new Error(data?.error || editError?.message || 'No se pudo procesar la edicion.');

    if (data.pending) {
      showNotice({
        title: 'Cambios enviados para aprobación',
        message: wantsInitialSend
          ? 'El informe se enviará después de que un administrador apruebe el cambio de calificación.'
          : 'El cambio de calificación requiere autorización de un administrador antes de aplicarse.',
        variant: 'info',
        onConfirm: () => router.replace('/modulos/evaluaciones'),
      });

      return;
    }

    if (wasSent && hasChanges && data.shouldResend) {
      await sendUpdatedReport();
      const { error: resendUpdateError } = await supabase
        .from('audit_reports')
        .update({
          last_resent_at: new Date().toISOString(),
          resent_count: Number(data.resentCount ?? reportHeader.resent_count ?? 0) + 1,
          last_resent_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (resendUpdateError) throw resendUpdateError;
    }

    if (wantsInitialSend) await sendFinalizedReport();

    router.replace('/modulos/evaluaciones');
  };

  const prepareEvidenceForSave = async () => {
    const prepared: Record<string, AnswerState> = {};
    const folderRegion = String(region || 'general').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const folderDate = new Date().toISOString().slice(0, 10);

    for (const question of questions) {
      const answer = { ...emptyAnswer, ...answers[question.id] };
      const retained = answer.evidenceUrls.filter((reference) => !answer.removedEvidenceUrls.includes(reference));
      const pending = [
        ...answer.pendingEvidences,
        ...answer.localImageUris.map((uri, index) => ({ id: `local-${index}`, uri, base64: null, mimeType: 'image/jpeg', replaces: null })),
      ];
      const uploaded: string[] = [];

      for (const [index, image] of pending.entries()) {
        const extension = image.mimeType.includes('png') ? 'png' : 'jpg';
        const fileRoute = `${folderRegion}/${folderDate}/${reportId}/${question.id}/evidencia-${Date.now()}-${index}-${image.id}.${extension}`;
        const uploadBody = image.base64
          ? base64ToArrayBuffer(image.base64)
          : await fetch(image.uri).then((response) => {
            if (!response.ok) throw new Error('image-read-failed');
            return response.arrayBuffer();
          });
        const { error: uploadError } = await supabase.storage.from('evidencias').upload(fileRoute, uploadBody, {
          contentType: image.mimeType,
          cacheControl: '3600',
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploaded.push(fileRoute);
      }

      prepared[question.id] = {
        ...answer,
        evidenceUrls: [...retained, ...uploaded].slice(0, getMaxEvidence(question)),
        pendingEvidences: [],
        localImageUris: [],
      };
    }
    return prepared;
  };

  const handleSubmit = async () => {
    if (!checkFormValidation()) return;
    if (reportHeader?.status === 'finalized' && !reportHeader.should_send && finalizedSendChoice === null) {
      showNotice({ title: 'Elige cómo guardar la visita', message: 'Selecciona si deseas guardar sin enviar o guardar y enviar el informe.', variant: 'warning' });
      return;
    }
    if (reportHeader?.status === 'finalized' && hasChanges && !editReason.trim()) {
      showNotice({ title: 'Motivo de edición requerido', message: 'Describe brevemente por qué estás modificando esta visita antes de guardar.', variant: 'warning' });
      return;
    }
    setIsSubmitting(true);

    if (!isOnline) {
      showNotice({ title: 'Borrador guardado', message: 'La visita se sincronizará cuando recuperes la conexión.', variant: 'success', onConfirm: () => router.replace('/modulos/evaluaciones/nueva-auditoria') });
      setIsSubmitting(false);
      return;
    }

    let preparedAnswers = answers;
    try {
      preparedAnswers = await prepareEvidenceForSave();
    } catch {
      showNotice({ title: 'No se pudo cargar la imagen', message: 'Revisa tu conexión e intenta nuevamente. Si el problema continúa, guarda la visita y vuelve a intentarlo.', variant: 'danger' });
      setIsSubmitting(false);
      return;
    }

    const payload = questions.flatMap((q) => {
      const answer = { ...emptyAnswer, ...preparedAnswers[q.id] };
      const type = getQuestionType(q);

      if (type === 'additional_novelty' && !hasNoveltyContent(answer)) {
        return [];
      }

      return [answerToDraftRow(String(reportId), q, answer)];
    });

    try {
      if (reportHeader?.status === 'finalized') {
        await handleSubmitFinalEdit(payload);
        setIsSubmitting(false);
        return;
      }
    } catch (err: any) {
      showNotice({ title: 'No se pudieron guardar los cambios', message: 'Revisa la información ingresada e intenta nuevamente.', variant: 'danger' });
      setIsSubmitting(false);
      return;
    }

    if (payload.length > 0) {
      const answerColumns = payload.map(({ detail_rows: _detailRows, ...row }) => row);
      const { data: savedAnswers, error: insertError } = await supabase
        .from('audit_answers_draft')
        .upsert(answerColumns, { onConflict: 'report_id,question_id' })
        .select('id, question_id');

      if (insertError) {
        showNotice({ title: 'No se pudo guardar la visita', message: 'Verifica tu conexión e intenta nuevamente. Tus datos permanecerán en el borrador.', variant: 'danger' });
        setIsSubmitting(false);
        return;
      }

      for (const savedAnswer of savedAnswers || []) {
        const answerPayload = payload.find((item) => item.question_id === savedAnswer.question_id);
        const rows = answerPayload?.detail_rows || [];
        const { error: deleteRowsError } = await supabase
          .from('audit_answer_detail_rows')
          .delete()
          .eq('draft_answer_id', savedAnswer.id);
        if (deleteRowsError) {
          showNotice({ title: 'No se pudieron guardar las líneas', message: 'La respuesta principal se guardó, pero sus líneas dinámicas no. Intenta nuevamente.', variant: 'danger' });
          setIsSubmitting(false);
          return;
        }
        if (rows.length > 0) {
          const { error: insertRowsError } = await supabase
            .from('audit_answer_detail_rows')
            .insert(rows.map((row) => ({
              ...row,
              report_id: reportId,
              question_id: savedAnswer.question_id,
              draft_answer_id: savedAnswer.id,
              final_answer_id: null,
            })));
          if (insertRowsError) {
            showNotice({ title: 'No se pudieron guardar las líneas', message: 'Revisa los datos ingresados e intenta nuevamente.', variant: 'danger' });
            setIsSubmitting(false);
            return;
          }
        }
      }
    }

    await offlineStorage.clearDraft(String(reportId));
    router.replace({
      pathname: `/modulos/evaluaciones/conclusiones/${reportId}`,
      params: { region },
    });
    setIsSubmitting(false);
  };

  const isFormValid = useMemo(checkFormValidation, [questions, answers]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={brandColors.greenDark} /><Text style={styles.loadingText}>Cargando datos...</Text></View>;
  }

  if (error) {
    return <View style={styles.center}><Text style={styles.errorText}>No se pudo abrir la visita.</Text><Text style={styles.loadingText}>{error}</Text></View>;
  }

  const headerVisitType = reportHeader?.visit_type_id || String(visit_type_id || 'visita');
  const headerLocalCode = reportHeader?.local_code_snapshot || reportHeader?.local_codigo || String(local_id || '');
  const headerLocalName = reportHeader?.local_name_snapshot || reportHeader?.locales?.nombre_local || 'Local';
  const headerResponsible = reportHeader?.responsible_name_snapshot || 'Responsable pendiente';
  const headerAuditor = reportHeader?.auditor_name_snapshot || reportHeader?.auditor_team || reportHeader?.profiles?.full_name || 'Auditor';
  const isFinalEdit = reportHeader?.status === 'finalized';
  const isSentEdit = isFinalEdit && reportHeader?.should_send === true;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.networkBanner, isOnline ? styles.bannerOnline : styles.bannerOffline]}>
        <Text style={styles.bannerText}>
          {isOnline ? 'Conectado a Internet' : 'Sin conexion: modo borrador offline'}
        </Text>
      </View>
      {saveWarning && (
        <View style={styles.saveWarning}>
          <Text style={styles.saveWarningText}>{saveWarning}</Text>
        </View>
      )}

      <View style={styles.headerCard}>
        <Image source={appLogo} style={styles.headerLogo} resizeMode="contain" />
        <View style={styles.headerTextBlock}>
          <Text style={styles.title}>Checklist visita {headerVisitType}</Text>
          <Text style={styles.headerMeta}>Local: {headerLocalCode ? `${headerLocalCode} · ` : ''}{headerLocalName}</Text>
          <Text style={styles.headerMeta}>Líder/responsable: {headerResponsible}</Text>
          <Text style={styles.headerMeta}>Auditor: {headerAuditor}</Text>
        </View>
        <TouchableOpacity style={styles.backButton} onPress={goToDashboard} accessibilityLabel="Volver al Dashboard">
          <Text style={styles.backButtonText}>⌂</Text>
        </TouchableOpacity>
      </View>

      {isFinalEdit && (
        <View style={styles.editNotice}>
          <Text style={styles.editNoticeTitle}>{isSentEdit ? 'Editando visita enviada' : 'Editando visita finalizada'}</Text>
          <Text style={styles.editNoticeText}>
            {isSentEdit ? 'Los cambios recalcularan la calificacion y reenviaran el informe actualizado.' : 'Puedes guardar la visita sin enviarla o enviar el informe antes de salir.'}
          </Text>
          {hasChanges && (
            <TextInput
              style={styles.editReasonInput}
              value={editReason}
              onChangeText={setEditReason}
              multiline
              placeholder="Motivo de edicion requerido"
              placeholderTextColor={brandColors.inputPlaceholder}
            />
          )}
          {!isSentEdit && (
            <View style={styles.finalizedSendSection}>
              <Text style={styles.fieldLabel}>Antes de salir, elige qué hacer con el informe</Text>
              <View style={styles.finalizedSendActions}>
                <TouchableOpacity
                  style={[styles.finalizedSendButton, finalizedSendChoice === false && styles.finalizedSendButtonActive]}
                  onPress={() => setFinalizedSendChoice(false)}
                >
                  <Text style={[styles.finalizedSendButtonText, finalizedSendChoice === false && styles.finalizedSendButtonTextActive]}>Guardar sin enviar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.finalizedSendButton, finalizedSendChoice === true && styles.finalizedSendButtonActive]}
                  onPress={() => setFinalizedSendChoice(true)}
                >
                  <Text style={[styles.finalizedSendButtonText, finalizedSendChoice === true && styles.finalizedSendButtonTextActive]}>Guardar y enviar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {questions.map((q, index) => {
        const currentAnswer = { ...emptyAnswer, ...answers[q.id] };
        const type = getQuestionType(q);
        const maxEvidence = getMaxEvidence(q);
        const evidenceCount = activeEvidenceCount(currentAnswer);
        const difference = toNumber(currentAnswer.physicalValue) !== null && toNumber(currentAnswer.theoreticalValue) !== null
          ? Number(toNumber(currentAnswer.physicalValue)) - Number(toNumber(currentAnswer.theoreticalValue))
          : null;
        const validationMessage = getValidationMessage(q, currentAnswer);

        return (
          <View key={q.id} style={styles.card}>
            <View style={styles.questionHeader}>
              <Text style={styles.questionText}>{index + 1}. {q.question_text}</Text>
              {isScoredQuestion(q) && (
                <View style={styles.pointsBadge}>
                  <Text style={styles.pointsBadgeText}>{formatPoints(q.score_points)} pts</Text>
                </View>
              )}
            </View>

            {requiresComplianceAnswer(type) && q.dual_compliance && (
              <View style={styles.dualComplianceGrid}>
                <ComplianceSelector
                  label="Local"
                  value={currentAnswer.localCompliance}
                  onChange={(value) => updateField(q.id, { localCompliance: value })}
                />
                <ComplianceSelector
                  label="Líder"
                  value={currentAnswer.leaderCompliance}
                  onChange={(value) => updateField(q.id, { leaderCompliance: value })}
                />
              </View>
            )}

            {requiresComplianceAnswer(type) && !q.dual_compliance && (
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[styles.radioButton, currentAnswer.value === 'cumple' && styles.radioActiveCumple]}
                  onPress={() => updateField(q.id, { value: 'cumple' })}
                >
                  <Text style={[styles.radioText, currentAnswer.value === 'cumple' && styles.textWhite]}>CUMPLE</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioButton, currentAnswer.value === 'no_cumple' && styles.radioActiveNoCumple]}
                  onPress={() => updateField(q.id, { value: 'no_cumple' })}
                >
                  <Text style={[styles.radioText, currentAnswer.value === 'no_cumple' && styles.textWhite]}>NO CUMPLE</Text>
                </TouchableOpacity>
              </View>
            )}

            {type !== 'follow_up' && (
              <>
                <Text style={styles.fieldLabel}>
                  {type === 'additional_novelty' ? 'Novedad adicional opcional' : 'Observaciones encontradas'}
                </Text>
                <TextInput
                  style={styles.textArea}
                  multiline
                  numberOfLines={3}
                  placeholderTextColor={brandColors.inputPlaceholder}
                  placeholder={currentAnswer.value === 'no_cumple' ? 'Describe el hallazgo detectado...' : 'Observacion opcional...'}
                  value={currentAnswer.observation}
                  onChangeText={(text) => updateField(q.id, { observation: text })}
                />
              </>
            )}

            {type === 'cash_count' && (
              <View style={styles.numericGrid}>
                <NumberField
                  label="Valor teorico"
                  value={currentAnswer.theoreticalValue}
                  onChangeText={(text) => updateField(q.id, { theoreticalValue: text })}
                />
                <NumberField
                  label="Valor fisico contado"
                  value={currentAnswer.physicalValue}
                  onChangeText={(text) => updateField(q.id, { physicalValue: text })}
                />
                <Text style={[styles.differenceText, difference !== null && difference < 0 && styles.negativeDifferenceText]}>
                  Diferencia: {difference === null ? 'Pendiente' : difference.toFixed(2)}
                </Text>
              </View>
            )}

            {isMultiItemCount(type) && (
              <CountItemsEditor
                title={type === 'cup_count' ? 'Conteo de vasos' : type === 'raw_material_count' ? 'Conteo de materias primas' : 'Conteo de inventario'}
                items={currentAnswer.countItems.length > 0 ? currentAnswer.countItems : buildInitialCountItems(q)}
                onChange={(items) => updateField(q.id, { countItems: items })}
                showCrossSummary={type === 'raw_material_count'}
              />
            )}

            {type === 'pending_deposit' && (
              <>
                <View style={styles.numericGrid}>
                  <NumberField label="Turno actual" value={currentAnswer.currentShift} onChangeText={(text) => updateField(q.id, { currentShift: text })} />
                  <NumberField label="Turno anterior" value={currentAnswer.previousShift} onChangeText={(text) => updateField(q.id, { previousShift: text })} />
                </View>
                <DepositDeclarationTable
                  rows={currentAnswer.depositDeclarationRows}
                  responsibles={responsibleOptions}
                  onAdd={() => addDepositDeclarationRow(q.id)}
                  onChange={(rowId, fields) => updateDepositDeclarationRow(q.id, rowId, fields)}
                  onRemove={(rowId) => requestRemoveDetailRow(q.id, rowId, 'deposit_declaration')}
                />
              </>
            )}

            {type === 'product_writeoff' && (
              <ProductWriteoffTable
                rows={currentAnswer.productWriteoffRows}
                responsibles={responsibleOptions}
                onAdd={() => addProductWriteoffRow(q.id)}
                onChange={(rowId, fields) => updateProductWriteoffRow(q.id, rowId, fields)}
                onRemove={(rowId) => requestRemoveDetailRow(q.id, rowId, 'product_writeoff')}
              />
            )}

            <View style={styles.evidenceHeader}>
              <Text style={styles.fieldLabel}>Evidencias opcionales</Text>
              <Text style={styles.evidenceCounter}>{evidenceCount}/{maxEvidence}</Text>
            </View>

            <View style={styles.imageGrid}>
              {currentAnswer.evidenceUrls.map((uri) => {
                const removed = currentAnswer.removedEvidenceUrls.includes(uri);
                const replaced = currentAnswer.pendingEvidences.some((item) => item.replaces === uri);
                return (
                  <View key={`${q.id}-${uri}`} style={[styles.evidenceCard, removed && styles.evidenceCardRemoved]}>
                    <SecureEvidenceImage reference={uri} />
                    <Text style={[styles.evidenceStatus, removed && styles.evidenceStatusRemoved]}>{replaced ? 'Imagen anterior' : removed ? 'Eliminación pendiente' : 'Imagen actual'}</Text>
                    {!removed ? <View style={styles.evidenceActions}>
                      <TouchableOpacity onPress={() => requestReplaceEvidence(q, uri)}><Text style={styles.evidenceActionText}>Reemplazar</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => requestRemoveEvidence(q.id, uri)}><Text style={styles.evidenceRemoveText}>Eliminar</Text></TouchableOpacity>
                    </View> : null}
                  </View>
                );
              })}
              {currentAnswer.pendingEvidences.map((item) => (
                <View key={item.id} style={[styles.evidenceCard, styles.evidenceCardPending]}>
                  <Image source={{ uri: item.uri }} style={styles.imagePreview} />
                  <Text style={styles.evidenceStatus}>Imagen nueva pendiente</Text>
                  <TouchableOpacity onPress={() => removePendingEvidence(q.id, item.id)}><Text style={styles.evidenceRemoveText}>Descartar</Text></TouchableOpacity>
                </View>
              ))}
              {currentAnswer.localImageUris.map((uri, imageIndex) => <Image key={`${uri}-${imageIndex}`} source={{ uri }} style={styles.imagePreview} />)}
              {evidenceCount < maxEvidence && (
                <TouchableOpacity style={styles.photoButton} onPress={() => handlePickImage(q)} disabled={currentAnswer.uploading}>
                  {currentAnswer.uploading ? <ActivityIndicator size="small" color="#0f766e" /> : <Text style={styles.photoButtonText}>+ Imagen</Text>}
                </TouchableOpacity>
              )}
            </View>

            {validationMessage && <Text style={styles.validationText}>{validationMessage}</Text>}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.submitButton, (!isFormValid || isSubmitting) && styles.disabledButton]}
        onPress={handleSubmit}
        disabled={!isFormValid || isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting
            ? 'Procesando...'
            : isFinalEdit
              ? isSentEdit
                ? 'Guardar cambios y reenviar'
                : finalizedSendChoice === true
                  ? 'Guardar y enviar informe'
                  : 'Guardar sin enviar'
              : isOnline
                ? 'Guardar y pasar a conclusiones'
                : 'Guardar borrador local'}
        </Text>
      </TouchableOpacity>
      <AppNoticeModal
        visible={Boolean(notice)}
        title={notice?.title || ''}
        message={notice?.message || ''}
        variant={notice?.variant}
        confirmLabel={notice?.confirmLabel}
        cancelLabel={notice?.cancelLabel}
        onConfirm={() => { const action = notice?.onConfirm; closeNotice(); action?.(); }}
        onCancel={closeNotice}
      />
      <AppNoticeModal
        visible={Boolean(sourceQuestion)}
        title="Agregar evidencia"
        message="Elige cómo deseas seleccionar la imagen. El cambio se aplicará cuando guardes la visita."
        confirmLabel="Cámara"
        cancelLabel="Galería"
        neutralLabel="Cancelar"
        onConfirm={() => { const question = sourceQuestion; setSourceQuestion(null); if (question) handlePickImage(question, 'camera'); }}
        onCancel={() => { const question = sourceQuestion; setSourceQuestion(null); if (question) handlePickImage(question, 'library'); }}
        onNeutral={() => { setSourceQuestion(null); setReplacementTarget(null); }}
      />
    </ScrollView>
  );
}

function ComplianceSelector({ label, value, onChange }: { label: string; value: AnswerValue; onChange: (value: Exclude<AnswerValue, null>) => void }) {
  return (
    <View style={styles.complianceSection}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.radioGroup}>
        <TouchableOpacity style={[styles.radioButton, value === 'cumple' && styles.radioActiveCumple]} onPress={() => onChange('cumple')}>
          <Text style={[styles.radioText, value === 'cumple' && styles.textWhite]}>CUMPLE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.radioButton, value === 'no_cumple' && styles.radioActiveNoCumple]} onPress={() => onChange('no_cumple')}>
          <Text style={[styles.radioText, value === 'no_cumple' && styles.textWhite]}>NO CUMPLE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'web') setOpen(false);
    if (selected) onChange(selected.toISOString().slice(0, 10));
  };

  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          style: {
            width: '100%',
            minHeight: 44,
            border: `1px solid ${brandColors.border}`,
            borderRadius: 8,
            padding: '0 10px',
            backgroundColor: brandColors.white,
            color: brandColors.inputText,
            fontFamily: 'inherit',
            fontWeight: 700,
            boxSizing: 'border-box',
          },
        })
      ) : (
        <>
          <TouchableOpacity style={styles.detailInput} onPress={() => setOpen(true)}>
            <Text style={value ? styles.detailInputText : styles.detailPlaceholder}>{value || 'Seleccionar fecha'}</Text>
          </TouchableOpacity>
          {open ? <DateTimePicker value={date} mode="date" onChange={handleChange} /> : null}
        </>
      )}
    </View>
  );
}

function ResponsibleField({
  value,
  options,
  onChange,
  label = 'Responsable',
}: {
  value: string;
  options: ResponsibleOption[];
  onChange: (responsible: ResponsibleOption) => void;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((item) => item.id === value);
  const normalizedQuery = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = options.filter((item) => {
    const searchable = `${item.responsible_code} ${item.responsible_name}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return !normalizedQuery || searchable.includes(normalizedQuery);
  });

  const close = () => {
    setVisible(false);
    setQuery('');
  };

  return (
    <View style={styles.detailResponsible}>
      <Text style={styles.detailLabel}>{label}</Text>
      <TouchableOpacity style={styles.responsibleTrigger} onPress={() => setVisible(true)}>
        <Text
          numberOfLines={2}
          style={selected ? styles.responsibleTriggerText : styles.detailPlaceholder}
        >
          {selected
            ? `${selected.responsible_code} · ${selected.responsible_name}`
            : `Seleccionar ${label.toLowerCase()}`}
        </Text>
        <Text style={styles.responsibleTriggerIcon}>⌕</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.responsibleModalBackdrop}>
          <View style={styles.responsibleModalCard}>
            <View style={styles.responsibleModalHeader}>
              <Text style={styles.responsibleModalTitle}>Seleccionar {label.toLowerCase()}</Text>
              <TouchableOpacity style={styles.responsibleModalClose} onPress={close}>
                <Text style={styles.responsibleModalCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              autoFocus={Platform.OS === 'web'}
              style={styles.responsibleSearch}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar por código o nombre"
              placeholderTextColor={brandColors.inputPlaceholder}
            />
            <ScrollView style={styles.responsibleOptions} keyboardShouldPersistTaps="handled">
              {filtered.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.responsibleOption, item.id === value && styles.responsibleOptionActive]}
                  onPress={() => {
                    onChange(item);
                    close();
                  }}
                >
                  <Text style={styles.responsibleOptionCode}>{item.responsible_code}</Text>
                  <Text style={styles.responsibleOptionName}>{item.responsible_name}</Text>
                </TouchableOpacity>
              ))}
              {filtered.length === 0 ? (
                <Text style={styles.responsibleEmpty}>No se encontraron responsables.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProductWriteoffTable({
  rows,
  responsibles,
  onAdd,
  onChange,
  onRemove,
}: {
  rows: ProductWriteoffRow[];
  responsibles: ResponsibleOption[];
  onAdd: () => void;
  onChange: (rowId: string, fields: Partial<ProductWriteoffRow>) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <View style={styles.detailTable}>
      <Text style={styles.detailTableTitle}>Detalle de bajas de productos</Text>
      {rows.map((row) => (
        <View key={row.id} style={styles.detailRow}>
          <View style={styles.detailRowToolbar}>
            <ResponsibleField
              value={row.responsibleId}
              options={responsibles}
              onChange={(responsible) => onChange(row.id, {
                responsibleId: responsible.id,
                responsibleCode: responsible.responsible_code,
                responsibleName: responsible.responsible_name,
              })}
            />
            <TouchableOpacity style={styles.removeDetailButton} onPress={() => onRemove(row.id)}>
              <Text style={styles.removeDetailButtonText}>Eliminar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.detailFieldsGrid}>
            <DateField label="Fecha del lote" value={row.lotDate} onChange={(lotDate) => onChange(row.id, { lotDate })} />
            <DateField label="Fecha de la baja" value={row.writeoffDate} onChange={(writeoffDate) => onChange(row.id, { writeoffDate })} />
            <View style={[styles.detailField, styles.detailDescription]}>
              <Text style={styles.detailLabel}>Descripción</Text>
              <TextInput style={styles.detailInput} value={row.description} maxLength={500} onChangeText={(description) => onChange(row.id, { description })} placeholder="Producto dado de baja" placeholderTextColor={brandColors.inputPlaceholder} />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Cantidad</Text>
              <TextInput style={styles.detailInput} value={row.quantity} keyboardType="decimal-pad" onChangeText={(quantity) => onChange(row.id, { quantity })} placeholder="0.00" placeholderTextColor={brandColors.inputPlaceholder} />
            </View>
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.compactAddButton} onPress={onAdd}>
        <Text style={styles.secondaryButtonText}>+ Agregar baja</Text>
      </TouchableOpacity>
    </View>
  );
}

function DepositDeclarationTable({
  rows,
  responsibles,
  onAdd,
  onChange,
  onRemove,
}: {
  rows: DepositDeclarationRow[];
  responsibles: ResponsibleOption[];
  onAdd: () => void;
  onChange: (rowId: string, fields: Partial<DepositDeclarationRow>) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <View style={styles.detailTable}>
      <Text style={styles.detailTableTitle}>Registro adicional de depósitos</Text>
      {rows.map((row) => (
        <View key={row.id} style={styles.detailRow}>
          <View style={styles.detailRowToolbar}>
            <ResponsibleField
              label="Líder"
              value={row.responsibleId}
              options={responsibles}
              onChange={(responsible) => onChange(row.id, {
                responsibleId: responsible.id,
                responsibleCode: responsible.responsible_code,
                responsibleName: responsible.responsible_name,
              })}
            />
            <TouchableOpacity style={styles.removeDetailButton} onPress={() => onRemove(row.id)}>
              <Text style={styles.removeDetailButtonText}>Eliminar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.depositFieldsGrid}>
            <DateField label="Fecha" value={row.date} onChange={(date) => onChange(row.id, { date })} />
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Cuaderno</Text>
              <TextInput style={styles.detailInput} value={row.notebookAmount} keyboardType="decimal-pad" onChangeText={(notebookAmount) => onChange(row.id, { notebookAmount })} placeholder="$ 0.00" placeholderTextColor={brandColors.inputPlaceholder} />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Sistema</Text>
              <TextInput style={styles.detailInput} value={row.systemAmount} keyboardType="decimal-pad" onChangeText={(systemAmount) => onChange(row.id, { systemAmount })} placeholder="$ 0.00" placeholderTextColor={brandColors.inputPlaceholder} />
            </View>
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.compactAddButton} onPress={onAdd}>
        <Text style={styles.secondaryButtonText}>+ Agregar registro</Text>
      </TouchableOpacity>
    </View>
  );
}

function NumberField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (text: string) => void }) {
  return (
    <View style={styles.numberField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={brandColors.inputPlaceholder}
        placeholder="0.00"
      />
    </View>
  );
}

function CountItemsEditor({
  title,
  items,
  onChange,
  showCrossSummary = false,
}: {
  title: string;
  items: CountItem[];
  onChange: (items: CountItem[]) => void;
  showCrossSummary?: boolean;
}) {
  const updateItem = (index: number, fields: Partial<CountItem>) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...fields } : item)));
  };

  const addItem = () => {
    onChange([...items, { label: '', theoreticalValue: '', physicalValue: '' }]);
  };

  const canAddItems = !items.some((item) => item.locked);
  const crossGroups = showCrossSummary ? rawMaterialCrossGroups(items) : [];

  return (
    <View style={styles.countBox}>
      <Text style={styles.countTitle}>{title}</Text>
      {items.map((item, index) => {
        const difference = countItemDifference(item);

        return (
          <View key={`${index}-${item.label}`} style={styles.countRow}>
            {item.locked ? (
              <View style={styles.itemLabelLocked}>
                <Text style={styles.itemLabelText}>{item.label}</Text>
                {item.unit ? <Text style={styles.itemMetaText}>Unidad: {item.unit}</Text> : null}
              </View>
            ) : (
              <TextInput
                style={[styles.input, styles.itemNameInput]}
                value={item.label}
                onChangeText={(text) => updateItem(index, { label: text })}
                placeholderTextColor={brandColors.inputPlaceholder}
                placeholder="Item"
              />
            )}
            <View style={styles.countNumbers}>
              <NumberField label="Teorico" value={item.theoreticalValue} onChangeText={(text) => updateItem(index, { theoreticalValue: text })} />
              <NumberField label="Fisico" value={item.physicalValue} onChangeText={(text) => updateItem(index, { physicalValue: text })} />
            </View>
            <Text style={[styles.itemDifference, difference !== null && difference < 0 && styles.negativeDifferenceText]}>
              Diferencia: {difference === null ? 'Pendiente' : difference.toFixed(2)}
            </Text>
          </View>
        );
      })}
      {canAddItems && (
        <TouchableOpacity style={styles.addItemButton} onPress={addItem}>
          <Text style={styles.addItemText}>+ Agregar item</Text>
        </TouchableOpacity>
      )}
      {showCrossSummary && crossGroups.length > 0 && (
        <View style={styles.crossBox}>
          <Text style={styles.crossTitle}>Cruces aplicables</Text>
          {crossGroups.map((group) => (
            <View key={group.name} style={styles.crossRow}>
              <Text style={styles.crossName}>Cruce de {group.name}</Text>
              <Text style={styles.crossValue}>Resultado {group.result.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.background },
  container: { padding: 18, paddingBottom: 44, maxWidth: 720, alignSelf: 'center', width: '100%', backgroundColor: brandColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  errorText: { color: brandColors.danger, fontWeight: '800' },
  networkBanner: { padding: 10, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  bannerOnline: { backgroundColor: brandColors.greenSoft },
  bannerOffline: { backgroundColor: brandColors.creamSoft },
  bannerText: { fontSize: 13, fontWeight: '800', color: brandColors.textSecondary },
  saveWarning: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, padding: 10, marginBottom: 12 },
  saveWarningText: { color: brandColors.coffeeDark, fontWeight: '800', fontSize: 12 },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.white, padding: 14, marginBottom: 14, flexWrap: 'wrap' },
  headerLogo: { width: 48, height: 48, borderRadius: 8 },
  headerTextBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '900', color: brandColors.textPrimary },
  headerMeta: { fontSize: 13, color: brandColors.textSecondary, fontWeight: '800', marginTop: 3 },
  backButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: brandColors.greenDark, backgroundColor: brandColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { color: brandColors.greenDark, fontSize: 23, lineHeight: 25, fontWeight: '900' },
  editNotice: { borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, backgroundColor: brandColors.creamSoft, padding: 12, marginBottom: 12 },
  editNoticeTitle: { color: brandColors.coffeeDark, fontWeight: '900', fontSize: 15 },
  editNoticeText: { color: brandColors.textSecondary, fontWeight: '700', fontSize: 12, lineHeight: 17, marginTop: 4 },
  editReasonInput: { minHeight: 74, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.white, color: brandColors.inputText, padding: 10, marginTop: 10, textAlignVertical: 'top', fontWeight: '700' },
  finalizedSendSection: { marginTop: 12, gap: 8 },
  finalizedSendActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  finalizedSendButton: { minHeight: 44, flexGrow: 1, flexBasis: 180, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: brandColors.white },
  finalizedSendButtonActive: { borderColor: brandColors.greenDark, backgroundColor: brandColors.greenSoft },
  finalizedSendButtonText: { color: brandColors.textSecondary, fontWeight: '800' },
  finalizedSendButtonTextActive: { color: brandColors.greenDark },
  subtitle: { fontSize: 13, color: brandColors.textSecondary, marginTop: 5, marginBottom: 15 },
  card: { borderWidth: 1, borderColor: brandColors.border, padding: 16, borderRadius: 8, backgroundColor: brandColors.white, marginTop: 14 },
  questionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  questionText: { flex: 1, fontSize: 16, fontWeight: '900', color: brandColors.textPrimary, lineHeight: 22 },
  pointsBadge: { minHeight: 28, borderRadius: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.greenSoft, borderWidth: 1, borderColor: brandColors.greenSoft },
  pointsBadgeText: { color: brandColors.greenDark, fontWeight: '900', fontSize: 12 },
  radioGroup: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  radioButton: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.creamSoft },
  radioActiveCumple: { backgroundColor: brandColors.greenDark, borderColor: brandColors.greenDark, borderWidth: 2 },
  radioActiveNoCumple: { backgroundColor: brandColors.danger, borderColor: brandColors.danger, borderWidth: 2 },
  radioText: { fontWeight: '900', color: brandColors.textSecondary },
  textWhite: { color: brandColors.white },
  dualComplianceGrid: { gap: 2, marginBottom: 4 },
  complianceSection: { width: '100%' },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 6, marginTop: 8 },
  textArea: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: brandColors.white, minHeight: 76, textAlignVertical: 'top', color: brandColors.inputText },
  numericGrid: { marginTop: 8, gap: 8 },
  numberField: { flex: 1 },
  detailTable: { marginTop: 14, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 12, backgroundColor: brandColors.creamSoft, gap: 10 },
  detailTableTitle: { color: brandColors.textPrimary, fontSize: 15, fontWeight: '900' },
  detailRow: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 10, backgroundColor: brandColors.white, gap: 9 },
  detailRowToolbar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  detailFieldsGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 },
  depositFieldsGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 },
  detailField: { flexGrow: 1, flexBasis: 145, minWidth: 130 },
  detailDescription: { flexBasis: 240 },
  detailResponsible: { flex: 1, minWidth: 0 },
  detailLabel: { color: brandColors.textSecondary, fontWeight: '900', fontSize: 11, marginBottom: 5 },
  detailInput: { minHeight: 44, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 10, backgroundColor: brandColors.white, color: brandColors.inputText, justifyContent: 'center' },
  detailInputText: { color: brandColors.inputText, fontWeight: '700' },
  detailPlaceholder: { color: brandColors.inputPlaceholder, fontWeight: '700' },
  responsibleTrigger: { minHeight: 44, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 10, backgroundColor: brandColors.white, flexDirection: 'row', alignItems: 'center', gap: 8 },
  responsibleTriggerText: { flex: 1, color: brandColors.inputText, fontWeight: '800', lineHeight: 17 },
  responsibleTriggerIcon: { color: brandColors.greenDark, fontWeight: '900', fontSize: 18 },
  responsibleModalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', justifyContent: 'center', padding: 18 },
  responsibleModalCard: { width: '100%', maxWidth: 620, maxHeight: '82%', alignSelf: 'center', borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, padding: 16, backgroundColor: brandColors.white },
  responsibleModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  responsibleModalTitle: { flex: 1, color: brandColors.textPrimary, fontSize: 17, fontWeight: '900' },
  responsibleModalClose: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 10, minHeight: 38, justifyContent: 'center', backgroundColor: brandColors.creamSoft },
  responsibleModalCloseText: { color: brandColors.greenDark, fontWeight: '900' },
  responsibleSearch: { minHeight: 46, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 11, color: brandColors.inputText, backgroundColor: brandColors.white, fontWeight: '700', marginBottom: 10 },
  responsibleOptions: { maxHeight: 360 },
  responsibleOption: { borderTopWidth: 1, borderTopColor: brandColors.border, paddingVertical: 11, paddingHorizontal: 8 },
  responsibleOptionActive: { backgroundColor: brandColors.greenSoft },
  responsibleOptionCode: { color: brandColors.greenDark, fontSize: 11, fontWeight: '900' },
  responsibleOptionName: { color: brandColors.textPrimary, fontWeight: '800', marginTop: 2 },
  responsibleEmpty: { color: brandColors.textSecondary, textAlign: 'center', paddingVertical: 24, fontWeight: '700' },
  removeDetailButton: { minHeight: 44, borderWidth: 1, borderColor: brandColors.danger, borderRadius: 8, paddingHorizontal: 11, justifyContent: 'center', alignItems: 'center', backgroundColor: brandColors.white },
  removeDetailButtonText: { color: brandColors.danger, fontWeight: '900' },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderColor: brandColors.greenDark, borderRadius: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.white },
  compactAddButton: { minHeight: 38, alignSelf: 'flex-start', borderWidth: 1, borderColor: brandColors.greenDark, borderRadius: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.white },
  secondaryButtonText: { color: brandColors.greenDark, fontWeight: '900' },
  input: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 10, backgroundColor: brandColors.white, fontSize: 15, color: brandColors.inputText },
  differenceText: { color: brandColors.greenDark, fontWeight: '900', marginTop: 2 },
  negativeDifferenceText: { color: brandColors.danger },
  countBox: { marginTop: 10, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 10, backgroundColor: brandColors.creamSoft },
  countTitle: { color: brandColors.textPrimary, fontWeight: '900', marginBottom: 8 },
  countRow: { borderTopWidth: 1, borderTopColor: brandColors.border, paddingTop: 10, marginTop: 8 },
  itemLabelLocked: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 10, backgroundColor: brandColors.creamSoft, justifyContent: 'center', marginBottom: 4 },
  itemLabelText: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 15 },
  itemMetaText: { color: brandColors.textSecondary, fontWeight: '800', fontSize: 12, marginTop: 2 },
  itemNameInput: { marginBottom: 4 },
  countNumbers: { flexDirection: 'row', gap: 8 },
  itemDifference: { color: brandColors.greenDark, fontWeight: '900', marginTop: 6 },
  addItemButton: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: brandColors.greenDark, alignItems: 'center', justifyContent: 'center', marginTop: 10, backgroundColor: brandColors.greenSoft },
  addItemText: { color: brandColors.greenDark, fontWeight: '900' },
  crossBox: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.greenSoft, padding: 10, marginTop: 10, gap: 6 },
  crossTitle: { color: brandColors.greenDark, fontWeight: '900' },
  crossRow: { borderTopWidth: 1, borderTopColor: brandColors.border, paddingTop: 6 },
  crossName: { color: brandColors.textPrimary, fontWeight: '900' },
  crossValue: { color: brandColors.greenDark, fontWeight: '800', marginTop: 2 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  evidenceCounter: { color: brandColors.textSecondary, fontWeight: '800', fontSize: 12 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  photoButton: { width: 118, height: 92, borderWidth: 1, borderColor: brandColors.greenDark, borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.greenSoft },
  photoButtonText: { color: brandColors.greenDark, fontWeight: '900' },
  imagePreview: { width: 118, height: 92, borderRadius: 8, backgroundColor: brandColors.border },
  evidenceCard: { width: 132, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 6, backgroundColor: brandColors.white, gap: 5 },
  evidenceCardPending: { borderColor: brandColors.warning, backgroundColor: brandColors.creamSoft },
  evidenceCardRemoved: { opacity: 0.55, borderColor: brandColors.danger },
  evidenceStatus: { color: brandColors.textSecondary, fontSize: 11, fontWeight: '900' },
  evidenceStatusRemoved: { color: brandColors.danger },
  evidenceActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  evidenceActionText: { color: brandColors.greenDark, fontSize: 11, fontWeight: '900' },
  evidenceRemoveText: { color: brandColors.danger, fontSize: 11, fontWeight: '900' },
  validationText: { marginTop: 10, color: brandColors.danger, fontWeight: '800', fontSize: 12 },
  submitButton: { backgroundColor: brandColors.greenDark, padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  disabledButton: { backgroundColor: brandColors.green, opacity: 0.7 },
  submitButtonText: { color: brandColors.white, fontSize: 16, fontWeight: '900' },
});

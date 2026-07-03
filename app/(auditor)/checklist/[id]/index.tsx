import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { brandColors } from '../../../../constants/theme';
import SecureEvidenceImage from '../../../../src/features/audits/components/secure-evidence-image';
import { supabase } from '../../../../src/supabaseClient';
import { offlineStorage } from '../../../../src/offlineStorage';

type AnswerValue = 'cumple' | 'no_cumple' | null;
type QuestionType = 'compliance' | 'cash_count' | 'pending_deposit' | 'inventory' | 'cup_count' | 'raw_material_count' | 'follow_up' | 'additional_novelty';

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
}

interface AnswerState {
  value: AnswerValue;
  observation: string;
  evidenceUrls: string[];
  localImageUris: string[];
  uploading: boolean;
  theoreticalValue: string;
  physicalValue: string;
  currentShift: string;
  previousShift: string;
  countItems: CountItem[];
}

interface DraftAnswerRow {
  report_id: string;
  question_id: string;
  value: AnswerValue;
  observation: string | null;
  evidence_url: string | null;
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

const emptyAnswer: AnswerState = {
  value: null,
  observation: '',
  evidenceUrls: [],
  localImageUris: [],
  uploading: false,
  theoreticalValue: '',
  physicalValue: '',
  currentShift: '',
  previousShift: '',
  countItems: [],
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
  return Boolean(answer.observation.trim()) || answer.evidenceUrls.length > 0 || answer.localImageUris.length > 0;
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
    value: type === 'additional_novelty' || isCountOnlyQuestion(type) ? 'cumple' : answer.value,
    observation: answer.observation.trim(),
    evidence_url: answer.evidenceUrls[0] || null,
    numeric_value_theoretical: firstNumericItem?.theoretical ?? toNumber(answer.theoreticalValue),
    numeric_value_physical: firstNumericItem?.physical ?? toNumber(answer.physicalValue),
    numeric_value_current: toNumber(answer.currentShift),
    numeric_value_previous: toNumber(answer.previousShift),
    numeric_items: numericItems,
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
    observation: row.observation || '',
    evidenceUrls: row.evidence_url ? [row.evidence_url] : [],
    theoreticalValue: row.numeric_value_theoretical === null || row.numeric_value_theoretical === undefined ? '' : String(row.numeric_value_theoretical),
    physicalValue: row.numeric_value_physical === null || row.numeric_value_physical === undefined ? '' : String(row.numeric_value_physical),
    currentShift: row.numeric_value_current === null || row.numeric_value_current === undefined ? '' : String(row.numeric_value_current),
    previousShift: row.numeric_value_previous === null || row.numeric_value_previous === undefined ? '' : String(row.numeric_value_previous),
    countItems,
  };
}

export default function ChecklistDinamicoPage() {
  const router = useRouter();
  const { id: reportId, region, visit_type_id, local_id } = useLocalSearchParams();

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
      ]);

      if (supabaseError) {
        setError(supabaseError.message);
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
        .select('report_id, question_id, value, observation, evidence_url, numeric_value_theoretical, numeric_value_physical, numeric_value_current, numeric_value_previous, numeric_items')
        .eq('report_id', reportId);

      if (draftError) {
        setSaveWarning('No se pudo cargar el borrador remoto. Se usara el respaldo local si existe.');
      }

      const questionsById = new Map(loadedQuestions.map((question: Question) => [question.id, question]));
      (remoteRows || []).forEach((row) => {
        const question = questionsById.get(row.question_id);
        if (question) initialAnswers[row.question_id] = draftRowToAnswer(question, row as DraftAnswerRow);
      });

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

    const { error: upsertError } = await supabase
      .from('audit_answers_draft')
      .upsert(answerToDraftRow(String(reportId), question, answer), { onConflict: 'report_id,question_id' });

    if (upsertError) {
      setSaveWarning('No se pudo guardar este cambio en Supabase. Se mantiene respaldo local.');
    } else {
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
        alert('Se requieren permisos de camara.');
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
      alert('Se requieren permisos para acceder a la galeria.');
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

    if (currentAnswer.evidenceUrls.length + currentAnswer.localImageUris.length >= maxEvidence) {
      alert(`Esta pregunta permite hasta ${maxEvidence} imagenes.`);
      return;
    }

    if (!source) {
      if (Platform.OS === 'web') {
        const useCamera = typeof window !== 'undefined' && window.confirm('Aceptar: tomar foto. Cancelar: seleccionar archivo.');
        await handlePickImage(question, useCamera ? 'camera' : 'library');
        return;
      }

      Alert.alert('Agregar evidencia', 'Elige el origen de la imagen.', [
        { text: 'Camara', onPress: () => handlePickImage(question, 'camera') },
        { text: 'Galeria', onPress: () => handlePickImage(question, 'library') },
        { text: 'Cancelar', style: 'cancel' },
      ]);
      return;
    }

    const pickedImage = await pickImageFromSource(source);
    if (!pickedImage) return;

    if (!isOnline) {
      const nextLocalImages = [...currentAnswer.localImageUris, pickedImage.uri].slice(0, maxEvidence);
      await updateField(questionId, { localImageUris: nextLocalImages, uploading: false });
      alert('Foto guardada localmente en el borrador.');
      return;
    }

    await updateField(questionId, { uploading: true });

    try {
      const folderRegion = String(region).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const imageIndex = currentAnswer.evidenceUrls.length + currentAnswer.localImageUris.length + 1;
      const fileRoute = `${folderRegion}/2026-06-01/${local_id || 'sin-local'}/${reportId}/${questionId}/foto-${imageIndex}.jpg`;

      const uploadBody = pickedImage.base64
        ? base64ToArrayBuffer(pickedImage.base64)
        : await fetch(pickedImage.uri).then((response) => response.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('evidencias')
        .upload(fileRoute, uploadBody, { contentType: pickedImage.mimeType, cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const latestAnswer = { ...emptyAnswer, ...answers[questionId] };
      await updateField(questionId, {
        evidenceUrls: [...latestAnswer.evidenceUrls, fileRoute].slice(0, maxEvidence),
        uploading: false,
      });
    } catch (err: any) {
      alert('Error de subida: ' + err.message);
      await updateField(questionId, { uploading: false });
    }
  };

  const getValidationMessage = (question: Question, answer: AnswerState) => {
    const type = getQuestionType(question);
    const observationRequired = answer.value === 'no_cumple' && question.requires_observation_on_fail !== false;

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

    if (!answer.value) return 'Selecciona CUMPLE o NO CUMPLE.';
    if (type !== 'follow_up' && observationRequired && !answer.observation.trim()) return 'Agrega una observacion para NO CUMPLE.';

    if (type === 'pending_deposit' && (!answer.currentShift.trim() || !answer.previousShift.trim())) {
      return 'Completa turno actual y turno anterior.';
    }

    return null;
  };

  const checkFormValidation = () => {
    if (questions.length === 0) return false;
    return questions.every((q) => !getValidationMessage(q, { ...emptyAnswer, ...answers[q.id] }));
  };

  const calculateScore = (payload: DraftAnswerRow[]) => {
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    return payload.reduce(
      (acc, answer) => {
        const question = questionsById.get(answer.question_id);
        if (!question || !isScoredQuestion(question)) return acc;
        const points = Number(question.score_points || 0);
        acc.possible += points;
        if (answer.value === 'cumple') acc.obtained += points;
        return acc;
      },
      { obtained: 0, possible: 0 },
    );
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
      alert('Elige si deseas enviar el informe o guardar sin enviar antes de salir.');
      return;
    }

    if (hasChanges && !reason) {
      alert('Ingresa el motivo de edicion antes de guardar la visita finalizada.');
      return;
    }

    if (!hasChanges) {
      if (wantsInitialSend) await sendFinalizedReport();
      router.replace('/dashboard');
      return;
    }

    const { data, error: editError } = await supabase.functions.invoke('manage-report-edit', {
      body: { action: 'submit', reportId, reason, answers: payload, sendAfterApproval: wantsInitialSend },
    });
    if (editError || !data?.ok) throw new Error(data?.error || editError?.message || 'No se pudo procesar la edicion.');

    if (data.pending) {
      alert(wantsInitialSend
        ? 'Este cambio modifica la calificacion. El informe se enviara despues de que un administrador lo apruebe.'
        : 'Este cambio modifica la calificacion y requiere autorizacion de un administrador antes de aplicarse.');
      router.replace('/dashboard');
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

    router.replace('/dashboard');
  };

  const handleSubmit = async () => {
    if (!checkFormValidation()) return;
    setIsSubmitting(true);

    if (!isOnline) {
      alert('Auditoria guardada localmente como borrador. Se sincronizara al recuperar red.');
      router.replace('/nueva-auditoria');
      setIsSubmitting(false);
      return;
    }

    const payload = questions.flatMap((q) => {
      const answer = { ...emptyAnswer, ...answers[q.id] };
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
      alert('No se pudo actualizar la visita: ' + err.message);
      setIsSubmitting(false);
      return;
    }

    if (payload.length > 0) {
      const { error: insertError } = await supabase
        .from('audit_answers_draft')
        .upsert(payload, { onConflict: 'report_id,question_id' });

      if (insertError) {
        alert('No se pudo guardar el checklist en Supabase: ' + insertError.message);
        setIsSubmitting(false);
        return;
      }
    }

    await offlineStorage.clearDraft(String(reportId));
    router.push({
      pathname: `/conclusiones/${reportId}`,
      params: { region },
    });
    setIsSubmitting(false);
  };

  const isFormValid = useMemo(checkFormValidation, [questions, answers]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /><Text>Cargando datos...</Text></View>;
  }

  if (error) {
    return <View style={styles.center}><Text style={styles.errorText}>Error: {error}</Text></View>;
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
        const evidenceCount = currentAnswer.evidenceUrls.length + currentAnswer.localImageUris.length;
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

            {requiresComplianceAnswer(type) && (
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
              <View style={styles.numericGrid}>
                <NumberField label="Turno actual" value={currentAnswer.currentShift} onChangeText={(text) => updateField(q.id, { currentShift: text })} />
                <NumberField label="Turno anterior" value={currentAnswer.previousShift} onChangeText={(text) => updateField(q.id, { previousShift: text })} />
              </View>
            )}

            <View style={styles.evidenceHeader}>
              <Text style={styles.fieldLabel}>Evidencias opcionales</Text>
              <Text style={styles.evidenceCounter}>{evidenceCount}/{maxEvidence}</Text>
            </View>

            <View style={styles.imageGrid}>
              {[...currentAnswer.localImageUris, ...currentAnswer.evidenceUrls].slice(0, maxEvidence).map((uri, imageIndex) => (
                <SecureEvidenceImage key={`${q.id}-${imageIndex}-${uri}`} reference={uri} />
              ))}
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
    </ScrollView>
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
  errorText: { color: brandColors.danger, fontWeight: '800' },
  networkBanner: { padding: 10, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  bannerOnline: { backgroundColor: brandColors.greenSoft },
  bannerOffline: { backgroundColor: brandColors.creamSoft },
  bannerText: { fontSize: 13, fontWeight: '800', color: brandColors.textSecondary },
  saveWarning: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, padding: 10, marginBottom: 12 },
  saveWarningText: { color: brandColors.coffeeDark, fontWeight: '800', fontSize: 12 },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.white, padding: 14, marginBottom: 14 },
  headerLogo: { width: 48, height: 48, borderRadius: 8 },
  headerTextBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '900', color: brandColors.textPrimary },
  headerMeta: { fontSize: 13, color: brandColors.textSecondary, fontWeight: '800', marginTop: 3 },
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
  fieldLabel: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 6, marginTop: 8 },
  textArea: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: brandColors.white, minHeight: 76, textAlignVertical: 'top', color: brandColors.inputText },
  numericGrid: { marginTop: 8, gap: 8 },
  numberField: { flex: 1 },
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
  validationText: { marginTop: 10, color: brandColors.danger, fontWeight: '800', fontSize: 12 },
  submitButton: { backgroundColor: brandColors.greenDark, padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  disabledButton: { backgroundColor: brandColors.green, opacity: 0.7 },
  submitButtonText: { color: brandColors.white, fontSize: 16, fontWeight: '900' },
});

import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { brandColors } from '../../../../constants/theme';
import { supabase } from '../../../../src/supabaseClient';
import SignaturePad, { SignatureInputType } from '../../../../src/features/audits/components/signature-pad';

type SendChoice = boolean | null;

interface AnswerRecord {
  question_id: string;
  value: 'cumple' | 'no_cumple';
  observation: string;
  evidence_url: string | null;
  numeric_value_theoretical?: number | null;
  numeric_value_physical?: number | null;
  numeric_value_current?: number | null;
  numeric_value_previous?: number | null;
  numeric_items?: unknown[] | null;
  checklist_questions?: {
    score_points: number;
    is_scored: boolean | null;
    question_type: string | null;
  } | null;
}

interface ReportSnapshot {
  auditor_name_snapshot: string | null;
  responsible_code: string | null;
  responsible_name_snapshot: string | null;
}

const signatureColors = [
  { label: 'Negro', value: brandColors.textPrimary },
  { label: 'Azul', value: '#1d4ed8' },
  { label: 'Rojo', value: brandColors.danger },
  { label: 'Lila', value: '#7c3aed' },
  { label: 'Verde', value: brandColors.greenDark },
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateToTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function isScoredAnswer(answer: AnswerRecord) {
  const question = answer.checklist_questions;
  if (!question) return true;
  if (question.is_scored === false) return false;
  return !['follow_up', 'additional_novelty', 'inventory', 'raw_material_count'].includes(question.question_type || '');
}

export default function FinalizarReportePage() {
  const router = useRouter();
  const { id: reportId, region } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [rawAnswers, setRawAnswers] = useState<AnswerRecord[]>([]);
  const [weightedScore, setWeightedScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [reportSnapshot, setReportSnapshot] = useState<ReportSnapshot | null>(null);
  const [endTime, setEndTime] = useState(dateToTime(new Date()));
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [auditorSignature, setAuditorSignature] = useState<string | null>(null);
  const [responsibleSignature, setResponsibleSignature] = useState<string | null>(null);
  const [auditorSignatureType, setAuditorSignatureType] = useState<SignatureInputType | null>(null);
  const [responsibleSignatureType, setResponsibleSignatureType] = useState<SignatureInputType | null>(null);
  const [auditorColor, setAuditorColor] = useState(signatureColors[0].value);
  const [responsibleColor, setResponsibleColor] = useState(signatureColors[0].value);
  const [shouldSend, setShouldSend] = useState<SendChoice>(null);

  useEffect(() => {
    async function loadClosingData() {
      setLoading(true);

      const [{ data: answersData, error: answersError }, { data: reportData, error: reportError }] = await Promise.all([
        supabase
          .from('audit_answers_draft')
          .select('*, checklist_questions(score_points, is_scored, question_type)')
          .eq('report_id', reportId),
        supabase
          .from('audit_reports')
          .select('auditor_name_snapshot, responsible_code, responsible_name_snapshot')
          .eq('id', reportId)
          .single<ReportSnapshot>(),
      ]);

      if (answersError) {
        alert('No se pudieron cargar las respuestas: ' + answersError.message);
      }

      if (reportError) {
        alert('No se pudo cargar el reporte: ' + reportError.message);
      }

      const answers = (answersData || []) as AnswerRecord[];
      const scoredAnswers = answers.filter(isScoredAnswer);
      const obtained = scoredAnswers.reduce((total, answer) => {
        const points = Number(answer.checklist_questions?.score_points || 0);
        return answer.value === 'cumple' ? total + points : total;
      }, 0);
      const possible = scoredAnswers.reduce(
        (total, answer) => total + Number(answer.checklist_questions?.score_points || 0),
        0,
      );

      setRawAnswers(answers);
      setWeightedScore(roundToTwo(obtained));
      setMaxScore(roundToTwo(possible));
      setReportSnapshot(reportData || null);
      setLoading(false);
    }

    if (reportId) loadClosingData();
  }, [reportId]);

  const responsibleDisplay = useMemo(() => {
    const code = reportSnapshot?.responsible_code;
    const name = reportSnapshot?.responsible_name_snapshot || 'Responsable';
    return code ? `${code} · ${name}` : name;
  }, [reportSnapshot]);

  const canFinalize = Boolean(endTime.trim()) && Boolean(auditorSignature) && shouldSend !== null && rawAnswers.length > 0;

  const handleEndTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShowEndTimePicker(false);
    if (date) setEndTime(dateToTime(date));
  };

  const base64ToBlob = async (signatureData: string) => {
    const response = await fetch(signatureData);
    return response.blob();
  };

  const uploadSignature = async (signatureData: string, path: string) => {
    const blob = await base64ToBlob(signatureData);
    const { error } = await supabase.storage.from('evidencias').upload(path, blob, { contentType: 'image/png', upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(path);
    return publicUrl;
  };

  const handleFinalizarReporte = async () => {
    if (!canFinalize || !auditorSignature || !auditorSignatureType) {
      alert('Completa hora de culminacion, firma del auditor y la opcion Enviar.');
      return;
    }

    setIsSaving(true);
    try {
      const folderRegion = String(region || 'general').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const folderDate = new Date().toISOString().slice(0, 10);
      const storageBasePath = `${folderRegion}/${folderDate}/${reportId}/firmas`;

      const pathAuditor = `${storageBasePath}/firma_auditor.png`;
      const pathResponsable = `${storageBasePath}/firma_responsable.png`;
      const urlAuditor = await uploadSignature(auditorSignature, pathAuditor);
      const urlResponsable = responsibleSignature ? await uploadSignature(responsibleSignature, pathResponsable) : null;

      const finalScorePercentage = maxScore > 0 ? roundToTwo((weightedScore / maxScore) * 100) : 0;
      const finalGradeBaseTen = maxScore > 0 ? roundToTwo((weightedScore / maxScore) * 10) : 0;

      const answersPayload = rawAnswers.map((answer) => ({
        report_id: reportId,
        question_id: answer.question_id,
        value: answer.value,
        observation: answer.observation,
        evidence_url: answer.evidence_url,
        numeric_value_theoretical: answer.numeric_value_theoretical ?? null,
        numeric_value_physical: answer.numeric_value_physical ?? null,
        numeric_value_current: answer.numeric_value_current ?? null,
        numeric_value_previous: answer.numeric_value_previous ?? null,
        numeric_items: answer.numeric_items ?? [],
        created_at: new Date().toISOString(),
      }));

      const { error: errInsertAnswers } = await supabase
        .from('audit_answers_final')
        .upsert(answersPayload, { onConflict: 'report_id,question_id' });
      if (errInsertAnswers) throw errInsertAnswers;

      const { error: errFinalizeReport } = await supabase
        .from('audit_reports')
        .update({
          signature_auditor_url: urlAuditor,
          signature_responsible_url: urlResponsable,
          auditor_signature_url: urlAuditor,
          responsible_signature_url: urlResponsable,
          auditor_signature_type: auditorSignatureType,
          responsible_signature_type: responsibleSignature ? responsibleSignatureType : null,
          auditor_signature_color: auditorColor,
          responsible_signature_color: responsibleSignature ? responsibleColor : null,
          should_send: shouldSend,
          end_time: endTime,
          final_percentage: finalScorePercentage,
          final_grade: finalGradeBaseTen,
          status: 'finalized',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (errFinalizeReport) throw errFinalizeReport;

      if (shouldSend) {
        const { data: sessionData } = await supabase.auth.getSession();
        const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finalize-report`;
        const sendResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
            Authorization: `Bearer ${sessionData.session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
          },
          body: JSON.stringify({ reportId, region }),
        });

        const sendData = await sendResponse.json().catch(() => null);
        if (!sendResponse.ok) {
          const detail = sendData && typeof sendData === 'object' && 'error' in sendData ? String(sendData.error) : `HTTP ${sendResponse.status}`;
          throw new Error(`Envio de correo: ${detail}`);
        }
      }

      await supabase.from('audit_answers_draft').delete().eq('report_id', reportId);

      alert(`Reporte finalizado.\nCalificacion: ${weightedScore.toFixed(2)} / ${maxScore.toFixed(2)} puntos`);
      router.replace('/nueva-auditoria');
    } catch (err: any) {
      alert('Error en consolidacion del reporte: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.textStyle}>Preparando cierre...</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Cierre de auditoria</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Calificacion</Text>
        <Text style={styles.scoreText}>{weightedScore.toFixed(2)} / {maxScore.toFixed(2)} puntos</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Hora de culminacion</Text>
        <TimeField value={endTime} visible={showEndTimePicker} onOpen={() => setShowEndTimePicker(true)} onChange={handleEndTimeChange} onWebChange={setEndTime} />
      </View>

      <View style={styles.card}>
        <ColorPicker label="Color firma auditor" value={auditorColor} onChange={setAuditorColor} />
        <SignaturePad
          title="Firma del auditor"
          penColor={auditorColor}
          previewUri={auditorSignature}
          onOK={(signature, type) => {
            setAuditorSignature(signature);
            setAuditorSignatureType(type);
          }}
          onClear={() => {
            setAuditorSignature(null);
            setAuditorSignatureType(null);
          }}
        />
        <Text style={styles.signatureName}>{reportSnapshot?.auditor_name_snapshot || 'Auditor'}</Text>
      </View>

      <View style={styles.card}>
        <ColorPicker label="Color firma responsable" value={responsibleColor} onChange={setResponsibleColor} />
        <SignaturePad
          title="Firma del responsable"
          penColor={responsibleColor}
          previewUri={responsibleSignature}
          onOK={(signature, type) => {
            setResponsibleSignature(signature);
            setResponsibleSignatureType(type);
          }}
          onClear={() => {
            setResponsibleSignature(null);
            setResponsibleSignatureType(null);
          }}
        />
        <Text style={styles.signatureName}>{responsibleDisplay}</Text>
        {!responsibleSignature && <Text style={styles.noSignatureText}>Sin Firma</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Enviar</Text>
        <View style={styles.sendGroup}>
          <TouchableOpacity style={[styles.sendButton, shouldSend === true && styles.sendButtonActive]} onPress={() => setShouldSend(true)}>
            <Text style={[styles.sendButtonText, shouldSend === true && styles.sendButtonTextActive]}>Si</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.sendButton, shouldSend === false && styles.sendButtonActive]} onPress={() => setShouldSend(false)}>
            <Text style={[styles.sendButtonText, shouldSend === false && styles.sendButtonTextActive]}>No</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, (!canFinalize || isSaving) && styles.disabledButton]}
        onPress={handleFinalizarReporte}
        disabled={!canFinalize || isSaving}
      >
        <Text style={styles.submitButtonText}>{isSaving ? 'Finalizando...' : 'Finalizar'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TimeField({
  value,
  visible,
  onOpen,
  onChange,
  onWebChange,
}: {
  value: string;
  visible: boolean;
  onOpen: () => void;
  onChange: (event: DateTimePickerEvent, date?: Date) => void;
  onWebChange: (value: string) => void;
}) {
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'time',
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onWebChange(event.target.value),
      style: webInputStyle,
    });
  }

  return (
    <View>
      <TouchableOpacity style={styles.timeButton} onPress={onOpen}>
        <Text style={styles.timeValue}>{value}</Text>
      </TouchableOpacity>
      {visible && <DateTimePicker value={new Date(`2026-01-01T${value || '00:00'}:00`)} mode="time" display="clock" onChange={onChange} is24Hour />}
    </View>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.colorSection}>
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={styles.colorGroup}>
        {signatureColors.map((color) => (
          <TouchableOpacity
            key={color.value}
            style={[styles.colorButton, value === color.value && styles.colorButtonActive]}
            onPress={() => onChange(color.value)}
            accessibilityLabel={`Color ${color.label}`}
          >
            <View style={[styles.colorSwatch, { backgroundColor: color.value }]} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const webInputStyle = {
  width: '100%',
  height: 48,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  boxSizing: 'border-box',
  padding: '0 12px',
  fontSize: 16,
  fontWeight: 800,
  color: brandColors.textPrimary,
  backgroundColor: brandColors.white,
};

const styles = StyleSheet.create({
  container: { padding: 18, maxWidth: 620, alignSelf: 'center', width: '100%', backgroundColor: brandColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  textStyle: { marginTop: 8, color: brandColors.textSecondary },
  title: { fontSize: 22, fontWeight: '900', color: brandColors.textPrimary, marginBottom: 14 },
  card: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 14 },
  cardLabel: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 8 },
  scoreText: { fontSize: 28, fontWeight: '900', color: brandColors.textPrimary },
  timeButton: { minHeight: 50, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: brandColors.white },
  timeValue: { fontSize: 18, fontWeight: '900', color: brandColors.textPrimary },
  colorSection: { marginBottom: 10 },
  colorGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorButton: { width: 34, height: 34, borderWidth: 2, borderColor: '#dbe4ea', borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.creamSoft },
  colorButtonActive: { borderColor: brandColors.greenDark, backgroundColor: '#ecfdf5' },
  colorSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.18)' },
  signatureName: { color: brandColors.textPrimary, fontWeight: '900', marginTop: 2 },
  noSignatureText: { color: brandColors.textSecondary, fontWeight: '800', marginTop: 4 },
  sendGroup: { flexDirection: 'row', gap: 10 },
  sendButton: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.creamSoft },
  sendButtonActive: { borderColor: brandColors.greenDark, backgroundColor: brandColors.greenDark },
  sendButtonText: { color: brandColors.textSecondary, fontWeight: '900' },
  sendButtonTextActive: { color: brandColors.white },
  submitButton: { backgroundColor: brandColors.greenDark, padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 4, marginBottom: 40 },
  disabledButton: { backgroundColor: brandColors.green, opacity: 0.75 },
  submitButtonText: { color: brandColors.white, fontSize: 16, fontWeight: '900' },
});

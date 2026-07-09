import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { brandColors } from '../../../../constants/theme';
import { useDashboardBackHandler } from '../../../../src/navigation/useDashboardBackHandler';
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

function dateToIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  useDashboardBackHandler();
  const goToDashboard = () => router.replace('/dashboard');

  const [loading, setLoading] = useState(true);
  const [rawAnswers, setRawAnswers] = useState<AnswerRecord[]>([]);
  const [weightedScore, setWeightedScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [reportSnapshot, setReportSnapshot] = useState<ReportSnapshot | null>(null);
  const completionPreview = useMemo(() => new Date(), []);
  const [isSaving, setIsSaving] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

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

  const canFinalize = Boolean(auditorSignature) && shouldSend !== null && rawAnswers.length > 0;

  const base64ToArrayBuffer = (signatureData: string) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const cleanBase64 = signatureData.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
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
  };

  const uploadSignature = async (signatureData: string, path: string) => {
    const contentType = signatureData.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
    const uploadBody = signatureData.startsWith('data:')
      ? base64ToArrayBuffer(signatureData)
      : await fetch(signatureData).then((response) => response.arrayBuffer());
    const { error } = await supabase.storage.from('evidencias').upload(path, uploadBody, { contentType, upsert: true });
    if (error) throw error;
    return path;
  };

  const handleFinalizarReporte = async () => {
    if (!canFinalize || !auditorSignature || !auditorSignatureType) {
      alert('Completa la firma del auditor y la opción Enviar.');
      return;
    }

    setIsSaving(true);
    try {
      const completedAt = new Date();
      const endTime = dateToTime(completedAt);
      const folderRegion = String(region || 'general').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const folderDate = completedAt.toISOString().slice(0, 10);
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
        created_at: completedAt.toISOString(),
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
          updated_at: completedAt.toISOString(),
        })
        .eq('id', reportId);

      if (errFinalizeReport) throw errFinalizeReport;

      if (shouldSend) {
        const { data: sessionData } = await supabase.auth.getSession();
        const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finalize-report`;
        try {
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
        } catch (sendError) {
          await supabase
            .from('audit_reports')
            .update({ should_send: false, updated_at: new Date().toISOString() })
            .eq('id', reportId);
          throw sendError;
        }
      }

      await supabase.from('audit_answers_draft').delete().eq('report_id', reportId);

      router.replace('/dashboard');
    } catch (err: any) {
      alert('Error en consolidacion del reporte: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={brandColors.greenDark} /><Text style={styles.textStyle}>Preparando cierre...</Text></View>;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      scrollEnabled={scrollEnabled}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Cierre de auditoria</Text>
        <TouchableOpacity style={styles.backButton} onPress={goToDashboard}>
          <Text style={styles.backButtonText}>Volver al Dashboard</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Calificacion</Text>
        <Text style={styles.scoreText}>{weightedScore.toFixed(2)} / {maxScore.toFixed(2)} puntos</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Fecha y hora de culminación</Text>
        <Text style={styles.timeValue}>{dateToIsoDate(completionPreview)} · {dateToTime(completionPreview)}</Text>
        <Text style={styles.clockHint}>Se registrarán automáticamente al finalizar</Text>
      </View>

      <View style={styles.card}>
        <ColorPicker label="Color firma auditor" value={auditorColor} onChange={setAuditorColor} />
        <SignaturePad
          title="Firma del auditor"
          penColor={auditorColor}
          previewUri={auditorSignature}
          previewType={auditorSignatureType}
          onOK={(signature, type) => {
            setAuditorSignature(signature);
            setAuditorSignatureType(type);
          }}
          onClear={() => {
            setAuditorSignature(null);
            setAuditorSignatureType(null);
          }}
          onInteractionStart={() => setScrollEnabled(false)}
          onInteractionEnd={() => setScrollEnabled(true)}
        />
        <Text style={styles.signatureName}>{reportSnapshot?.auditor_name_snapshot || 'Auditor'}</Text>
      </View>

      <View style={styles.card}>
        <ColorPicker label="Color firma responsable" value={responsibleColor} onChange={setResponsibleColor} />
        <SignaturePad
          title="Firma del responsable"
          penColor={responsibleColor}
          previewUri={responsibleSignature}
          previewType={responsibleSignatureType}
          onOK={(signature, type) => {
            setResponsibleSignature(signature);
            setResponsibleSignatureType(type);
          }}
          onClear={() => {
            setResponsibleSignature(null);
            setResponsibleSignatureType(null);
          }}
          onInteractionStart={() => setScrollEnabled(false)}
          onInteractionEnd={() => setScrollEnabled(true)}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.background },
  container: { padding: 18, paddingBottom: 44, maxWidth: 620, alignSelf: 'center', width: '100%', backgroundColor: brandColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.background },
  textStyle: { marginTop: 8, color: brandColors.textSecondary },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: '900', color: brandColors.textPrimary },
  backButton: { minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: brandColors.greenDark, backgroundColor: brandColors.greenSoft, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { color: brandColors.greenDark, fontWeight: '900', fontSize: 13 },
  card: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 14 },
  cardLabel: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 8 },
  scoreText: { fontSize: 28, fontWeight: '900', color: brandColors.textPrimary },
  timeValue: { fontSize: 18, fontWeight: '900', color: brandColors.textPrimary },
  clockHint: { color: brandColors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 5 },
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

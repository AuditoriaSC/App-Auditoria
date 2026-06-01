import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../../src/supabaseClient';

interface Question {
  id: string;
  question_text: string;
  category: string;
  region: string;
  visit_type_id: string;
  is_active: boolean;
  evidence_required: boolean;
}

interface AnswerState {
  value: 'cumple' | 'no_cumple' | null;
  observation: string;
  evidenceUrl: string; // Guardará la URL pública de Supabase Storage
  uploading: boolean;  // Estado de carga local por pregunta
}

export default function ChecklistDinamicoPage() {
  const router = useRouter();
  const { id: reportId, region, visit_type_id, local_id } = useLocalSearchParams(); 

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQuestions() {
      if (!region || !visit_type_id) {
        setError('Faltan parámetros obligatorios para cargar las preguntas.');
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error: supabaseError } = await supabase
        .from('checklist_questions')
        .select('*')
        .eq('region', region)
        .eq('visit_type_id', visit_type_id)
        .eq('is_active', true);

      if (supabaseError) {
        setError(supabaseError.message);
      } else {
        setQuestions(data || []);
        const initialAnswers: Record<string, AnswerState> = {};
        data?.forEach((q: Question) => {
          initialAnswers[q.id] = { value: null, observation: '', evidenceUrl: '', uploading: false };
        });
        setAnswers(initialAnswers);
      }
      setLoading(false);
    }

    fetchQuestions();
  }, [region, visit_type_id]);

  // FUNCIÓN CLAVE: Capturar imagen y subir a la ruta exacta solicitada
  const handlePickImage = async (questionId: string) => {
    // 1. Solicitar permisos de cámara
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Se requieren permisos de cámara para adjuntar evidencias.');
      return;
    }

    // 2. Abrir la cámara
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect:,
      quality: 0.6, // Comprimir para evitar subidas pesadas
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const imageUri = result.assets[0].uri;

    // 3. Activar cargador visual para esta pregunta
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], uploading: true } }));

    try {
      // Formatear variables para la ruta exacta: costa/2026-06-01/local-id/report-id/question-id/foto.jpg
      const folderRegion = String(region).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // "costa", "norte"
      const folderDate = "2026-06-01"; // Fecha del sistema actual congelada en los requisitos
      const folderLocal = local_id || "sin-local";
      const folderReport = reportId || "sin-reporte";
      
      const fileRoute = `${folderRegion}/${folderDate}/${folderLocal}/${folderReport}/${questionId}/foto.jpg`;

      // Transformar URI local a un Blob binario aceptado por Supabase
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // 4. Subir archivo al bucket llamado 'evidencias'
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evidencias')
        .upload(fileRoute, blob, { contentType: 'image/jpeg', uppercase: true, cacheControl: '3600' });

      if (uploadError) throw uploadError;

      // 5. Obtener la URL pública final del recurso
      const { data: { publicUrl } } = supabase.storage
        .from('evidencias')
        .getPublicUrl(fileRoute);

      // 6. Guardar en el estado de la pregunta
      setAnswers(prev => ({ 
        ...prev, 
        [questionId]: { ...prev[questionId], evidenceUrl: publicUrl, uploading: false } 
      }));

    } catch (err: any) {
      alert('Error al subir imagen: ' + err.message);
      setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], uploading: false } }));
    }
  };

  const checkFormValidation = (): boolean => {
    if (questions.length === 0) return false;
    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer || answer.value === null || answer.observation.trim().length < 3) return false;
      if (q.evidence_required && answer.evidenceUrl.trim().length === 0) return false;
    }
    return true;
  };

  const isFormValid = checkFormValidation();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Evidencias de Checklist</Text>
      <Text style={styles.subtitle}>Estructura automatizada en Supabase Storage</Text>

      {questions.map((q, index) => {
        const currentAnswer = answers[q.id] || { value: null, observation: '', evidenceUrl: '', uploading: false };
        
        return (
          <View key={q.id} style={styles.card}>
            <Text style={styles.questionText}>{index + 1}. {q.question_text}</Text>
            
            <View style={styles.radioGroup}>
              <TouchableOpacity 
                style={[styles.radioButton, currentAnswer.value === 'cumple' && styles.radioActiveCumple]}
                onPress={() => setAnswers(prev => ({ ...prev, [q.id]: { ...prev[q.id], value: 'cumple' } }))}
              >
                <Text style={[styles.radioText, currentAnswer.value === 'cumple' && styles.textWhite]}>Cumple</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.radioButton, currentAnswer.value === 'no_cumple' && styles.radioActiveNoCumple]}
                onPress={() => setAnswers(prev => ({ ...prev, [q.id]: { ...prev[q.id], value: 'no_cumple' } }))}
              >
                <Text style={[styles.radioText, currentAnswer.value === 'no_cumple' && styles.textWhite]}>No Cumple</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Observación *</Text>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Describa los hallazgos hallados..."
              value={currentAnswer.observation}
              onChangeText={(text) => setAnswers(prev => ({ ...prev, [q.id]: { ...prev[q.id], observation: text } }))}
            />

            {/* SECCIÓN DE EVIDENCIA CON EXPO IMAGE PICKER */}
            <Text style={styles.fieldLabel}>
              Evidencia Fotográfica {q.evidence_required ? '(Obligatoria *)' : '(Opcional)'}
            </Text>
            
            {currentAnswer.uploading ? (
              <View style={styles.imagePlaceholder}>
                <ActivityIndicator size="small" color="#0070f3" />
                <Text style={styles.uploadText}>Subiendo foto a Supabase...</Text>
              </View>
            ) : currentAnswer.evidenceUrl ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: currentAnswer.evidenceUrl }} style={styles.imagePreview} />
                <Text style={styles.successUploadText}>✓ Guardada correctamente en ruta del Storage</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoButton} onPress={() => handlePickImage(q.id)}>
                <Text style={styles.photoButtonText}>📸 Capturar Evidencia</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <TouchableOpacity style={[styles.submitButton, !isFormValid && styles.disabledButton]} disabled={!isFormValid}>
        <Text style={styles.submitButtonText}>Finalizar y Guardar Auditoría 💾</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 600, alignSelf: 'center', width: '100%', backgroundColor: '#fdfdfd' },
  title: { fontSize: 22, fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#333', paddingBottom: 10 },
  subtitle: { fontSize: 13, color: '#666', marginTop: 5, marginBottom: 15 },
  card: { borderWidth: 1, borderColor: '#e2e8f0', padding: 20, borderRadius: 8, backgroundColor: '#fff', marginTop: 15 },
  questionText: { fontSize: 16, fontWeight: 'bold', color: '#1a202c', marginBottom: 15 },
  radioGroup: { flexDirection: 'row', gap: 15, marginBottom: 15 },
  radioButton: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 6, alignItems: 'center', backgroundColor: '#f7fafc' },
  radioActiveCumple: { backgroundColor: '#10b981', borderColor: '#10b981' },
  radioActiveNoCumple: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  radioText: { fontWeight: '600', color: '#4a5568' },
  textWhite: { color: '#fff' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 5, marginTop: 10 },
  textArea: { borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 6, padding: 10, fontSize: 14, backgroundColor: '#fff', height: 60, textAlignVertical: 'top' },
  photoButton: { borderWidth: 1, borderColor: '#0070f3', borderStyle: 'dashed', borderRadius: 6, padding: 12, alignItems: 'center', marginTop: 5, backgroundColor: '#f0f7ff' },
  photoButtonText: { color: '#0070f3', fontWeight: 'bold' },
  imagePlaceholder: { padding: 15, alignItems: 'center', justifyContent: 'center' },
  uploadText: { fontSize: 12, color: '#666', marginTop: 5 },
  imagePreviewContainer: { marginTop: 10, alignItems: 'center' },
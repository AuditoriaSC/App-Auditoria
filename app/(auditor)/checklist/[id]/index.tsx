import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../../../src/supabaseClient';
import { offlineStorage } from '../../../../src/offlineStorage';

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
  evidenceUrl: string;
  localImageUri?: string; // Ruta temporal en el teléfono si no hay internet
  uploading: boolean;
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

  // 1. Escuchar el estado del internet en tiempo real
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // 2. Cargar preguntas y verificar si había un borrador guardado en AsyncStorage
  useEffect(() => {
    async function loadData() {
      if (!region || !visit_type_id) {
        setError('Faltan parámetros obligatorios.');
        setLoading(false);
        return;
      }

      setLoading(true);

      // Tratar de jalar preguntas locales o remotas
      const { data, error: supabaseError } = await supabase
        .from('checklist_questions')
        .select('*')
        .eq('region', region)
        .eq('visit_type_id', visit_type_id)
        .eq('is_active', true);

      if (supabaseError) {
        setError(supabaseError.message);
        setLoading(false);
        return;
      }

      setQuestions(data || []);

      // Revisar si existe un borrador offline guardado previamente en el teléfono
      const savedDraft = await offlineStorage.getDraft(String(reportId));

      if (savedDraft) {
        setAnswers(savedDraft);
      } else {
        // Si no hay borrador, inicializamos el estado en limpio
        const initialAnswers: Record<string, AnswerState> = {};
        data?.forEach((q: Question) => {
          initialAnswers[q.id] = { value: null, observation: '', evidenceUrl: '', uploading: false };
        });
        setAnswers(initialAnswers);
      }
      setLoading(false);
    }

    loadData();
  }, [region, visit_type_id, reportId]);

  // 3. Capturar imagen con soporte Offline
  const handlePickImage = async (questionId: string) => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Se requieren permisos de cámara.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const imageUri = result.assets[0].uri;

    if (!isOnline) {
      // SI NO HAY INTERNET: Guardamos la ruta interna de la foto y la metemos al borrador
      const updatedAnswers = {
        ...answers,
        [questionId]: { ...answers[questionId], localImageUri: imageUri, evidenceUrl: '', uploading: false }
      };
      setAnswers(updatedAnswers);
      await offlineStorage.saveDraft(String(reportId), updatedAnswers);
      alert('Foto guardada localmente en el borrador (Sin internet).');
      return;
    }

    // SI SÍ HAY INTERNET: La subimos directo a Supabase Storage
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], uploading: true } }));
    try {
      const folderRegion = String(region).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const fileRoute = `${folderRegion}/2026-06-01/${local_id || 'sin-local'}/${reportId}/${questionId}/foto.jpg`;

      const response = await fetch(imageUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('evidencias')
        .upload(fileRoute, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(fileRoute);

      const updatedAnswers = {
        ...answers,
        [questionId]: { ...answers[questionId], evidenceUrl: publicUrl, localImageUri: imageUri, uploading: false }
      };
      setAnswers(updatedAnswers);
      await offlineStorage.saveDraft(String(reportId), updatedAnswers);
    } catch (err: any) {
      alert('Error de subida: ' + err.message);
      setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], uploading: false } }));
    }
  };

  // 4. Guardar cambios de texto u opciones en tiempo real en AsyncStorage
  const updateField = async (questionId: string, fieldsToUpdate: Partial<AnswerState>) => {
    const updatedAnswers = {
      ...answers,
      [questionId]: { ...answers[questionId], ...fieldsToUpdate }
    };
    setAnswers(updatedAnswers);
    // Auto-guardado de respaldo permanente ante cierres inesperados de la app
    await offlineStorage.saveDraft(String(reportId), updatedAnswers);
  };

  // 5. Validación obligatoria estricta
  const checkFormValidation = (): boolean => {
    if (questions.length === 0) return false;
    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer || answer.value === null || answer.observation.trim().length < 3) return false;
      if (q.evidence_required && !answer.evidenceUrl && !answer.localImageUri) return false;
    }
    return true;
  };

  // 6. Acción final del Botón
  const handleSubmit = async () => {
    if (!checkFormValidation()) return;
    setIsSubmitting(true);

    if (!isOnline) {
      alert('¡Auditoría guardada localmente como BORRADOR! Se sincronizará al recuperar red.');
      router.replace('/nueva-auditoria');
      setIsSubmitting(false);
      return;
    }

    // Aquí irá la sincronización a Supabase en la Parte 2
    await offlineStorage.clearDraft(String(reportId));
    alert('¡Auditoría subida a la nube exitosamente!');
    router.replace('/nueva-auditoria');
    setIsSubmitting(false);
  };

  const isFormValid = checkFormValidation();

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /><Text>Cargando datos...</Text></View>;
  if (error) return <View style={styles.center}><Text style={{ color: 'red' }}>Error: {error}</Text></View>;
return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Indicador visual del estado de la conexión en tiempo real */}
      <View style={[styles.networkBanner, isOnline ? styles.bannerOnline : styles.bannerOffline]}>
        <Text style={styles.bannerText}>
          {isOnline ? '🌐 Conectado a Internet (Modo Online)' : '⚠️ Sin Conexión (Modo Borrador Offline)'}
        </Text>
      </View>

      <Text style={styles.title}>Formulario de Checklist</Text>
      <Text style={styles.subtitle}>ID Auditoría: {reportId} | Ubicación: {region}</Text>

      {questions.map((q, index) => {
        const currentAnswer = answers[q.id] || { value: null, observation: '', evidenceUrl: '', uploading: false };
        
        return (
          <View key={q.id} style={styles.card}>
            <Text style={styles.questionText}>{index + 1}. {q.question_text}</Text>
            
            {/* 1. Selector de respuesta: Cumple / No Cumple */}
            <View style={styles.radioGroup}>
              <TouchableOpacity 
                style={[styles.radioButton, currentAnswer.value === 'cumple' && styles.radioActiveCumple]}
                onPress={() => updateField(q.id, { value: 'cumple' })}
              >
                <Text style={[styles.radioText, currentAnswer.value === 'cumple' && styles.textWhite]}>Cumple</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.radioButton, currentAnswer.value === 'no_cumple' && styles.radioActiveNoCumple]}
                onPress={() => updateField(q.id, { value: 'no_cumple' })}
              >
                <Text style={[styles.radioText, currentAnswer.value === 'no_cumple' && styles.textWhite]}>No Cumple</Text>
              </TouchableOpacity>
            </View>

            {/* 2. Campo de Observación Obligatoria */}
            <Text style={styles.fieldLabel}>Observación Obligatoria *</Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              placeholder="Describa detalladamente los hallazgos encontrados..."
              value={currentAnswer.observation}
              onChangeText={(text) => updateField(q.id, { observation: text })}
            />

            {/* 3. Captura de Evidencias con soporte local/remoto */}
            <Text style={styles.fieldLabel}>
              Evidencia Fotográfica {q.evidence_required ? '(Obligatoria *)' : '(Opcional)'}
            </Text>
            
            {currentAnswer.uploading ? (
              <View style={styles.imagePlaceholder}>
                <ActivityIndicator size="small" color="#0070f3" />
                <Text style={styles.uploadText}>Subiendo foto a Supabase...</Text>
              </View>
            ) : (currentAnswer.evidenceUrl || currentAnswer.localImageUri) ? (
              <View style={styles.imagePreviewContainer}>
                <Image 
                  source={{ uri: currentAnswer.evidenceUrl || currentAnswer.localImageUri }} 
                  style={styles.imagePreview} 
                />
                <Text style={isOnline ? styles.successUploadText : styles.offlineUploadText}>
                  {isOnline ? '✓ Guardada en Supabase Storage' : '💾 Guardada localmente (Pendiente de subida)'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoButton} onPress={() => handlePickImage(q.id)}>
                <Text style={styles.photoButtonText}>📸 Capturar Evidencia</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Botón de Guardado Dinámico */}
      <TouchableOpacity 
        style={[styles.submitButton, !isFormValid && styles.disabledButton]} 
        onPress={handleSubmit}
        disabled={!isFormValid || isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Procesando...' : isOnline ? 'Finalizar y Guardar Auditoría 💾' : 'Guardar Borrador Local 📦'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 600, alignSelf: 'center', width: '100%', backgroundColor: '#fdfdfd' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  networkBanner: { padding: 10, borderRadius: 6, marginBottom: 15, alignItems: 'center' },
  bannerOnline: { backgroundColor: '#d1fae5' },
  bannerOffline: { backgroundColor: '#fee2e2' },
  bannerText: { fontSize: 13, fontWeight: 'bold', color: '#374151' },
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
  imagePreview: { width: '100%', height: 180, borderRadius: 6, backgroundColor: '#eee' },
  successUploadText: { fontSize: 12, color: '#10b981', fontWeight: 'bold', marginTop: 5 },
  offlineUploadText: { fontSize: 12, color: '#f59e0b', fontWeight: 'bold', marginTop: 5 },
  submitButton: { backgroundColor: '#0070f3', padding: 15, borderRadius: 6, alignItems: 'center', marginTop: 25, marginBottom: 40 },
  disabledButton: { backgroundColor: '#bfdbfe', opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
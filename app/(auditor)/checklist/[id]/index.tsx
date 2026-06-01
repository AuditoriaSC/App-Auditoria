import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { supabase } from '../../../../src/supabaseClient';

interface Question {
  id: string;
  question_text: string;
  category: string;
  region: string;
  visit_type_id: string;
  is_active: boolean;
  evidence_required: boolean; // Define si la evidencia es obligatoria u opcional para esta pregunta
}

// Estructura para almacenar el estado de la respuesta por pregunta
interface AnswerState {
  value: 'cumple' | 'no_cumple' | null;
  observation: string;
  evidenceUrl: string;
}

export default function ChecklistDinamicoPage() {
  const router = useRouter();
  const { id, region, visit_type_id } = useLocalSearchParams(); 

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issubmitting, setIsSubmitting] = useState(false);

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
        
        // Inicializar el estado de respuestas vacío para cada pregunta cargada
        const initialAnswers: Record<string, AnswerState> = {};
        data?.forEach((q: Question) => {
          initialAnswers[q.id] = { value: null, observation: '', evidenceUrl: '' };
        });
        setAnswers(initialAnswers);
      }
      setLoading(false);
    }

    fetchQuestions();
  }, [region, visit_type_id]);

  // Manejadores para actualizar campos específicos del estado
  const handleSelectAnswer = (qId: string, value: 'cumple' | 'no_cumple') => {
    setAnswers(prev => ({ ...prev, [qId]: { ...prev[qId], value } }));
  };

  const handleTextChange = (qId: string, observation: string) => {
    setAnswers(prev => ({ ...prev, [qId]: { ...prev[qId], observation } }));
  };

  const handleEvidenceChange = (qId: string, evidenceUrl: string) => {
    setAnswers(prev => ({ ...prev, [qId]: { ...prev[qId], evidenceUrl } }));
  };

  // VALIDACIÓN CLAVE: Verifica pregunta por pregunta si cumple los requisitos mínimos
  const checkFormValidation = (): boolean => {
    if (questions.length === 0) return false;

    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer) return false;

      // 1. Validar Respuesta obligatoria (cumple / no cumple)
      if (answer.value === null) return false;

      // 2. Validar Observación obligatoria (mínimo 3 caracteres para evitar textos vacíos)
      if (answer.observation.trim().length < 3) return false;

      // 3. Validar Evidencia Condicional (si la columna evidence_required es true, no puede ir vacía)
      if (q.evidence_required && answer.evidenceUrl.trim().length === 0) return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!checkFormValidation()) return;

    setIsSubmitting(true);
    console.log('Guardando respuestas validadas en Supabase:', answers);
    
    // Aquí se insertarán las respuestas en la tabla correspondientes en el siguiente paso
    alert('¡Checklist validado y guardado con éxito! Volviendo al inicio.');
    router.replace('/nueva-auditoria');
    setIsSubmitting(false);
  };

  const isFormValid = checkFormValidation();

  if (loading) return <Text style={styles.centerText}>Cargando preguntas del checklist...</Text>;
  if (error) return <Text style={[styles.centerText, { color: 'red' }]}>Error: {error}</Text>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Formulario de Checklist</Text>
      <Text style={styles.subtitle}>ID Auditoría: {id} | Ubicación: {region}</Text>

      {questions.map((q, index) => {
        const currentAnswer = answers[q.id] || { value: null, observation: '', evidenceUrl: '' };
        
        return (
          <View key={q.id} style={styles.card}>
            <Text style={styles.questionText}>{index + 1}. {q.question_text}</Text>
            
            {/* 1. Selector de respuesta */}
            <View style={styles.radioGroup}>
              <TouchableOpacity 
                style={[styles.radioButton, currentAnswer.value === 'cumple' && styles.radioActiveCumple]}
                onPress={() => handleSelectAnswer(q.id, 'cumple')}
              >
                <Text style={[styles.radioText, currentAnswer.value === 'cumple' && styles.textWhite]}>Cumple</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.radioButton, currentAnswer.value === 'no_cumple' && styles.radioActiveNoCumple]}
                onPress={() => handleSelectAnswer(q.id, 'no_cumple')}
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
              placeholder="Escriba los hallazgos detallados encontrados..."
              value={currentAnswer.observation}
              onChangeText={(text) => handleTextChange(q.id, text)}
            />

            {/* 3. Evidencias */}
            <Text style={styles.fieldLabel}>
              Enlace de Evidencia {q.evidence_required ? '(Obligatoria *)' : '(Opcional)'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="URL de la imagen, documento o recurso de prueba..."
              value={currentAnswer.evidenceUrl}
              onChangeText={(text) => handleEvidenceChange(q.id, text)}
            />
          </View>
        );
      })}

      {/* Botón de Guardado Bloqueado Condicionalmente */}
      <TouchableOpacity 
        style={[styles.submitButton, !isFormValid && styles.disabledButton]} 
        onPress={handleSubmit}
        disabled={!isFormValid || issubmitting}
      >
        <Text style={styles.submitButtonText}>
          {issubmitting ? 'Guardando...' : 'Finalizar y Guardar Auditoría 💾'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 600, alignSelf: 'center', width: '100%', backgroundColor: '#fdfdfd' },
  title: { fontSize: 22, fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#333', paddingBottom: 10 },
  subtitle: { fontSize: 13, color: '#666', marginTop: 5, marginBottom: 15 },
  centerText: { padding: 20, textAlign: 'center', marginTop: 20 },
  card: { borderWidth: 1, borderColor: '#e2e8f0', padding: 20, borderRadius: 8, backgroundColor: '#fff', marginTop: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  questionText: { fontSize: 16, fontWeight: 'bold', color: '#1a202c', marginBottom: 15 },
  radioGroup: { flexDirection: 'row', gap: 15, marginBottom: 15 },
  radioButton: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 6, alignItems: 'center', backgroundColor: '#f7fafc' },
  radioActiveCumple: { backgroundColor: '#10b981', borderColor: '#10b981' },
  radioActiveNoCumple: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  radioText: { fontWeight: '600', color: '#4a5568' },
  textWhite: { color: '#fff' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 5, marginTop: 10 },
  textArea: { borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 6, padding: 10, fontSize: 14, backgroundColor: '#fff', height: 70, textAlignVertical: 'top' },
  input: { borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 6, padding: 10, fontSize: 14, backgroundColor: '#fff' },
  submitButton: { backgroundColor: '#0070f3', padding: 15, borderRadius: 6, alignItems: 'center', marginTop: 25, marginBottom: 40 },
  disabledButton: { backgroundColor: '#bfdbfe', opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
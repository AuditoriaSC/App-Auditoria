import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
// IMPORTACIÓN CORRECTA desde la carpeta src
import { supabase } from '../../../../src/supabaseClient';

interface Question {
  id: string;
  question_text: string;
  category: string;
  region: string;
  visit_type_id: string;
  is_active: boolean;
}

export default function ChecklistDinamicoPage() {
  const { id, region, visit_type_id } = useLocalSearchParams(); 

  const [questions, setQuestions] = useState<Question[]>([]);
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
      }
      setLoading(false);
    }

    fetchQuestions();
  }, [region, visit_type_id]);

  if (loading) return <Text style={styles.centerText}>Cargando preguntas del checklist...</Text>;
  if (error) return <Text style={[styles.centerText, { color: 'red' }]}>Error: {error}</Text>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Checklist de Auditoría</Text>
      <Text style={styles.subtitle}>ID: {id} | Región: {region}</Text>

      {questions.length === 0 ? (
        <Text style={styles.noQuestions}>No se encontraron preguntas activas.</Text>
      ) : (
        questions.map((q, index) => (
          <View key={q.id} style={styles.card}>
            <Text style={styles.questionText}>{index + 1}. {q.question_text}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 600, alignSelf: 'center', width: '100%' },
  title: { fontSize: 22, fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#333', paddingBottom: 10 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 5 },
  centerText: { padding: 20, textAlign: 'center' },
  noQuestions: { marginTop: 20, color: '#999', textAlign: 'center' },
  card: { borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 6, backgroundColor: '#f9f9f9', marginTop: 15 },
  questionText: { fontWeight: 'bold' }
});
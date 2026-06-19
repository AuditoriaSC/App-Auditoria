import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../../../src/supabaseClient';

interface Question {
  id: string;
  question_text: string;
  category?: string;
  region: string;
  visit_type_id: string;
  is_active: boolean;
  score_points: number; // Columna para los puntajes/ponderación de la pregunta
  evidence_required: boolean;
}

export default function GestionPreguntasPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el Formulario (Crear / Editar)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [regionSelected, setRegionSelected] = useState('');
  const [visitType, setVisitType] = useState('Sabatina');
  const [score, setScore] = useState('1');
  const [evidenceRequired, setEvidenceRequired] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('checklist_questions')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (!error && data) setQuestions(data);
    setLoading(false);
  };

  // ACCIÓN: Crear o Actualizar Pregunta
  const handleSaveQuestion = async () => {
    if (!text.trim() || !regionSelected.trim()) {
      alert('Por favor completa todos los campos obligatorios.');
      return;
    }

    const payload = {
      question_text: text,
      region: regionSelected,
      visit_type_id: visitType,
      score_points: parseFloat(score) || 1,
      evidence_required: evidenceRequired,
    };

    if (editingId) {
      // Editar existente
      const { error } = await supabase
        .from('checklist_questions')
        .update(payload)
        .eq('id', editingId);
        
      if (error) alert(error.message);
      else setEditingId(null);
    } else {
      // Crear nueva pregunta
      const { error } = await supabase
        .from('checklist_questions')
        .insert([{ ...payload, is_active: true }]);
        
      if (error) alert(error.message);
    }

    // Resetear formulario y recargar
    setText('');
    setRegionSelected('');
    setScore('1');
    setEvidenceRequired(false);
    fetchQuestions();
  };

  // ACCIÓN: Alternar estado Activo / Desactivado (Switch)
  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('checklist_questions')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      alert(error.message);
    } else {
      setQuestions(prev =>
        prev.map(q => (q.id === id ? { ...q, is_active: !currentStatus } : q))
      );
    }
  };

  // Cargar datos en el formulario para editar
  const startEdit = (q: Question) => {
    setEditingId(q.id);
    setText(q.question_text);
    setRegionSelected(q.region);
    setVisitType(q.visit_type_id);
    setScore(String(q.score_points));
    setEvidenceRequired(q.evidence_required);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Panel Admin - Checklist</Text>
      
      {/* SECCIÓN DEL FORMULARIO */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{editingId ? '📝 Editar Pregunta' : '➕ Nueva Pregunta'}</Text>
        
        <TextInput 
          style={styles.input} 
          placeholder="Texto de la pregunta *" 
          value={text} 
          onChangeText={setText}
        />
        <TextInput 
          style={styles.input} 
          placeholder="Región Geográfica (Costa, Sierra o Global) *" 
          value={regionSelected} 
          onChangeText={setRegionSelected}
        />

        <Text style={styles.miniLabel}>Tipo de visita</Text>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={visitType} onValueChange={(value) => setVisitType(value)}>
            <Picker.Item label="Sabatina" value="Sabatina" />
            <Picker.Item label="Nocturna" value="Nocturna" />
          </Picker>
        </View>
        
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>Puntaje / Ponderación</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric" 
              value={score} 
              onChangeText={setScore}
            />
          </View>
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.miniLabel}>Requiere evidencia fotográfica</Text>
          <Switch value={evidenceRequired} onValueChange={setEvidenceRequired} />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveQuestion}>
          <Text style={styles.saveButtonText}>{editingId ? 'Guardar Cambios' : 'Crear Pregunta'}</Text>
        </TouchableOpacity>
        
        {editingId && (
          <TouchableOpacity style={styles.cancelButton} onPress={() => { setEditingId(null); setText(''); }}>
            <Text style={styles.cancelButtonText}>Cancelar Edición</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* LISTADO DE PREGUNTAS */}
      <Text style={styles.sectionSubtitle}>Listado de Preguntas del Sistema</Text>
      {questions.map((q) => (
        <View key={q.id} style={[styles.qCard, !q.is_active && styles.disabledCard]}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.qText}>{q.question_text}</Text>
            <Text style={styles.qMeta}>Región: {q.region} | Visita: {q.visit_type_id} | Ptos: {q.score_points}</Text>
          </View>
          
          <View style={styles.actionColumn}>
            <Text style={styles.statusText}>{q.is_active ? 'Activa' : 'Inactiva'}</Text>
            <Switch 
              value={q.is_active} 
              onValueChange={() => handleToggleActive(q.id, q.is_active)} 
            />
            <TouchableOpacity style={styles.editButton} onPress={() => startEdit(q)}>
              <Text style={styles.editButtonText}>Editar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 650, alignSelf: 'center', width: '100%', backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },
  sectionSubtitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 25, marginBottom: 10 },
  formCard: { backgroundColor: '#fff', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  formTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 10, fontSize: 14, marginBottom: 10, backgroundColor: '#fff' },
  pickerContainer: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', marginBottom: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  miniLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  saveButton: { backgroundColor: '#0070f3', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 5 },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
  cancelButton: { padding: 10, alignItems: 'center', marginTop: 5 },
  cancelButtonText: { color: '#ef4444', fontSize: 13 },
  qCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 10, alignItems: 'center' },
  disabledCard: { backgroundColor: '#f1f5f9', opacity: 0.7 },
  qText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  qMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  actionColumn: { alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  editButton: { marginTop: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#f1f5f9', borderRadius: 4 },
  editButtonText: { fontSize: 12, color: '#0070f3', fontWeight: '600' }
});

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/supabaseClient';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type QuestionRow = {
  id: string;
  question_text: string;
  region: string;
  visit_type_id: string;
  score_points: number;
  is_active: boolean;
  question_type: string | null;
  is_scored: boolean | null;
  sort_order: number | null;
  created_at: string | null;
};

const allOption = 'TODOS';
const regions = ['TODAS', 'Costa', 'Sierra', 'Global'];
const visitTypes = ['TODOS', 'Sabatina', 'Nocturna'];
const questionTypes = ['TODOS', 'compliance', 'cash_count', 'pending_deposit', 'cup_count', 'raw_material_count', 'follow_up', 'additional_novelty'];

export default function GestionPreguntasPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visitFilter, setVisitFilter] = useState(allOption);
  const [regionFilter, setRegionFilter] = useState(allOption);
  const [typeFilter, setTypeFilter] = useState(allOption);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    question_text: '',
    score_points: '1',
    sort_order: '',
    question_type: 'compliance',
  });

  useEffect(() => {
    loadData();
  }, []);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isSuperAdmin = profile?.role === 'super_admin' || profile?.region === 'Global';

  const goToDashboard = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };

  const filteredQuestions = useMemo(() => {
    const term = normalize(search);
    return questions.filter((question) => {
      const matchesSearch = !term || normalize(question.question_text).includes(term);
      const matchesVisit = visitFilter === allOption || question.visit_type_id === visitFilter;
      const matchesRegion = regionFilter === allOption || question.region === regionFilter;
      const matchesType = typeFilter === allOption || (question.question_type || 'compliance') === typeFilter;
      return matchesSearch && matchesVisit && matchesRegion && matchesType;
    });
  }, [questions, regionFilter, search, typeFilter, visitFilter]);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar la sesion.');
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role, region')
      .eq('id', user.id)
      .single<ProfileRow>();

    if (profileError || !profileData) {
      setMessage('No se encontro el perfil del usuario.');
      setLoading(false);
      return;
    }

    setProfile(profileData);
    if (profileData.role === 'auditor') {
      setMessage('No tienes permisos para administrar preguntas.');
      setLoading(false);
      return;
    }

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      setRegionFilter(profileData.region);
    }

    let query = supabase
      .from('checklist_questions')
      .select('id, question_text, region, visit_type_id, score_points, is_active, question_type, is_scored, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      query = query.eq('region', profileData.region);
    }

    const { data, error } = await query;

    if (error) {
      setMessage('No se pudieron cargar las preguntas.');
    } else {
      setQuestions((data || []) as QuestionRow[]);
    }

    setLoading(false);
  };

  const startEdit = (question: QuestionRow) => {
    setEditingId(question.id);
    setDraft({
      question_text: question.question_text,
      score_points: String(question.score_points ?? 0),
      sort_order: question.sort_order === null || question.sort_order === undefined ? '' : String(question.sort_order),
      question_type: question.question_type || 'compliance',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ question_text: '', score_points: '1', sort_order: '', question_type: 'compliance' });
  };

  const saveQuestion = async (question: QuestionRow) => {
    if (!editingId || editingId !== question.id) return;
    if (!draft.question_text.trim()) {
      setMessage('La pregunta necesita texto.');
      return;
    }

    const score = Number(String(draft.score_points).replace(',', '.'));
    const sortOrder = draft.sort_order.trim() ? Number(draft.sort_order) : null;

    if (Number.isNaN(score) || Number.isNaN(sortOrder ?? 0)) {
      setMessage('Revisa puntaje y posicion. Deben ser valores numericos.');
      return;
    }

    setSavingId(question.id);
    setMessage(null);

    const payload = {
      question_text: draft.question_text.trim(),
      score_points: question.is_scored === false ? question.score_points : score,
      sort_order: sortOrder,
      question_type: draft.question_type,
    };

    const { error } = await supabase
      .from('checklist_questions')
      .update(payload)
      .eq('id', question.id);

    if (error) {
      setMessage('No se pudo guardar la pregunta. Revisa permisos o datos ingresados.');
    } else {
      setQuestions((current) =>
        current
          .map((item) => (item.id === question.id ? { ...item, ...payload } : item))
          .sort(compareQuestions),
      );
      cancelEdit();
      setMessage('Pregunta actualizada.');
    }

    setSavingId(null);
  };

  const toggleQuestion = async (question: QuestionRow) => {
    const action = question.is_active ? 'desactivar' : 'activar';
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Quieres ${action} esta pregunta?`);
    if (!confirmed) return;

    setSavingId(question.id);
    setMessage(null);

    const { error } = await supabase
      .from('checklist_questions')
      .update({ is_active: !question.is_active })
      .eq('id', question.id);

    if (error) {
      setMessage('No se pudo cambiar el estado de la pregunta.');
    } else {
      setQuestions((current) =>
        current.map((item) => (item.id === question.id ? { ...item, is_active: !question.is_active } : item)),
      );
    }

    setSavingId(null);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando preguntas...</Text>
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

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Preguntas</Text>
          <Text style={styles.subtitle}>Edita texto, puntaje, posicion y estado sin cambiar el orden por fecha de edicion.</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.filterBand}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por texto de pregunta"
          placeholderTextColor="#94a3b8"
        />
        <View style={styles.filterRow}>
          <SelectField label="Tipo de visita" value={visitFilter} onChange={setVisitFilter} options={visitTypes} />
          {isSuperAdmin && <SelectField label="Region" value={regionFilter} onChange={setRegionFilter} options={regions} />}
          <SelectField label="Tipo pregunta" value={typeFilter} onChange={setTypeFilter} options={questionTypes} />
        </View>
      </View>

      {filteredQuestions.map((question) => {
        const editing = editingId === question.id;
        const scoreEditable = question.is_scored !== false;
        return (
          <View key={question.id} style={[styles.card, !question.is_active && styles.disabledCard]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleArea}>
                {editing ? (
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    multiline
                    value={draft.question_text}
                    onChangeText={(value) => setDraft((current) => ({ ...current, question_text: value }))}
                  />
                ) : (
                  <Text style={styles.questionText}>{question.question_text}</Text>
                )}
                <Text style={styles.meta}>
                  {question.region} · {question.visit_type_id} · {question.question_type || 'compliance'} · Pos. {question.sort_order ?? '-'}
                </Text>
              </View>
              <View style={styles.statusColumn}>
                <Text style={styles.statusText}>{question.is_active ? 'Activa' : 'Inactiva'}</Text>
                <Switch value={question.is_active} onValueChange={() => toggleQuestion(question)} disabled={savingId === question.id} />
              </View>
            </View>

            {editing && (
              <View style={styles.editGrid}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Puntaje asignado</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.score_points}
                    onChangeText={(value) => setDraft((current) => ({ ...current, score_points: value }))}
                    editable={scoreEditable}
                    keyboardType="numeric"
                    placeholder="Ej: 1.00"
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Posicion en checklist</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.sort_order}
                    onChangeText={(value) => setDraft((current) => ({ ...current, sort_order: value }))}
                    keyboardType="numeric"
                    placeholder="Ej: 10"
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Tipo de pregunta</Text>
                  <View style={styles.pickerShell}>
                    <Picker
                      selectedValue={draft.question_type}
                      onValueChange={(value) => setDraft((current) => ({ ...current, question_type: String(value) }))}
                      style={styles.picker}
                    >
                      {questionTypes.filter((item) => item !== allOption).map((type) => (
                        <Picker.Item key={type} label={formatQuestionType(type)} value={type} />
                      ))}
                    </Picker>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.cardActions}>
              {editing ? (
                <>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => saveQuestion(question)} disabled={savingId === question.id}>
                    <Text style={styles.primaryButtonText}>{savingId === question.id ? 'Guardando...' : 'Guardar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={cancelEdit}>
                    <Text style={styles.secondaryButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.secondaryButton} onPress={() => startEdit(question)}>
                  <Text style={styles.secondaryButtonText}>Editar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <View style={styles.filterItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerShell}>
        <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
          {options.map((option) => (
            <Picker.Item key={option} label={formatOption(option)} value={option} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function compareQuestions(left: QuestionRow, right: QuestionRow) {
  return Number(left.sort_order ?? 999999) - Number(right.sort_order ?? 999999)
    || String(left.created_at || '').localeCompare(String(right.created_at || ''));
}

function formatOption(value: string) {
  if (value === 'TODOS') return 'Todos';
  if (value === 'TODAS') return 'Todas';
  return formatQuestionType(value);
}

function formatQuestionType(value: string) {
  return value.replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 36, backgroundColor: '#f3f6f8', width: '100%', maxWidth: 980, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 8, color: '#64748b' },
  errorText: { color: '#b91c1c', fontWeight: '800', marginBottom: 12 },
  header: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 18, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  title: { fontSize: 25, fontWeight: '900', color: '#111827' },
  subtitle: { marginTop: 4, color: '#64748b', fontWeight: '600', lineHeight: 18 },
  message: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 8, padding: 12, marginBottom: 14, color: '#9a3412', fontWeight: '800' },
  filterBand: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 12, marginBottom: 14, gap: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filterItem: { flex: 1, minWidth: 170 },
  label: { fontSize: 12, fontWeight: '900', color: '#475569', marginBottom: 6 },
  searchInput: { minHeight: 44, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff', color: '#111827', fontWeight: '700' },
  pickerShell: { height: 44, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, overflow: 'hidden', backgroundColor: '#f8fafc', justifyContent: 'center' },
  picker: { height: 44, color: '#111827', fontWeight: '700', backgroundColor: '#f8fafc' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 14, marginBottom: 10 },
  disabledCard: { opacity: 0.65, backgroundColor: '#f8fafc' },
  cardHeader: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  cardTitleArea: { flex: 1 },
  questionText: { color: '#111827', fontWeight: '900', fontSize: 15, lineHeight: 20 },
  meta: { marginTop: 5, color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  statusColumn: { alignItems: 'center' },
  statusText: { color: '#475569', fontWeight: '900', fontSize: 11 },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  fieldGroup: { flex: 1, minWidth: 150 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff', color: '#111827', fontWeight: '700', flex: 1, minWidth: 130 },
  textArea: { minHeight: 84, paddingTop: 10 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '900' },
  secondaryButton: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#334155', fontWeight: '900' },
});

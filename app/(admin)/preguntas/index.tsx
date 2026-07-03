import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
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
  numeric_mode: string | null;
  item_schema: CountSchemaItem[] | null;
};

type CountSchemaItem = {
  label: string;
  unit?: string;
  cross_group?: string;
  conversion_factor?: number;
};

type QuestionDraft = {
  question_text: string;
  score_points: string;
  sort_order: string;
  question_type: string;
  visit_type_id: string;
  region: string;
  is_active: boolean;
  item_schema: Array<{ label: string; unit: string; cross_group: string; conversion_factor: string }>;
};

const allOption = 'TODOS';
const regions = ['TODAS', 'Costa', 'Sierra', 'Global'];
const visitTypes = ['TODOS', 'Sabatina', 'Nocturna'];
const questionTypes = ['TODOS', 'compliance', 'cash_count', 'pending_deposit', 'inventory', 'cup_count', 'raw_material_count', 'follow_up', 'additional_novelty'];

function emptyDraft(region = 'Costa'): QuestionDraft {
  return {
    question_text: '',
    score_points: '1',
    sort_order: '',
    question_type: 'compliance',
    visit_type_id: 'Sabatina',
    region,
    is_active: true,
    item_schema: [],
  };
}

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
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft>(emptyDraft());

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
      .select('id, question_text, region, visit_type_id, score_points, is_active, question_type, is_scored, sort_order, created_at, numeric_mode, item_schema')
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
      visit_type_id: question.visit_type_id,
      region: question.region,
      is_active: question.is_active,
      item_schema: (question.item_schema || []).map((item) => ({
        label: item.label || '',
        unit: item.unit || '',
        cross_group: item.cross_group || '',
        conversion_factor: String(item.conversion_factor ?? 1),
      })),
    });
    setCreating(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft(profile?.region || 'Costa'));
  };

  const startCreate = () => {
    const defaultRegion = isSuperAdmin ? 'Costa' : profile?.region || 'Costa';
    setEditingId(null);
    setDraft(emptyDraft(defaultRegion));
    setCreating(true);
    setMessage(null);
  };

  const buildQuestionPayload = () => {
    const score = Number(String(draft.score_points).replace(',', '.'));
    const sortOrder = draft.sort_order.trim() ? Number(draft.sort_order) : null;
    const countType = isCountType(draft.question_type);
    const scored = !['follow_up', 'additional_novelty', 'inventory', 'raw_material_count'].includes(draft.question_type);
    const itemSchema = countType
      ? draft.item_schema.map((item) => ({
          label: item.label.trim(),
          ...(item.unit.trim() ? { unit: item.unit.trim() } : {}),
          ...(draft.question_type === 'raw_material_count' && item.cross_group.trim() ? { cross_group: item.cross_group.trim() } : {}),
          ...(draft.question_type === 'raw_material_count' ? { conversion_factor: Number(String(item.conversion_factor || '1').replace(',', '.')) } : {}),
        })).filter((item) => item.label)
      : [];

    if (!draft.question_text.trim()) throw new Error('La pregunta necesita texto.');
    if (!draft.visit_type_id || !draft.region) throw new Error('Selecciona tipo de visita y region.');
    if (Number.isNaN(score) || Number.isNaN(sortOrder ?? 0)) throw new Error('Revisa puntaje y posicion. Deben ser valores numericos.');
    if (countType && itemSchema.length === 0) throw new Error('Agrega al menos un item de conteo.');
    if (itemSchema.some((item) => 'conversion_factor' in item && !Number.isFinite(item.conversion_factor))) {
      throw new Error('Los factores de conversion deben ser numericos.');
    }

    return {
      question_text: draft.question_text.trim(),
      score_points: scored ? score : 0,
      sort_order: sortOrder,
      question_type: draft.question_type,
      visit_type_id: draft.visit_type_id,
      region: isSuperAdmin ? draft.region : profile?.region || draft.region,
      is_active: draft.is_active,
      is_scored: scored,
      numeric_mode: countType ? 'multi_item_difference' : null,
      item_schema: itemSchema,
    };
  };

  const createQuestion = async () => {
    try {
      const payload = buildQuestionPayload();
      setSavingId('new');
      setMessage(null);
      const { data, error } = await supabase
        .from('checklist_questions')
        .insert(payload)
        .select('id, question_text, region, visit_type_id, score_points, is_active, question_type, is_scored, sort_order, created_at, numeric_mode, item_schema')
        .single<QuestionRow>();

      if (error || !data) throw error || new Error('No se devolvio la pregunta creada.');
      setQuestions((current) => [...current, data].sort(compareQuestions));
      cancelEdit();
      setMessage('Pregunta creada correctamente.');
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : 'No se pudo crear la pregunta. Revisa permisos o datos ingresados.');
    } finally {
      setSavingId(null);
    }
  };

  const saveQuestion = async (question: QuestionRow) => {
    if (!editingId || editingId !== question.id) return;
    let payload;
    try {
      payload = buildQuestionPayload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Revisa los datos ingresados.');
      return;
    }

    setSavingId(question.id);
    setMessage(null);

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Preguntas</Text>
          <Text style={styles.subtitle}>Edita texto, puntaje, posicion y estado sin cambiar el orden por fecha de edicion.</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={startCreate}>
            <Text style={styles.primaryButtonText}>Nueva pregunta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
            <Text style={styles.secondaryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
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

      {creating && (
        <View style={[styles.card, styles.createCard]}>
          <Text style={styles.formTitle}>Crear pregunta</Text>
          <QuestionForm draft={draft} setDraft={setDraft} canChooseRegion={isSuperAdmin} />
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={createQuestion} disabled={savingId === 'new'}>
              <Text style={styles.primaryButtonText}>{savingId === 'new' ? 'Creando...' : 'Crear pregunta'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={cancelEdit}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {filteredQuestions.map((question) => {
        const editing = editingId === question.id;
        return (
          <View key={question.id} style={[styles.card, !question.is_active && styles.disabledCard]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleArea}>
                {editing ? (
                  <TextInput
                    style={[styles.input, styles.questionEditInput]}
                    multiline
                    numberOfLines={2}
                    scrollEnabled
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

            {editing && <QuestionForm draft={draft} setDraft={setDraft} canChooseRegion={isSuperAdmin} showQuestionText={false} />}

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

function QuestionForm({
  draft,
  setDraft,
  canChooseRegion,
  scoreEditable = true,
  showQuestionText = true,
}: {
  draft: QuestionDraft;
  setDraft: React.Dispatch<React.SetStateAction<QuestionDraft>>;
  canChooseRegion: boolean;
  scoreEditable?: boolean;
  showQuestionText?: boolean;
}) {
  const countType = isCountType(draft.question_type);
  const scored = !['follow_up', 'additional_novelty', 'inventory', 'raw_material_count'].includes(draft.question_type);

  const updateItem = (index: number, field: 'label' | 'unit' | 'cross_group' | 'conversion_factor', value: string) => {
    setDraft((current) => ({
      ...current,
      item_schema: current.item_schema.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.item_schema.length) return current;
      const items = [...current.item_schema];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, item_schema: items };
    });
  };

  return (
    <View style={styles.formBody}>
      {showQuestionText && (
        <View style={styles.fullField}>
          <Text style={styles.label}>Texto de la pregunta</Text>
          <TextInput
            style={[styles.input, styles.questionEditInput]}
            multiline
            value={draft.question_text}
            onChangeText={(value) => setDraft((current) => ({ ...current, question_text: value }))}
            placeholder="Escribe la pregunta"
            placeholderTextColor={brandColors.inputPlaceholder}
          />
        </View>
      )}

      <View style={styles.editGrid}>
        <CompactPicker
          label="Tipo de pregunta"
          value={draft.question_type}
          options={questionTypes.filter((item) => item !== allOption)}
          onChange={(value) => setDraft((current) => ({
            ...current,
            question_type: value,
            score_points: ['follow_up', 'additional_novelty', 'inventory', 'raw_material_count'].includes(value) ? '0' : current.score_points,
            item_schema: isCountType(value) ? current.item_schema : [],
          }))}
        />
        <CompactPicker label="Tipo de visita" value={draft.visit_type_id} options={visitTypes.filter((item) => item !== allOption)} onChange={(value) => setDraft((current) => ({ ...current, visit_type_id: value }))} />
        <CompactPicker label="Region" value={draft.region} options={regions.filter((item) => item !== 'TODAS')} onChange={(value) => setDraft((current) => ({ ...current, region: value }))} disabled={!canChooseRegion} />
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Puntaje asignado</Text>
          <TextInput style={styles.editInput} value={draft.score_points} onChangeText={(value) => setDraft((current) => ({ ...current, score_points: value }))} editable={scoreEditable && scored} keyboardType="numeric" placeholder="Ej: 1.00" placeholderTextColor={brandColors.inputPlaceholder} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Posicion en checklist</Text>
          <TextInput style={styles.editInput} value={draft.sort_order} onChangeText={(value) => setDraft((current) => ({ ...current, sort_order: value }))} keyboardType="numeric" placeholder="Ej: 10" placeholderTextColor={brandColors.inputPlaceholder} />
        </View>
        <View style={styles.activeField}>
          <Text style={styles.label}>Estado</Text>
          <View style={styles.activeRow}><Text style={styles.activeText}>{draft.is_active ? 'Activa' : 'Inactiva'}</Text><Switch value={draft.is_active} onValueChange={(value) => setDraft((current) => ({ ...current, is_active: value }))} /></View>
        </View>
      </View>

      {countType && (
        <View style={styles.schemaSection}>
          <Text style={styles.schemaTitle}>Configuracion del conteo</Text>
          <Text style={styles.schemaHelp}>Las columnas Sistema, Fisico y Diferencia son fijas. Configura las filas en el orden en que deben mostrarse.</Text>
          {draft.item_schema.map((item, index) => (
            <View key={index} style={styles.schemaItem}>
              <Text style={styles.schemaOrder}>{index + 1}</Text>
              <TextInput style={[styles.editInput, styles.schemaLabelInput]} value={item.label} onChangeText={(value) => updateItem(index, 'label', value)} placeholder="Etiqueta" placeholderTextColor={brandColors.inputPlaceholder} />
              <TextInput style={[styles.editInput, styles.schemaSmallInput]} value={item.unit} onChangeText={(value) => updateItem(index, 'unit', value)} placeholder="Unidad" placeholderTextColor={brandColors.inputPlaceholder} />
              {draft.question_type === 'raw_material_count' && (
                <>
                  <TextInput style={[styles.editInput, styles.schemaGroupInput]} value={item.cross_group} onChangeText={(value) => updateItem(index, 'cross_group', value)} placeholder="cross_group opcional" placeholderTextColor={brandColors.inputPlaceholder} />
                  <TextInput style={[styles.editInput, styles.schemaFactorInput]} value={item.conversion_factor} onChangeText={(value) => updateItem(index, 'conversion_factor', value)} placeholder="Factor" keyboardType="numeric" placeholderTextColor={brandColors.inputPlaceholder} />
                </>
              )}
              <View style={styles.schemaActions}>
                <TouchableOpacity style={styles.iconButton} onPress={() => moveItem(index, -1)} disabled={index === 0}><Text style={styles.iconButtonText}>↑</Text></TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => moveItem(index, 1)} disabled={index === draft.item_schema.length - 1}><Text style={styles.iconButtonText}>↓</Text></TouchableOpacity>
                <TouchableOpacity style={styles.removeButton} onPress={() => setDraft((current) => ({ ...current, item_schema: current.item_schema.filter((_, itemIndex) => itemIndex !== index) }))}><Text style={styles.removeButtonText}>Quitar</Text></TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setDraft((current) => ({ ...current, item_schema: [...current.item_schema, { label: '', unit: '', cross_group: '', conversion_factor: '1' }] }))}>
            <Text style={styles.secondaryButtonText}>Agregar item</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function CompactPicker({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.editPickerShell, disabled && styles.disabledPicker]}>
        <Picker enabled={!disabled} selectedValue={value} onValueChange={(item) => onChange(String(item))} style={styles.editPicker} dropdownIconColor={brandColors.greenDark}>
          {options.map((option) => <Picker.Item key={option} label={formatOption(option)} value={option} />)}
        </Picker>
      </View>
    </View>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <View style={styles.filterItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerShell}>
        <Picker selectedValue={value} onValueChange={onChange} style={styles.picker} dropdownIconColor={brandColors.greenDark}>
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

function isCountType(value: string) {
  return ['inventory', 'cup_count', 'raw_material_count'].includes(value);
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
  screen: { flex: 1, backgroundColor: brandColors.greenDark },
  container: { padding: 18, paddingBottom: 36, backgroundColor: brandColors.background, width: '100%', maxWidth: 980, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  errorText: { color: brandColors.danger, fontWeight: '800', marginBottom: 12 },
  header: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 18, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 25, fontWeight: '900', color: brandColors.textPrimary },
  subtitle: { marginTop: 4, color: brandColors.textSecondary, fontWeight: '600', lineHeight: 18 },
  message: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, padding: 12, marginBottom: 14, color: brandColors.coffeeDark, fontWeight: '800' },
  filterBand: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 12, marginBottom: 14, gap: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  filterItem: { flexGrow: 1, flexShrink: 0, flexBasis: 170, minWidth: 170 },
  label: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 6 },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700' },
  pickerShell: { height: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, backgroundColor: brandColors.creamSoft, justifyContent: 'center', overflow: 'hidden' },
  picker: { height: 48, color: brandColors.textPrimary, fontWeight: '700', backgroundColor: brandColors.creamSoft },
  card: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 10 },
  createCard: { borderColor: brandColors.green, borderWidth: 2 },
  formTitle: { color: brandColors.greenDark, fontSize: 18, fontWeight: '900', marginBottom: 12 },
  formBody: { gap: 12 },
  fullField: { width: '100%' },
  disabledCard: { opacity: 0.65, backgroundColor: brandColors.creamSoft },
  cardHeader: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  cardTitleArea: { flex: 1 },
  questionText: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 15, lineHeight: 20 },
  meta: { marginTop: 5, color: brandColors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  statusColumn: { alignItems: 'center' },
  statusText: { color: brandColors.textSecondary, fontWeight: '900', fontSize: 11 },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'flex-end' },
  fieldGroup: { flexGrow: 1, flexShrink: 1, flexBasis: 126, minWidth: 118 },
  input: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700', flex: 1, minWidth: 0 },
  editInput: { height: 44, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700', minWidth: 0 },
  editPickerShell: { height: 46, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, backgroundColor: brandColors.white, justifyContent: 'center' },
  editPicker: { height: 46, color: brandColors.textPrimary, fontWeight: '700', backgroundColor: brandColors.white },
  disabledPicker: { opacity: 0.65, backgroundColor: brandColors.creamSoft },
  questionEditInput: { minHeight: 48, maxHeight: 96, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' },
  activeField: { flexGrow: 1, flexShrink: 1, flexBasis: 126, minWidth: 118 },
  activeRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 10, backgroundColor: brandColors.white },
  activeText: { color: brandColors.textPrimary, fontWeight: '800' },
  schemaSection: { borderTopWidth: 1, borderTopColor: brandColors.border, paddingTop: 12, gap: 8 },
  schemaTitle: { color: brandColors.greenDark, fontSize: 16, fontWeight: '900' },
  schemaHelp: { color: brandColors.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  schemaItem: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 8 },
  schemaOrder: { width: 24, color: brandColors.greenDark, fontWeight: '900', textAlign: 'center' },
  schemaLabelInput: { flexGrow: 2, flexBasis: 190 },
  schemaSmallInput: { flexGrow: 1, flexBasis: 90 },
  schemaGroupInput: { flexGrow: 1, flexBasis: 150 },
  schemaFactorInput: { flexGrow: 0, flexBasis: 82 },
  schemaActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  iconButton: { width: 38, height: 38, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.white },
  iconButtonText: { color: brandColors.greenDark, fontSize: 18, fontWeight: '900' },
  removeButton: { minHeight: 38, borderWidth: 1, borderColor: brandColors.danger, borderRadius: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.white },
  removeButtonText: { color: brandColors.danger, fontWeight: '900' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  primaryButton: { minHeight: 44, backgroundColor: brandColors.greenDark, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: brandColors.white, fontWeight: '900' },
  secondaryButton: { minHeight: 44, backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: brandColors.textSecondary, fontWeight: '900' },
});


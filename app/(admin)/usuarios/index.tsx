import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type UserRole = 'auditor' | 'admin' | 'super_admin';

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  region: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type CurrentProfile = Pick<ProfileRow, 'id' | 'full_name' | 'email' | 'role' | 'region' | 'is_active'>;

const allOption = 'TODOS';
const roles = ['TODOS', 'auditor', 'admin', 'super_admin'];
const adminRoles: UserRole[] = ['auditor', 'admin'];
const superAdminRoles: UserRole[] = ['auditor', 'admin', 'super_admin'];
const regions = ['TODAS', 'Costa', 'Sierra', 'Global'];

export default function UsuariosAdminPage() {
  const router = useRouter();
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(allOption);
  const [regionFilter, setRegionFilter] = useState(allOption);
  const [statusFilter, setStatusFilter] = useState(allOption);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: UserRole; region: string }>({ role: 'auditor', region: 'Costa' });

  useEffect(() => {
    loadData();
  }, []);

  const isSuperAdmin = currentProfile?.role === 'super_admin' || currentProfile?.region === 'Global';
  const isAdmin = currentProfile?.role === 'admin' || currentProfile?.role === 'super_admin';
  const availableRoles = isSuperAdmin ? superAdminRoles : adminRoles;

  const filteredUsers = useMemo(() => {
    const term = normalize(search);
    return users.filter((user) => {
      const matchesSearch = !term || normalize(`${user.full_name} ${user.email}`).includes(term);
      const matchesRole = roleFilter === allOption || user.role === roleFilter;
      const matchesRegion = regionFilter === allOption || user.region === regionFilter;
      const matchesStatus =
        statusFilter === allOption ||
        (statusFilter === 'ACTIVO' && user.is_active) ||
        (statusFilter === 'INACTIVO' && !user.is_active);
      return matchesSearch && matchesRole && matchesRegion && matchesStatus;
    });
  }, [regionFilter, roleFilter, search, statusFilter, users]);

  const goToDashboard = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard');
  };

  const loadData = async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar la sesion.');
      setLoading(false);
      return;
    }

    const { data: me, error: meError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, region, is_active')
      .eq('id', user.id)
      .single<CurrentProfile>();

    if (meError || !me) {
      setMessage(isMissingActiveColumn(meError?.message) ? 'Aplica la migracion de usuarios antes de usar esta pantalla.' : 'No se encontro tu perfil.');
      setLoading(false);
      return;
    }

    setCurrentProfile(me);
    if (me.role === 'auditor') {
      setMessage('No tienes permisos para administrar usuarios.');
      setLoading(false);
      return;
    }

    if (me.role !== 'super_admin' && me.region !== 'Global') {
      setRegionFilter(me.region);
    }

    let query = supabase
      .from('profiles')
      .select('id, full_name, email, role, region, is_active, created_at, updated_at')
      .order('full_name', { ascending: true });

    if (me.role !== 'super_admin' && me.region !== 'Global') {
      query = query.eq('region', me.region);
    }

    const { data, error } = await query;

    if (error) {
      setMessage(isMissingActiveColumn(error.message) ? 'Aplica la migracion de usuarios antes de usar esta pantalla.' : 'No se pudieron cargar los usuarios.');
    } else {
      setUsers((data || []) as ProfileRow[]);
    }

    setLoading(false);
  };

  const startEdit = (user: ProfileRow) => {
    if (!canEditUser(user)) {
      setMessage('No tienes permisos para editar este usuario.');
      return;
    }
    setEditingId(user.id);
    setDraft({ role: user.role, region: user.region });
  };

  const saveUser = async (user: ProfileRow) => {
    if (!canEditUser(user)) {
      setMessage('No tienes permisos para editar este usuario.');
      return;
    }

    if (!isSuperAdmin && draft.region !== currentProfile?.region) {
      setMessage('Admin solo puede mantener usuarios dentro de su region.');
      return;
    }

    if (!isSuperAdmin && draft.role === 'super_admin') {
      setMessage('Admin no puede asignar super_admin.');
      return;
    }

    setSavingId(user.id);
    setMessage(null);

    const payload = {
      role: draft.role,
      region: draft.region,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id);

    if (error) {
      setMessage('No se pudo guardar el usuario. Revisa permisos.');
    } else {
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, ...payload } : item)));
      setEditingId(null);
      setMessage('Usuario actualizado.');
    }

    setSavingId(null);
  };

  const toggleUser = async (user: ProfileRow) => {
    if (!canEditUser(user)) {
      setMessage('No tienes permisos para modificar este usuario.');
      return;
    }

    if (user.id === currentProfile?.id && user.is_active) {
      setMessage('No puedes desactivar tu propio usuario desde aqui.');
      return;
    }

    const confirmed = user.is_active
      ? typeof window === 'undefined' || window.confirm('El usuario sera desactivado y no deberia poder operar en la app.')
      : true;

    if (!confirmed) return;

    setSavingId(user.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !user.is_active, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) {
      setMessage('No se pudo cambiar el estado del usuario.');
    } else {
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, is_active: !user.is_active } : item)));
      setMessage(user.is_active ? 'Usuario desactivado.' : 'Usuario activado.');
    }
    setSavingId(null);
  };

  const canEditUser = (user: ProfileRow) => {
    if (!currentProfile) return false;
    if (isSuperAdmin) return true;
    return currentProfile.role === 'admin' && user.region === currentProfile.region && user.role !== 'super_admin';
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando usuarios...</Text>
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
        <View style={styles.headerText}>
          <Text style={styles.title}>Usuarios</Text>
          <Text style={styles.subtitle}>Administra rol, region y estado de usuarios existentes.</Text>
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
          placeholder="Buscar por nombre o correo"
          placeholderTextColor="#94a3b8"
        />
        <View style={styles.filterRow}>
          <SelectField label="Rol" value={roleFilter} onChange={setRoleFilter} options={roles} />
          {isSuperAdmin && <SelectField label="Region" value={regionFilter} onChange={setRegionFilter} options={regions} />}
          <SelectField label="Estado" value={statusFilter} onChange={setStatusFilter} options={['TODOS', 'ACTIVO', 'INACTIVO']} />
        </View>
      </View>

      {filteredUsers.map((user) => {
        const editing = editingId === user.id;
        const editable = canEditUser(user);

        return (
          <View key={user.id} style={[styles.card, !user.is_active && styles.disabledCard]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{user.full_name}</Text>
                <Text style={styles.meta}>{user.email}</Text>
                <Text style={styles.meta}>{formatRole(user.role)} · {user.region} · Creado {formatDate(user.created_at)}</Text>
              </View>
              <View style={styles.statusColumn}>
                <Text style={styles.statusText}>{user.is_active ? 'Activo' : 'Inactivo'}</Text>
                <Switch value={user.is_active} onValueChange={() => toggleUser(user)} disabled={!editable || savingId === user.id} />
              </View>
            </View>

            {editing && (
              <View style={styles.editGrid}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Rol</Text>
                  <View style={styles.pickerShell}>
                    <Picker selectedValue={draft.role} onValueChange={(value) => setDraft((current) => ({ ...current, role: value }))} style={styles.picker} dropdownIconColor={brandColors.greenDark}>
                      {availableRoles.map((option) => (
                        <Picker.Item key={option} label={formatRole(option)} value={option} />
                      ))}
                    </Picker>
                  </View>
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Region</Text>
                  <View style={styles.pickerShell}>
                    <Picker
                      selectedValue={draft.region}
                      onValueChange={(value) => setDraft((current) => ({ ...current, region: String(value) }))}
                      enabled={isSuperAdmin}
                      style={styles.picker}
                      dropdownIconColor={brandColors.greenDark}
                    >
                      {(isSuperAdmin ? regions.filter((item) => item !== 'TODAS') : [currentProfile?.region || 'Costa']).map((option) => (
                        <Picker.Item key={option} label={option} value={option} />
                      ))}
                    </Picker>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.cardActions}>
              {editing ? (
                <>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => saveUser(user)} disabled={savingId === user.id}>
                    <Text style={styles.primaryButtonText}>{savingId === user.id ? 'Guardando...' : 'Guardar cambios'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditingId(null)}>
                    <Text style={styles.secondaryButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.secondaryButton} onPress={() => startEdit(user)} disabled={!editable}>
                  <Text style={styles.secondaryButtonText}>{editable ? 'Editar' : 'Solo lectura'}</Text>
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

function isMissingActiveColumn(message?: string) {
  return Boolean(message?.includes('is_active'));
}

function formatOption(value: string) {
  if (value === 'TODOS') return 'Todos';
  if (value === 'TODAS') return 'Todas';
  if (value === 'ACTIVO') return 'Activo';
  if (value === 'INACTIVO') return 'Inactivo';
  return formatRole(value);
}

function formatRole(value: string) {
  if (value === 'super_admin') return 'Super admin';
  if (value === 'admin') return 'Admin';
  return 'Auditor';
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.greenDark },
  container: { padding: 18, paddingBottom: 36, backgroundColor: brandColors.background, width: '100%', maxWidth: 980, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  errorText: { color: brandColors.danger, fontWeight: '800', marginBottom: 12 },
  header: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 18, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  headerText: { flex: 1, minWidth: 220 },
  title: { fontSize: 25, fontWeight: '900', color: brandColors.textPrimary },
  subtitle: { marginTop: 4, color: brandColors.textSecondary, fontWeight: '600', lineHeight: 18 },
  message: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.warning, borderRadius: 8, padding: 12, marginBottom: 14, color: brandColors.coffeeDark, fontWeight: '800' },
  filterBand: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 12, marginBottom: 14, gap: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  filterItem: { minWidth: 170, flexGrow: 1, flexShrink: 0, flexBasis: 170 },
  label: { fontSize: 12, fontWeight: '900', color: brandColors.textSecondary, marginBottom: 6 },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.inputText, fontWeight: '700' },
  pickerShell: { minHeight: 56, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, backgroundColor: brandColors.creamSoft, justifyContent: 'center' },
  picker: { minHeight: 56, color: brandColors.textPrimary, fontWeight: '700', backgroundColor: brandColors.creamSoft },
  card: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 14, marginBottom: 10 },
  disabledCard: { opacity: 0.62, backgroundColor: brandColors.creamSoft },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardText: { flex: 1 },
  cardTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 15 },
  meta: { marginTop: 5, color: brandColors.textSecondary, fontSize: 12, fontWeight: '700' },
  statusColumn: { alignItems: 'center' },
  statusText: { color: brandColors.textSecondary, fontWeight: '900', fontSize: 11 },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, alignItems: 'flex-end' },
  fieldGroup: { flexGrow: 1, flexShrink: 0, flexBasis: 170, minWidth: 170 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  primaryButton: { backgroundColor: brandColors.greenDark, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  primaryButtonText: { color: brandColors.white, fontWeight: '900' },
  secondaryButton: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  secondaryButtonText: { color: brandColors.textSecondary, fontWeight: '900' },
});


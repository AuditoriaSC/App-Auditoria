import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/supabaseClient';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

type InvitationRow = {
  id: string;
  email: string;
  role: 'auditor' | 'admin' | 'super_admin';
  code: string;
  is_used: boolean;
  region: string | null;
  status: string | null;
  expires_at: string | null;
  invited_by: string | null;
  accepted_at: string | null;
  canceled_at: string | null;
  created_at: string | null;
};

const statuses = ['TODOS', 'pendiente', 'aceptada', 'cancelada', 'expirada'];
const adminRoles = ['auditor', 'admin'];
const superAdminRoles = ['auditor', 'admin', 'super_admin'];
const regions = ['Costa', 'Sierra', 'Global'];

export default function GestionInvitacionesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'auditor' | 'admin' | 'super_admin'>('auditor');
  const [region, setRegion] = useState('Costa');

  useEffect(() => {
    loadData();
  }, []);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isSuperAdmin = profile?.role === 'super_admin' || profile?.region === 'Global';
  const allowedRoles = isSuperAdmin ? superAdminRoles : adminRoles;

  const goToDashboard = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard');
  };

  const filteredInvitations = useMemo(() => {
    const term = normalize(search);
    return invitations.filter((invitation) => {
      const state = getInvitationStatus(invitation);
      const matchesSearch = !term || normalize(invitation.email).includes(term);
      const matchesStatus = statusFilter === 'TODOS' || state === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invitations, search, statusFilter]);

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
      setMessage('No tienes permisos para administrar invitaciones.');
      setLoading(false);
      return;
    }

    const defaultRegion = profileData.role === 'super_admin' || profileData.region === 'Global' ? 'Costa' : profileData.region;
    setRegion(defaultRegion);

    let query = supabase
      .from('user_invitations')
      .select('id, email, role, code, is_used, region, status, expires_at, invited_by, accepted_at, canceled_at, created_at')
      .order('created_at', { ascending: false });

    if (profileData.role !== 'super_admin' && profileData.region !== 'Global') {
      query = query.eq('region', profileData.region);
    }

    const { data, error } = await query;
    if (error) {
      setMessage('No se pudieron cargar las invitaciones. Revisa si la migracion de invitaciones ya fue aplicada.');
    } else {
      setInvitations((data || []) as InvitationRow[]);
    }

    setLoading(false);
  };

  const createInvitation = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMessage('Ingresa un correo valido.');
      return;
    }

    if (!role) {
      setMessage('Selecciona un rol.');
      return;
    }

    if (role === 'super_admin' && !isSuperAdmin) {
      setMessage('Solo super_admin puede invitar otro super_admin.');
      return;
    }

    if ((role === 'auditor' || role === 'admin') && !region) {
      setMessage('Selecciona una region.');
      return;
    }

    if (!isSuperAdmin && region !== profile?.region) {
      setMessage('Solo puedes invitar usuarios para tu region.');
      return;
    }

    const existingPending = invitations.some((invitation) =>
      invitation.email.toLowerCase() === cleanEmail && getInvitationStatus(invitation) === 'pendiente',
    );

    if (existingPending) {
      setMessage('Ya existe una invitacion pendiente para ese correo.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('user_invitations')
      .insert([{
        email: cleanEmail,
        role,
        region,
        code,
        status: 'pendiente',
        is_used: false,
        expires_at: expiresAt,
        invited_by: user?.id || null,
        created_at: new Date().toISOString(),
      }])
      .select('id, email, role, code, is_used, region, status, expires_at, invited_by, accepted_at, canceled_at, created_at')
      .single();

    if (error || !data) {
      setMessage('No se pudo crear la invitacion. Revisa permisos o duplicados.');
    } else {
      setInvitations((current) => [data as InvitationRow, ...current]);
      setEmail('');
      setMessage(`Invitacion creada. Codigo: ${code}`);
    }

    setSaving(false);
  };

  const cancelInvitation = async (invitation: InvitationRow) => {
    if (getInvitationStatus(invitation) !== 'pendiente') return;
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Quieres cancelar esta invitacion?');
    if (!confirmed) return;

    setSaving(true);
    const { error } = await supabase
      .from('user_invitations')
      .update({ status: 'cancelada', canceled_at: new Date().toISOString() })
      .eq('id', invitation.id);

    if (error) {
      setMessage('No se pudo cancelar la invitacion.');
    } else {
      setInvitations((current) =>
        current.map((item) => (item.id === invitation.id ? { ...item, status: 'cancelada', canceled_at: new Date().toISOString() } : item)),
      );
      setMessage('Invitacion cancelada.');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando invitaciones...</Text>
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
          <Text style={styles.title}>Invitaciones</Text>
          <Text style={styles.subtitle}>Crea y controla invitaciones sin borrar historico.</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Nueva invitacion</Text>
        <View style={styles.formGrid}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="correo@empresa.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View style={styles.pickerShell}>
            <Picker selectedValue={role} onValueChange={(value) => setRole(value)} style={styles.picker}>
              {allowedRoles.map((option) => (
                <Picker.Item key={option} label={formatRole(option)} value={option} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerShell}>
            <Picker
              selectedValue={region}
              onValueChange={(value) => setRegion(String(value))}
              enabled={isSuperAdmin}
              style={styles.picker}
            >
              {(isSuperAdmin ? regions : [profile?.region || 'Costa']).map((option) => (
                <Picker.Item key={option} label={option} value={option} />
              ))}
            </Picker>
          </View>
        </View>
        <View style={styles.formActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={createInvitation} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Creando...' : 'Crear invitacion'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterBand}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por correo"
          placeholderTextColor="#94a3b8"
        />
        <View style={styles.filterItem}>
          <Text style={styles.label}>Estado</Text>
          <View style={styles.pickerShell}>
            <Picker selectedValue={statusFilter} onValueChange={setStatusFilter} style={styles.picker}>
              {statuses.map((option) => (
                <Picker.Item key={option} label={formatStatus(option)} value={option} />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      {filteredInvitations.map((invitation) => {
        const state = getInvitationStatus(invitation);
        return (
          <View key={invitation.id} style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{invitation.email}</Text>
              <Text style={styles.meta}>{formatRole(invitation.role)} · {invitation.region || 'Sin region'} · Codigo {invitation.code}</Text>
              <Text style={styles.meta}>Expira: {formatDate(invitation.expires_at)}</Text>
            </View>
            <View style={styles.statusColumn}>
              <View style={[styles.badge, state === 'pendiente' ? styles.badgePending : state === 'aceptada' ? styles.badgeAccepted : styles.badgeCanceled]}>
                <Text style={styles.badgeText}>{formatStatus(state)}</Text>
              </View>
              {state === 'pendiente' && (
                <TouchableOpacity style={styles.cancelButton} onPress={() => cancelInvitation(invitation)} disabled={saving}>
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function getInvitationStatus(invitation: InvitationRow) {
  if (invitation.status === 'cancelada') return 'cancelada';
  if (invitation.status === 'aceptada' || invitation.is_used) return 'aceptada';
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return 'expirada';
  return invitation.status || 'pendiente';
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatRole(value: string) {
  if (value === 'super_admin') return 'Super admin';
  if (value === 'admin') return 'Admin';
  return 'Auditor';
}

function formatStatus(value: string) {
  if (value === 'TODOS') return 'Todos';
  if (value === 'pendiente') return 'Pendiente';
  if (value === 'aceptada') return 'Aceptada';
  if (value === 'cancelada') return 'Cancelada';
  if (value === 'expirada') return 'Expirada';
  return value;
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' });
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
  formCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 14, marginBottom: 14 },
  formTitle: { color: '#111827', fontWeight: '900', fontSize: 16, marginBottom: 10 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  filterBand: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 12, marginBottom: 14, gap: 10 },
  filterItem: { minWidth: 180, maxWidth: 260 },
  label: { fontSize: 12, fontWeight: '900', color: '#475569', marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff', color: '#111827', fontWeight: '700', flex: 1, minWidth: 220 },
  searchInput: { minHeight: 44, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff', color: '#111827', fontWeight: '700' },
  pickerShell: { height: 44, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, overflow: 'hidden', backgroundColor: '#f8fafc', justifyContent: 'center', flex: 1, minWidth: 160 },
  picker: { height: 44, color: '#111827', fontWeight: '700', backgroundColor: '#f8fafc' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde5eb', borderRadius: 8, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  cardText: { flex: 1 },
  cardTitle: { color: '#111827', fontWeight: '900', fontSize: 15 },
  meta: { marginTop: 5, color: '#64748b', fontSize: 12, fontWeight: '700' },
  statusColumn: { alignItems: 'flex-end', gap: 8 },
  badge: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  badgePending: { backgroundColor: '#fef3c7' },
  badgeAccepted: { backgroundColor: '#dcfce7' },
  badgeCanceled: { backgroundColor: '#fee2e2' },
  badgeText: { color: '#334155', fontWeight: '900', fontSize: 11 },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '900' },
  secondaryButton: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#334155', fontWeight: '900' },
  cancelButton: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  cancelButtonText: { color: '#be123c', fontSize: 12, fontWeight: '900' },
});

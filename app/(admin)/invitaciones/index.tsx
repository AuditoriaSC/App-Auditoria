import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../../../src/supabaseClient';

interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'auditor';
  code: string;
  is_used: boolean;
  created_at: string;
}

export default function GestionInvitacionesPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el Formulario
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'auditor'>('auditor');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInvitations(data);
    }
    setLoading(false);
  };

  const handleCreateInvitation = async () => {
    if (!email.trim() || !email.includes('@')) {
      alert('Por favor introduce un correo electrónico válido.');
      return;
    }

    setIsSubmitting(true);

    // Generar un código alfa-numérico aleatorio de 8 caracteres para la invitación
    const generatedCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    const { error } = await supabase
      .from('user_invitations')
      .insert([
        {
          email: email.trim().toLowerCase(),
          role: role,
          code: generatedCode,
          is_used: false,
          created_at: new Date().toISOString(),
        },
      ]);

    setIsSubmitting(false);

    if (error) {
      alert('Error al crear invitación: ' + error.message);
    } else {
      alert(`¡Invitación creada con éxito!\nCódigo: ${generatedCode}`);
      setEmail('');
      fetchInvitations();
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0070f3" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Panel Admin - Invitaciones de Acceso</Text>

      {/* FORMULARIO DE CREACIÓN */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>📨 Enviar Nueva Invitación</Text>
        
        <Text style={styles.label}>Correo Electrónico del Destinatario *</Text>
        <TextInput
          style={styles.input}
          placeholder="ejemplo@empresa.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Rol Asignado *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={role}
            onValueChange={(itemValue) => setRole(itemValue)}
          >
            <Picker.Item label="Auditor de Campo" value="auditor" />
            <Picker.Item label="Administrador de Sistema" value="admin" />
          </Picker>
        </View>

        <TouchableOpacity 
          style={[styles.button, isSubmitting && styles.disabledButton]} 
          onPress={handleCreateInvitation}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>
            {isSubmitting ? 'Generando...' : 'Generar Código de Invitación 🔑'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* LISTADO HISTÓRICO */}
      <Text style={styles.sectionSubtitle}>Historial de Invitaciones emitidas</Text>
      
      {invitations.length === 0 ? (
        <Text style={styles.emptyText}>No hay invitaciones registradas en el sistema.</Text>
      ) : (
        invitations.map((item) => (
          <View key={item.id} style={styles.inviteCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteEmail}>{item.email}</Text>
              <Text style={styles.inviteMeta}>
                Rol: <Text style={{ fontWeight: 'bold' }}>{item.role.toUpperCase()}</Text> | Código: <Text style={styles.codeText}>{item.code}</Text>
              </Text>
            </View>
            <View style={[styles.badge, item.is_used ? styles.badgeUsed : styles.badgePending]}>
              <Text style={styles.badgeText}>{item.is_used ? 'Canjeado' : 'Pendiente'}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 600, alignSelf: 'center', width: '100%', backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },
  sectionSubtitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 25, marginBottom: 10 },
  formCard: { backgroundColor: '#fff', padding: 20, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  formTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 5, marginTop: 5 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 10, fontSize: 14, marginBottom: 15, backgroundColor: '#fff' },
  pickerContainer: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', marginBottom: 15, overflow: 'hidden' },
  button: { backgroundColor: '#0070f3', padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 5 },
  disabledButton: { backgroundColor: '#bfdbfe', opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  emptyText: { color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: 15 },
  inviteCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 10, alignItems: 'center' },
  inviteEmail: { fontSize: 15, fontWeight: '600', color: '#334155' },
  inviteMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  codeText: { fontFamily: 'monospace', color: '#0f172a', fontWeight: 'bold', backgroundColor: '#f1f5f9', paddingHorizontal: 4, borderRadius: 3 },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, minWidth: 75, alignItems: 'center' },
  badgePending: { backgroundColor: '#fef3c7' },
  badgeUsed: { backgroundColor: '#d1fae5' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#374151' }
});
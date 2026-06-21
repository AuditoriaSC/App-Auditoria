import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type InvitationPreview = {
  email: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string | null;
};

type ScreenStatus = 'loading' | 'valid' | 'error' | 'success';

const minPasswordLength = 8;

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const cleanToken = useMemo(() => String(token || '').trim(), [token]);

  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadInvitation();
  }, [cleanToken]);

  const loadInvitation = async () => {
    setStatus('loading');
    setMessage(null);

    if (!cleanToken) {
      setStatus('error');
      setMessage('Invitacion no valida. Solicita un nuevo enlace al administrador.');
      return;
    }

    const { data, error } = await supabase.functions.invoke('accept-invite', {
      body: { token: cleanToken, mode: 'preview' },
    });

    if (error || !data?.ok) {
      setStatus('error');
      setMessage(data?.message || 'No se pudo validar la invitacion.');
      return;
    }

    setInvitation(data.invitation);
    setStatus('valid');
  };

  const acceptInvitation = async () => {
    setMessage(null);

    if (!cleanToken) {
      setMessage('Invitacion no valida. Solicita un nuevo enlace al administrador.');
      return;
    }

    if (!password) {
      setMessage('Ingresa una contrasena.');
      return;
    }

    if (password.length < minPasswordLength) {
      setMessage(`La contrasena debe tener minimo ${minPasswordLength} caracteres.`);
      return;
    }

    if (password !== confirmPassword) {
      setMessage('La confirmacion no coincide con la contrasena.');
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('accept-invite', {
      body: { token: cleanToken, password },
    });
    setSubmitting(false);

    if (error || !data?.ok) {
      setMessage(data?.message || 'No se pudo aceptar la invitacion.');
      return;
    }

    setStatus('success');
    router.replace({
      pathname: '/login',
      params: { message: 'Invitacion aceptada. Ya puedes iniciar sesion.' },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Aceptar invitacion</Text>
        <Text style={styles.subtitle}>Crea tu contrasena para ingresar a la app de auditorias.</Text>

        {status === 'loading' && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={brandColors.greenDark} />
            <Text style={styles.helperText}>Validando invitacion...</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.centerBlock}>
            <Text style={styles.errorText}>{message}</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/login')}>
              <Text style={styles.secondaryButtonText}>Ir al login</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'valid' && invitation && (
          <>
            <View style={styles.invitationBox}>
              <InfoRow label="Correo" value={invitation.email} />
              <InfoRow label="Rol" value={formatRole(invitation.role)} />
              <InfoRow label="Region" value={invitation.region || 'Sin region'} />
            </View>

            {message && <Text style={styles.errorText}>{message}</Text>}

            <Text style={styles.label}>Contrasena</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Minimo 8 caracteres"
            />

            <Text style={styles.label}>Confirmar contrasena</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Repite tu contrasena"
            />

            <TouchableOpacity style={[styles.primaryButton, submitting && styles.disabledButton]} onPress={acceptInvitation} disabled={submitting}>
              <Text style={styles.primaryButtonText}>{submitting ? 'Aceptando...' : 'Aceptar invitacion'}</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'success' && <Text style={styles.successText}>Invitacion aceptada. Ya puedes iniciar sesion.</Text>}
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatRole(role: string) {
  if (role === 'super_admin') return 'Super admin';
  if (role === 'admin') return 'Admin';
  return 'Auditor';
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: brandColors.background, padding: 18 },
  card: { width: '100%', maxWidth: 420, backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, padding: 20 },
  title: { color: brandColors.greenDark, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: brandColors.textSecondary, fontWeight: '700', lineHeight: 18, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  centerBlock: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  helperText: { color: brandColors.textSecondary, fontWeight: '800' },
  invitationBox: { backgroundColor: brandColors.greenSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 12, marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: brandColors.border },
  infoLabel: { color: brandColors.textSecondary, fontWeight: '900' },
  infoValue: { color: brandColors.textPrimary, fontWeight: '800', flex: 1, textAlign: 'right' },
  label: { color: brandColors.textSecondary, fontWeight: '900', marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: brandColors.white, color: brandColors.textPrimary, marginBottom: 12 },
  primaryButton: { minHeight: 48, borderRadius: 8, backgroundColor: brandColors.greenDark, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { color: brandColors.white, fontWeight: '900' },
  secondaryButton: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: brandColors.border, backgroundColor: brandColors.creamSoft, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: brandColors.greenDark, fontWeight: '900' },
  disabledButton: { opacity: 0.72 },
  errorText: { color: brandColors.danger, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  successText: { color: brandColors.greenDark, fontWeight: '900', textAlign: 'center' },
});

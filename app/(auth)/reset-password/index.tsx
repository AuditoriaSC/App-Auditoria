import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { brandColors } from '../../../constants/theme';
import { validateInternalPassword } from '../../../src/authPolicy';
import { supabase } from '../../../src/supabaseClient';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    const validation = validateInternalPassword(password);
    if (validation) return setMessage(validation);
    if (password !== confirm) return setMessage('Las contraseñas no coinciden.');
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('El enlace no es válido o ya venció. Solicita uno nuevo.'); setLoading(false); return; }
    const { data, error } = await supabase.functions.invoke('update-password', { body: { password } });
    if (!error && data?.ok) {
      await supabase.auth.signOut();
      router.replace({ pathname: '/login', params: { message: 'Contraseña actualizada. Inicia sesión nuevamente.' } });
      return;
    }
    setMessage(data?.error || error?.message || 'No se pudo actualizar la contraseña.');
    setLoading(false);
  };

  return <View style={styles.container}><View style={styles.form}>
    <Text style={styles.title}>Crear nueva contraseña</Text>
    <Text style={styles.hint}>Mínimo 8 caracteres, combinando letras y números.</Text>
    {message && <Text style={styles.message}>{message}</Text>}
    <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry={!visible} placeholder="Nueva contraseña" />
    <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry={!visible} placeholder="Repetir contraseña" />
    <TouchableOpacity onPress={() => setVisible((value) => !value)}><Text style={styles.link}>{visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</Text></TouchableOpacity>
    <TouchableOpacity style={styles.button} onPress={save} disabled={loading}><Text style={styles.buttonText}>{loading ? 'Guardando...' : 'Guardar contraseña'}</Text></TouchableOpacity>
  </View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: brandColors.background, padding: 18 },
  form: { width: '100%', maxWidth: 380, gap: 12, backgroundColor: brandColors.surface, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, padding: 18 },
  title: { fontSize: 21, fontWeight: '900', textAlign: 'center', color: brandColors.greenDark }, hint: { color: brandColors.textSecondary, textAlign: 'center' },
  input: { padding: 11, borderRadius: 8, borderWidth: 1, borderColor: brandColors.border, backgroundColor: brandColors.white, color: brandColors.textPrimary },
  link: { color: brandColors.greenDark, fontWeight: '800', textAlign: 'right' }, button: { padding: 12, backgroundColor: brandColors.greenDark, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: brandColors.white, fontWeight: '900' }, message: { color: brandColors.danger, textAlign: 'center', fontWeight: '700' },
});

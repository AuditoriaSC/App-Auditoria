import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { brandColors } from '../../../constants/theme';
import { clearSupabaseSessionCache, supabase } from '../../../src/supabaseClient';

const REMEMBER_EMAIL_KEY = '@login_remembered_email';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberUser, setRememberUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadRememberedEmail() {
      const rememberedEmail = await AsyncStorage.getItem(REMEMBER_EMAIL_KEY);
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberUser(true);
      }
    }

    loadRememberedEmail();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      if (authError.message.toLowerCase().includes('refresh token')) {
        await clearSupabaseSessionCache();
      }
      setError(authError.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', user.id)
        .single();

      if (!profileError && profile?.is_active === false) {
        await supabase.auth.signOut();
        setError('Tu usuario se encuentra inactivo. Contacta al administrador.');
        setLoading(false);
        return;
      }
    }

    if (rememberUser) {
      await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, email.trim().toLowerCase());
    } else {
      await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
    }

    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Auditorias - Iniciar Sesion</Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.label}>Correo Electronico</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.label}>Contrasena</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberUser((value) => !value)} activeOpacity={0.8}>
          <View style={[styles.checkbox, rememberUser && styles.checkboxActive]}>
            {rememberUser && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={styles.rememberText}>Recordar usuario</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Cargando...' : 'Entrar'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: brandColors.background, padding: 18 },
  form: { width: '100%', maxWidth: 340, gap: 10, backgroundColor: brandColors.surface, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, padding: 18 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: brandColors.greenDark },
  label: { fontWeight: '600', color: brandColors.textSecondary },
  input: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: brandColors.border, backgroundColor: brandColors.white, color: brandColors.textPrimary },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: brandColors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.white },
  checkboxActive: { backgroundColor: brandColors.greenDark, borderColor: brandColors.greenDark },
  checkboxMark: { color: brandColors.white, fontWeight: '900', fontSize: 13, lineHeight: 16 },
  rememberText: { color: brandColors.textSecondary, fontWeight: '700' },
  button: { padding: 12, backgroundColor: brandColors.greenDark, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: brandColors.white, fontWeight: 'bold' },
  errorText: { color: brandColors.danger, fontSize: 14, textAlign: 'center' },
});

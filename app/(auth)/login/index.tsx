import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  form: { width: 300, gap: 10 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: '#111827' },
  label: { fontWeight: '600', color: '#334155' },
  input: { padding: 8, borderRadius: 4, borderWidth: 1, borderColor: '#ccc' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxActive: { backgroundColor: '#0070f3', borderColor: '#0070f3' },
  checkboxMark: { color: '#fff', fontWeight: '900', fontSize: 13, lineHeight: 16 },
  rememberText: { color: '#334155', fontWeight: '700' },
  button: { padding: 12, backgroundColor: '#0070f3', borderRadius: 4, alignItems: 'center', marginTop: 5 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: 'white', fontWeight: 'bold' },
  errorText: { color: 'red', fontSize: 14, textAlign: 'center' },
});

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
// IMPORTACIÓN CORRECTA: Reutilizamos la instancia centralizada
import { clearSupabaseSessionCache, supabase } from '../../../src/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    // Usa el cliente global
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
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

    // Redirección limpia al index para evaluar el rol
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Auditorías - Iniciar Sesión</Text>
        
        {error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.label}>Correo Electrónico</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Cargando...' : 'Entrar'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  form: { width: 300, gap: 10 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  label: { fontWeight: '600' },
  input: { padding: 8, borderRadius: 4, borderWidth: 1, borderColor: '#ccc' },
  button: { padding: 12, backgroundColor: '#0070f3', borderRadius: 4, alignItems: 'center', marginTop: 5 },
  buttonText: { color: 'white', fontWeight: 'bold' },
  errorText: { color: 'red', fontSize: 14, textAlign: 'center' }
});

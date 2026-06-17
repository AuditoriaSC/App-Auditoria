import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
// Importación exacta apuntando a tu nueva carpeta src
import { clearSupabaseSessionCache, supabase } from '../src/supabaseClient';

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkUserSession() {
      // 1. Validar de forma segura si el usuario tiene sesión activa
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError?.message?.toLowerCase().includes('refresh token')) {
          await clearSupabaseSessionCache();
        }
        // Si no está logueado o hay error, lo mandamos directo al login de Expo
        router.replace('/login');
        return;
      }

      // 2. Si está logueado, consultar el rol único en la tabla 'profiles'
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        // Si está logueado pero no tiene perfil/rol, lo mandamos a la pantalla por defecto
        router.replace('/nueva-auditoria');
        return;
      }

      // 3. Redirigir según el rol estricto obtenido de Supabase
      if (profile.role === 'admin') {
        router.replace('/dashboard');
      } else {
        router.replace('/nueva-auditoria');
      }
    }

    checkUserSession();
  }, [router]);

  // Pantalla de carga mientras se resuelve la sesión en segundo plano
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0070f3" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

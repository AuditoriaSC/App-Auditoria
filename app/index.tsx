import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { brandColors } from '../constants/theme';
// Importación exacta apuntando a tu nueva carpeta src
import { clearSupabaseSessionCache, supabase } from '../src/supabaseClient';

export default function IndexPage() {
  const router = useRouter();
  const [inactiveMessage, setInactiveMessage] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

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
        .select('role, is_active')
        .eq('id', user.id)
        .single();

      if (profileError?.message?.includes('is_active')) {
        const { data: fallbackProfile, error: fallbackError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (fallbackError || !fallbackProfile) {
          setProfileMessage(buildMissingProfileMessage(user.email, user.id, fallbackError?.message));
          return;
        }

        router.replace('/dashboard');
        return;
      }

      if (profileError || !profile) {
        // Si está logueado pero no tiene perfil/rol, lo mandamos a la pantalla por defecto
        setProfileMessage(buildMissingProfileMessage(user.email, user.id, profileError?.message));
        return;
      }

      if (profile.is_active === false) {
        await supabase.auth.signOut();
        setInactiveMessage(true);
        return;
      }

      // 3. Todos los roles pasan por el dashboard; la vista aplica el alcance por rol.
      router.replace('/dashboard');
    }

    checkUserSession();
  }, [router]);

  // Pantalla de carga mientras se resuelve la sesión en segundo plano
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={brandColors.greenDark} />
      {inactiveMessage && <Text style={styles.message}>Tu usuario se encuentra inactivo. Contacta al administrador.</Text>}
      {profileMessage && <Text style={styles.message}>{profileMessage}</Text>}
    </View>
  );
}

function buildMissingProfileMessage(email?: string | null, uid?: string, detail?: string) {
  return [
    'No se encontro el perfil del usuario autenticado.',
    `Correo: ${email || 'sin correo'}`,
    `UID Auth: ${uid || 'sin uid'}`,
    detail ? `Detalle: ${detail}` : null,
  ].filter(Boolean).join('\n');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: brandColors.background,
  },
  message: { marginTop: 12, color: brandColors.danger, fontWeight: '800', textAlign: 'center', paddingHorizontal: 20 },
});

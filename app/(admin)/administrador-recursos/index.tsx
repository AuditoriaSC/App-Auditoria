import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type ProfileRow = {
  full_name: string;
  role: 'auditor' | 'admin' | 'super_admin';
  region: string;
};

const resources = [
  {
    title: 'Preguntas',
    description: 'Editar textos, puntajes, posicion y estado del checklist.',
    route: '/preguntas',
  },
  {
    title: 'Locales',
    description: 'Crear y mantener locales por region sin tocar Supabase directo.',
    route: '/locales',
  },
  {
    title: 'Responsables',
    description: 'Importar lideres por CSV y activar o desactivar el catalogo vivo.',
    route: '/responsables',
  },
  {
    title: 'Invitaciones',
    description: 'Crear, cancelar y revisar invitaciones de nuevos usuarios.',
    route: '/invitaciones',
  },
  {
    title: 'Usuarios',
    description: 'Administrar roles, regiones y estado de usuarios existentes.',
    route: '/usuarios',
  },
];

export default function AdministradorRecursosPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setMessage('No se pudo validar la sesion.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role, region')
      .eq('id', user.id)
      .single<ProfileRow>();

    if (error || !data) {
      setMessage('No se encontro el perfil del usuario.');
    } else {
      setProfile(data);
    }

    setLoading(false);
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const goToDashboard = () => {
    router.replace('/dashboard');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Cargando recursos...</Text>
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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Administrador de Recursos</Text>
          <Text style={styles.subtitle}>{profile?.role === 'super_admin' ? 'Todas las regiones' : profile?.region}</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToDashboard}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {resources.map((resource) => (
          <TouchableOpacity
            key={resource.route}
            style={styles.card}
            onPress={() => router.push(resource.route)}
            activeOpacity={0.84}
          >
            <Text style={styles.cardTitle}>{resource.title}</Text>
            <Text style={styles.cardDescription}>{resource.description}</Text>
            <Text style={styles.cardAction}>Abrir</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32, backgroundColor: brandColors.background, width: '100%', maxWidth: 980, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.creamSoft },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  errorText: { color: brandColors.danger, fontWeight: '800', marginBottom: 12 },
  header: { backgroundColor: brandColors.white, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 16, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  headerText: { flex: 1, minWidth: 220 },
  title: { fontSize: 24, fontWeight: '900', color: brandColors.textPrimary },
  subtitle: { marginTop: 4, color: brandColors.textSecondary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: 230, minWidth: 0, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, backgroundColor: brandColors.white, padding: 14 },
  cardTitle: { color: brandColors.textPrimary, fontWeight: '900', fontSize: 16 },
  cardDescription: { color: brandColors.textSecondary, fontWeight: '700', fontSize: 12, lineHeight: 17, marginTop: 6 },
  cardAction: { color: brandColors.greenDark, fontWeight: '900', marginTop: 12 },
  secondaryButton: { backgroundColor: brandColors.creamSoft, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: brandColors.textSecondary, fontWeight: '900' },
});

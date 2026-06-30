import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../../constants/theme';
import { supabase } from '../../../supabaseClient';
import { canAccessInventoryModule, ENABLE_INVENTORY_MODULE } from '../access';

const futureSections = [
  ['Crear informe de inventario', 'Iniciar un nuevo expediente de inventario.'],
  ['Cargar archivo Excel/PDF', 'Incorporar archivos fuente para su futura validación.'],
  ['Cruces de materias primas', 'Comparar movimientos y consumos de materias primas.'],
  ['Faltantes y sobrantes', 'Consolidar diferencias detectadas en inventario.'],
  ['Producto terminado', 'Revisar existencias y variaciones de producto terminado.'],
  ['Cierre de caja', 'Relacionar el inventario con la información de caja.'],
  ['Facturas manuales', 'Registrar documentos que requieran revisión manual.'],
  ['Observaciones', 'Documentar hallazgos y notas del informe.'],
  ['Evidencias', 'Adjuntar respaldos del análisis de inventario.'],
  ['Generar informe', 'Preparar la salida final cuando el flujo esté habilitado.'],
] as const;

type AccessState = 'checking' | 'allowed' | 'denied';

export default function InventoryModuleScreen() {
  const router = useRouter();
  const [accessState, setAccessState] = useState<AccessState>('checking');

  useEffect(() => {
    if (Platform.OS !== 'web' || !ENABLE_INVENTORY_MODULE) return;
    let active = true;

    async function validateAccess() {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        if (active) setAccessState('denied');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single<{ role: string }>();

      if (active) setAccessState(!profileError && canAccessInventoryModule(profile?.role, user.email) ? 'allowed' : 'denied');
    }

    validateAccess();
    return () => { active = false; };
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.center}>
        <Text style={styles.restrictedTitle}>Disponible solo en Web</Text>
        <Text style={styles.restrictedText}>Informes de Inventario no forma parte de la aplicación móvil.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/dashboard')}>
          <Text style={styles.primaryButtonText}>Volver al dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!ENABLE_INVENTORY_MODULE || accessState === 'denied') {
    return (
      <View style={styles.center}>
        <Text style={styles.restrictedTitle}>Módulo no disponible</Text>
        <Text style={styles.restrictedText}>Esta funcionalidad todavía no está habilitada para tu usuario.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/dashboard')}>
          <Text style={styles.primaryButtonText}>Volver al dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (accessState === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={brandColors.greenDark} />
        <Text style={styles.loadingText}>Validando acceso...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.statusBadge}><Text style={styles.statusBadgeText}>Módulo en desarrollo</Text></View>
        <Text style={styles.title}>Informes de Inventario</Text>
        <Text style={styles.subtitle}>Estructura inicial de trabajo para la versión 1.1. Las acciones permanecen deshabilitadas mientras se define el flujo operativo.</Text>
      </View>
      <View style={styles.grid}>
        {futureSections.map(([title, description]) => (
          <View key={title} style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDescription}>{description}</Text>
            <Text style={styles.cardStatus}>Próximamente</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 18, backgroundColor: brandColors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: brandColors.background },
  loadingText: { marginTop: 10, color: brandColors.textSecondary, fontWeight: '700' },
  restrictedTitle: { color: brandColors.textPrimary, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  restrictedText: { color: brandColors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 460 },
  primaryButton: { marginTop: 18, backgroundColor: brandColors.greenDark, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 },
  primaryButtonText: { color: brandColors.white, fontWeight: '900' },
  hero: { backgroundColor: brandColors.greenDark, borderRadius: 12, padding: 24, gap: 10 },
  statusBadge: { alignSelf: 'flex-start', backgroundColor: brandColors.cream, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  statusBadgeText: { color: brandColors.greenDark, fontSize: 12, fontWeight: '900' },
  title: { color: brandColors.white, fontSize: 30, fontWeight: '900' },
  subtitle: { color: brandColors.logoWhite, fontSize: 14, lineHeight: 21, maxWidth: 760 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { flexGrow: 1, flexBasis: 280, minWidth: 240, minHeight: 150, backgroundColor: brandColors.surface, borderWidth: 1, borderColor: brandColors.border, borderRadius: 10, padding: 18 },
  cardTitle: { color: brandColors.textPrimary, fontSize: 16, fontWeight: '900' },
  cardDescription: { color: brandColors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 7, flex: 1 },
  cardStatus: { color: brandColors.greenDark, fontSize: 12, fontWeight: '900', marginTop: 14 },
});

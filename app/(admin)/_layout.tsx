import { Redirect, Slot, useSegments } from 'expo-router';
import { Platform } from 'react-native';

const webOnlyResourceRoutes = new Set([
  'preguntas',
  'locales',
  'responsables',
  'usuarios',
  'invitaciones',
  'exportar-avanzado',
  'inventarios',
]);

export default function AdminLayout() {
  const segments = useSegments();
  const currentRoute = String(segments[segments.length - 1] || '');

  if (Platform.OS !== 'web' && webOnlyResourceRoutes.has(currentRoute)) {
    return <Redirect href="/administrador-recursos" />;
  }

  return <Slot />;
}

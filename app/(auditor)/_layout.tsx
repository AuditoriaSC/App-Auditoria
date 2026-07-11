import { Slot } from 'expo-router';
import { AppShell } from '../../src/navigation/AppShell';

export default function AuditorLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}

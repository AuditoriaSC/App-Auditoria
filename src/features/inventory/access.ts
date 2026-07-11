import { Platform } from 'react-native';

const isLocalDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
const isInventoryFlagEnabled = process.env.EXPO_PUBLIC_ENABLE_INVENTORY_MODULE === 'true';
const developerEmails = new Set(
  (process.env.EXPO_PUBLIC_INVENTORY_DEVELOPER_EMAILS || '')
    .split(',')
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const ENABLE_INVENTORY_MODULE =
  Platform.OS === 'web' && (isLocalDevelopment || isInventoryFlagEnabled);

export function canAccessInventoryModule(role?: string | null, email?: string | null) {
  if (!ENABLE_INVENTORY_MODULE) return false;
  if (role === 'super_admin') return true;
  return Boolean(email && developerEmails.has(email.trim().toLowerCase()));
}

import { Platform } from 'react-native';

const isLocalDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
const isInventoryFlagEnabled = process.env.EXPO_PUBLIC_ENABLE_INVENTORY_MODULE === 'true';

export const ENABLE_INVENTORY_MODULE =
  Platform.OS === 'web' && (isLocalDevelopment || isInventoryFlagEnabled);

export function canAccessInventoryModule() {
  return ENABLE_INVENTORY_MODULE;
}

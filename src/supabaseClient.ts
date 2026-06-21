import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const isStaticRender = typeof window === 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isStaticRender ? undefined : AsyncStorage, // En static export no existe window/storage.
    autoRefreshToken: !isStaticRender,
    persistSession: !isStaticRender,
  },
});

export async function clearSupabaseSessionCache() {
  const keys = await AsyncStorage.getAllKeys();
  const authKeys = keys.filter(
    (key) =>
      key.startsWith('sb-') ||
      key.includes('supabase.auth') ||
      key.includes('auth-token'),
  );

  if (authKeys.length > 0) {
    await AsyncStorage.multiRemove(authKeys);
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGIN_MONTH_KEY = '@auth_login_month';
const ATTEMPT_PREFIX = '@auth_attempts:';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type AttemptState = { count: number; lockedUntil?: number };

export function validateInternalPassword(password: string) {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/^[A-Za-z0-9]+$/.test(password)) return 'Usa únicamente letras y números, sin caracteres especiales.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'La contraseña debe combinar letras y números.';
  return null;
}

export function currentLoginMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function markMonthlyLogin() {
  await AsyncStorage.setItem(LOGIN_MONTH_KEY, currentLoginMonth());
}

export async function requiresMonthlyLogin() {
  return (await AsyncStorage.getItem(LOGIN_MONTH_KEY)) !== currentLoginMonth();
}

function attemptKey(email: string) { return `${ATTEMPT_PREFIX}${email.trim().toLowerCase()}`; }

export async function getLoginAttemptState(email: string): Promise<AttemptState> {
  const raw = await AsyncStorage.getItem(attemptKey(email));
  const state: AttemptState = raw ? JSON.parse(raw) : { count: 0 };
  if (state.lockedUntil && state.lockedUntil <= Date.now()) {
    await AsyncStorage.removeItem(attemptKey(email));
    return { count: 0 };
  }
  return state;
}

export async function recordFailedLogin(email: string) {
  const current = await getLoginAttemptState(email);
  const count = current.count + 1;
  const next: AttemptState = count >= MAX_ATTEMPTS ? { count, lockedUntil: Date.now() + LOCK_MINUTES * 60_000 } : { count };
  await AsyncStorage.setItem(attemptKey(email), JSON.stringify(next));
  return { ...next, remaining: Math.max(0, MAX_ATTEMPTS - count) };
}

export async function clearFailedLogins(email: string) { await AsyncStorage.removeItem(attemptKey(email)); }

export function lockMessage(lockedUntil: number) {
  const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
  return `Demasiados intentos. Intenta nuevamente en ${minutes} minuto${minutes === 1 ? '' : 's'}.`;
}

export function isPasswordExpired(changedAt?: string | null) {
  if (!changedAt) return true;
  const changed = new Date(changedAt);
  if (Number.isNaN(changed.getTime())) return true;
  changed.setMonth(changed.getMonth() + 6);
  return changed <= new Date();
}

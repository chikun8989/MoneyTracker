import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const APP_LOCK_KEYS = {
  secret: 'moneyTrackerLockSecret',
  mode: 'moneyTrackerLockMode',
  enabled: 'moneyTrackerLockEnabled',
  biometric: 'moneyTrackerBiometricEnabled',
  attempts: 'moneyTrackerLockAttempts',
  lockUntil: 'moneyTrackerLockUntil',
} as const;

export async function getLockValue(key: string) {
  return Platform.OS === 'web' ? (typeof window === 'undefined' ? null : window.localStorage.getItem(key)) : SecureStore.getItemAsync(key);
}

export async function setLockValue(key: string, value: string) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') throw new Error('Browser storage is not available.');
    window.localStorage.setItem(key, value);
  } else await SecureStore.setItemAsync(key, value);
}

export async function removeLockValue(key: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } else await SecureStore.deleteItemAsync(key);
}

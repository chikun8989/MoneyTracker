import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { APP_LOCK_KEYS, getLockValue, setLockValue } from '@/lib/app-lock-storage';
const ink = '#18352B';
type LockMode = 'pin' | 'password';
type Phase = 'loading' | 'setup' | 'unlock';

export function AppLock({ locked, splashFinished, onUnlocked, onLocked }: { locked: boolean; splashFinished: boolean; onUnlocked: () => void; onLocked: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<LockMode>('pin');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [storedSecret, setStoredSecret] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometric unlock');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [error, setError] = useState('');
  const [lockUntil, setLockUntil] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const biometricBusy = useRef(false);
  const autoPrompted = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [savedSecret, savedMode, savedBiometric, savedEnabled, hasHardware, enrolled] = await Promise.all([
          getLockValue(APP_LOCK_KEYS.secret), getLockValue(APP_LOCK_KEYS.mode), getLockValue(APP_LOCK_KEYS.biometric), getLockValue(APP_LOCK_KEYS.enabled),
          Platform.OS === 'web' ? false : LocalAuthentication.hasHardwareAsync(),
          Platform.OS === 'web' ? false : LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!active) return;
        const types: LocalAuthentication.AuthenticationType[] = Platform.OS === 'web' ? [] : await LocalAuthentication.supportedAuthenticationTypesAsync();
        const available = Boolean(hasHardware && enrolled);
        setBiometricAvailable(available);
        setBiometricLabel(types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) ? 'Use fingerprint' : types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'Use Face ID / face unlock' : 'Use biometrics');
        setBiometricEnabled(available && savedBiometric === 'true');
        setStoredSecret(savedSecret);
        setMode(savedMode === 'password' ? 'password' : 'pin');
        const until = Number(await getLockValue(APP_LOCK_KEYS.lockUntil) ?? 0);
        setLockUntil(Number.isFinite(until) ? until : 0);
        setRemainingSeconds(Number.isFinite(until) ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0);
        setPhase(savedSecret ? 'unlock' : 'setup');
        if (savedEnabled === 'false') onUnlocked();
      } catch (loadError) {
        if (active) { setError(loadError instanceof Error ? loadError.message : 'Secure storage is unavailable.'); setPhase('setup'); }
      }
    })();
    return () => { active = false; };
  }, [onUnlocked]);

  const unlock = useCallback(() => {
    setError('');
    setSecret('');
    setConfirmation('');
    onUnlocked();
  }, [onUnlocked]);

  const authenticateBiometric = useCallback(async () => {
    if (!biometricAvailable || !biometricEnabled || biometricBusy.current) return;
    biometricBusy.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock MoneyTracker', cancelLabel: 'Use PIN', disableDeviceFallback: true, biometricsSecurityLevel: 'strong' });
      if (result.success) unlock();
      else if (result.error !== 'user_cancel' && result.error !== 'system_cancel' && result.error !== 'app_cancel') setError('Biometric check did not match. Enter your PIN or password.');
    } catch { setError('Biometric unlock is unavailable. Enter your PIN or password.'); }
    finally { biometricBusy.current = false; }
  }, [biometricAvailable, biometricEnabled, unlock]);

  useEffect(() => {
    if (phase === 'unlock' && biometricEnabled && splashFinished && !autoPrompted.current) {
      autoPrompted.current = true;
      void authenticateBiometric();
    }
  }, [authenticateBiometric, biometricEnabled, phase, splashFinished]);

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        autoPrompted.current = false;
        setSecret('');
        setConfirmation('');
        void (async () => {
          try {
            const [savedEnabled, savedSecret, savedMode, savedBiometric] = await Promise.all([
              getLockValue(APP_LOCK_KEYS.enabled), getLockValue(APP_LOCK_KEYS.secret), getLockValue(APP_LOCK_KEYS.mode), getLockValue(APP_LOCK_KEYS.biometric),
            ]);
            if (savedEnabled === 'false') { onUnlocked(); return; }
            setStoredSecret(savedSecret);
            setMode(savedMode === 'password' ? 'password' : 'pin');
            setBiometricEnabled(biometricAvailable && savedBiometric === 'true');
            setPhase(savedSecret ? 'unlock' : 'setup');
            onLocked();
          } catch { onLocked(); }
        })();
      }
      if (next === 'active' && previous !== 'active' && phase === 'unlock' && biometricEnabled) {
        autoPrompted.current = true;
        void authenticateBiometric();
      }
      previous = next;
    });
    return () => subscription.remove();
  }, [authenticateBiometric, biometricAvailable, biometricEnabled, onLocked, onUnlocked, phase]);

  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockUntil]);

  const saveNewLock = async () => {
    const minimumLength = mode === 'pin' ? 6 : 8;
    if (secret.length < minimumLength) { setError(`${mode === 'pin' ? 'PIN' : 'Password'} must be at least ${minimumLength} ${mode === 'pin' ? 'digits' : 'characters'}.`); return; }
    if (mode === 'pin' && !/^\d+$/.test(secret)) { setError('PIN must contain digits only.'); return; }
    if (secret !== confirmation) { setError('The two entries do not match.'); return; }
    try {
      await Promise.all([setLockValue(APP_LOCK_KEYS.secret, secret), setLockValue(APP_LOCK_KEYS.mode, mode), setLockValue(APP_LOCK_KEYS.enabled, 'true'), setLockValue(APP_LOCK_KEYS.biometric, String(biometricAvailable && biometricEnabled))]);
      setStoredSecret(secret);
      autoPrompted.current = true;
      setPhase('unlock');
      unlock();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save your app lock.'); }
  };

  const checkLock = async () => {
    if (remainingSeconds > 0) return;
    if (!storedSecret || secret !== storedSecret) {
      setSecret('');
      const attempts = Number(await getLockValue(APP_LOCK_KEYS.attempts) ?? 0) + 1;
      if (attempts >= 5) {
        const until = Date.now() + 30_000;
        await Promise.all([setLockValue(APP_LOCK_KEYS.attempts, '0'), setLockValue(APP_LOCK_KEYS.lockUntil, String(until))]);
        setLockUntil(until);
        setRemainingSeconds(30);
        setError('Too many incorrect attempts. Try again in 30 seconds.');
      } else {
        await setLockValue(APP_LOCK_KEYS.attempts, String(attempts));
        setError('That PIN or password is incorrect.');
      }
      return;
    }
    await Promise.all([setLockValue(APP_LOCK_KEYS.attempts, '0'), setLockValue(APP_LOCK_KEYS.lockUntil, '0')]);
    setLockUntil(0);
    unlock();
  };

  if (!locked || !splashFinished || phase === 'loading') return null;

  return <View style={s.overlay}>
    <KeyboardAvoidingView style={s.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.brandMark}><Text style={s.markText}>M</Text></View>
      <Text style={s.brand}>MoneyTracker</Text>
      <Text style={s.title}>{phase === 'setup' ? 'Secure your money data' : 'Welcome back'}</Text>
      <Text style={s.subtitle}>{phase === 'setup' ? 'Create a PIN or password to protect this app.' : 'Enter your PIN or password to continue.'}</Text>

      {phase === 'setup' && <View style={s.modeRow}>
        <Pressable onPress={() => { setMode('pin'); setSecret(''); setConfirmation(''); setError(''); }} style={[s.modeChoice, mode === 'pin' && s.modeActive]}><Text style={[s.modeText, mode === 'pin' && s.modeTextActive]}>PIN</Text></Pressable>
        <Pressable onPress={() => { setMode('password'); setSecret(''); setConfirmation(''); setError(''); }} style={[s.modeChoice, mode === 'password' && s.modeActive]}><Text style={[s.modeText, mode === 'password' && s.modeTextActive]}>Password</Text></Pressable>
      </View>}

      <TextInput value={secret} onChangeText={(value) => { setSecret(mode === 'pin' ? value.replace(/\D/g, '').slice(0, 12) : value); setError(''); }} onSubmitEditing={() => phase === 'setup' ? undefined : void checkLock()} placeholder={phase === 'setup' ? `Create ${mode === 'pin' ? 'a 6-digit PIN' : 'a password'}` : `Enter ${mode}`} placeholderTextColor="#94A198" secureTextEntry keyboardType={mode === 'pin' ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel={phase === 'setup' ? `Create ${mode}` : `Enter ${mode}`} />
      {phase === 'setup' && <TextInput value={confirmation} onChangeText={(value) => { setConfirmation(mode === 'pin' ? value.replace(/\D/g, '').slice(0, 12) : value); setError(''); }} onSubmitEditing={() => void saveNewLock()} placeholder={`Confirm ${mode}`} placeholderTextColor="#94A198" secureTextEntry keyboardType={mode === 'pin' ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel={`Confirm ${mode}`} />}

      {phase === 'setup' && biometricAvailable && <View style={s.bioOption}><View style={s.bioCopy}><Text style={s.bioTitle}>{biometricLabel}</Text><Text style={s.bioSub}>Use it as a faster way to unlock</Text></View><Switch value={biometricEnabled} onValueChange={setBiometricEnabled} trackColor={{ false: '#D9E1DC', true: '#8EB4A0' }} thumbColor={biometricEnabled ? ink : '#F7F8F6'} accessibilityLabel="Enable biometric unlock" /></View>}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {phase === 'unlock' && remainingSeconds > 0 ? <Text style={s.error}>Try again in {remainingSeconds} seconds.</Text> : null}
      <Pressable onPress={() => void (phase === 'setup' ? saveNewLock() : checkLock())} disabled={phase === 'unlock' && remainingSeconds > 0} style={[s.unlockButton, phase === 'unlock' && remainingSeconds > 0 && s.disabled]}><Text style={s.unlockText}>{phase === 'setup' ? 'Save lock & continue' : 'Unlock'}</Text></Pressable>
      {phase === 'unlock' && biometricAvailable && biometricEnabled && <Pressable onPress={() => void authenticateBiometric()} style={s.bioButton}><Text style={s.bioButtonText}>{biometricLabel}</Text></Pressable>}
      <Text style={s.footer}>Your {mode} is stored securely on this device. {Platform.OS === 'web' ? 'Browser preview uses browser storage.' : 'Your financial records remain in the local app database.'}</Text>
    </KeyboardAvoidingView>
  </View>;
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 2000, backgroundColor: '#F4F6F1', justifyContent: 'center', paddingHorizontal: 24 },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center' },
  brandMark: { width: 62, height: 62, borderRadius: 21, backgroundColor: '#E0ECE2', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, markText: { color: ink, fontSize: 30, fontWeight: '800' }, brand: { color: ink, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  title: { color: ink, fontSize: 23, lineHeight: 29, fontWeight: '800', textAlign: 'center', marginTop: 31 }, subtitle: { color: '#68776E', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7, marginBottom: 22 },
  modeRow: { width: '100%', flexDirection: 'row', backgroundColor: '#E9EDE7', borderRadius: 12, padding: 4, marginBottom: 12 }, modeChoice: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9, minHeight: 37 }, modeActive: { backgroundColor: 'white' }, modeText: { color: '#738178', fontSize: 12, fontWeight: '600' }, modeTextActive: { color: ink },
  input: { width: '100%', minHeight: 50, backgroundColor: 'white', borderWidth: 1, borderColor: '#E1E7E1', borderRadius: 13, paddingHorizontal: 15, marginBottom: 10, color: ink, fontSize: 15 },
  bioOption: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 13, padding: 13, marginTop: 3 }, bioCopy: { flex: 1 }, bioTitle: { color: ink, fontSize: 12, fontWeight: '700' }, bioSub: { color: '#849087', fontSize: 10, marginTop: 3 },
  error: { alignSelf: 'flex-start', width: '100%', color: '#A54E40', fontSize: 11, lineHeight: 16, marginTop: 2, marginBottom: 5 }, unlockButton: { width: '100%', minHeight: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: ink, marginTop: 5 }, disabled: { opacity: 0.5 }, unlockText: { color: 'white', fontSize: 13, fontWeight: '700' }, bioButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, marginTop: 7 }, bioButtonText: { color: ink, fontSize: 12, fontWeight: '700' }, footer: { color: '#919C94', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 21 },
});


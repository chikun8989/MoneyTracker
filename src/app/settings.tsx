import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { APP_LOCK_KEYS, getLockValue, removeLockValue, setLockValue } from '@/lib/app-lock-storage';

const ink = '#18352B';
type LockMode = 'pin' | 'password';
type Action = 'enable' | 'change' | 'disable' | 'biometric';

function showMessage(title: string, body: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${body}`);
  else Alert.alert(title, body);
}

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<LockMode>('pin');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricName, setBiometricName] = useState('Biometric unlock');
  const [action, setAction] = useState<Action | null>(null);
  const [nextBiometric, setNextBiometric] = useState(false);
  const [currentSecret, setCurrentSecret] = useState('');
  const [nextMode, setNextMode] = useState<LockMode>('pin');
  const [newSecret, setNewSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [savedSecret, savedMode, savedEnabled, savedBiometric] = await Promise.all([
        getLockValue(APP_LOCK_KEYS.secret), getLockValue(APP_LOCK_KEYS.mode), getLockValue(APP_LOCK_KEYS.enabled), getLockValue(APP_LOCK_KEYS.biometric),
      ]);
      const available = Platform.OS !== 'web' && await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
      const types = Platform.OS !== 'web' ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];
      setEnabled(savedEnabled !== 'false' && Boolean(savedSecret));
      setMode(savedMode === 'password' ? 'password' : 'pin');
      setNextMode(savedMode === 'password' ? 'password' : 'pin');
      setBiometricEnabled(savedBiometric === 'true');
      setBiometricAvailable(available);
      setBiometricName(types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) ? 'Fingerprint unlock' : types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'Face ID / face unlock' : 'Biometric unlock');
    } catch (loadError) {
      showMessage('Could not load security settings', loadError instanceof Error ? loadError.message : 'Try again.');
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const openAction = (nextAction: Action, biometric = false) => {
    setAction(nextAction);
    setNextBiometric(biometric);
    setCurrentSecret(''); setNewSecret(''); setConfirmation(''); setError('');
  };

  const closeAction = () => {
    setAction(null); setCurrentSecret(''); setNewSecret(''); setConfirmation(''); setError('');
  };

  const save = async () => {
    if (!action) return;
    setBusy(true); setError('');
    try {
      const savedSecret = await getLockValue(APP_LOCK_KEYS.secret);
      if (action !== 'enable' && (!savedSecret || currentSecret !== savedSecret)) {
        setError('The current PIN or password is incorrect.');
        return;
      }
      if (action === 'disable') {
        await Promise.all([
          setLockValue(APP_LOCK_KEYS.enabled, 'false'),
          setLockValue(APP_LOCK_KEYS.biometric, 'false'),
          setLockValue(APP_LOCK_KEYS.attempts, '0'),
          setLockValue(APP_LOCK_KEYS.lockUntil, '0'),
          removeLockValue(APP_LOCK_KEYS.secret),
          removeLockValue(APP_LOCK_KEYS.mode),
        ]);
        setEnabled(false); setBiometricEnabled(false); closeAction();
        showMessage('App lock turned off', 'Your records remain in the app. You can turn the lock back on in Settings.');
        return;
      }
      if (action === 'biometric') {
        await setLockValue(APP_LOCK_KEYS.biometric, String(nextBiometric));
        setBiometricEnabled(nextBiometric); closeAction();
        showMessage(nextBiometric ? 'Biometric unlock enabled' : 'Biometric unlock disabled', nextBiometric ? 'You can use biometrics or your PIN/password when the app opens.' : 'Your PIN or password will be required when the app opens.');
        return;
      }
      const minimumLength = nextMode === 'pin' ? 6 : 8;
      if (newSecret.length < minimumLength) { setError(`${nextMode === 'pin' ? 'PIN' : 'Password'} must be at least ${minimumLength} ${nextMode === 'pin' ? 'digits' : 'characters'}.`); return; }
      if (nextMode === 'pin' && !/^\d+$/.test(newSecret)) { setError('PIN must contain digits only.'); return; }
      if (newSecret !== confirmation) { setError('The new entries do not match.'); return; }
      await Promise.all([
        setLockValue(APP_LOCK_KEYS.secret, newSecret),
        setLockValue(APP_LOCK_KEYS.mode, nextMode),
        setLockValue(APP_LOCK_KEYS.enabled, 'true'),
        setLockValue(APP_LOCK_KEYS.attempts, '0'),
        setLockValue(APP_LOCK_KEYS.lockUntil, '0'),
      ]);
      setMode(nextMode); setEnabled(true); closeAction();
      showMessage(action === 'enable' ? 'App lock enabled' : 'Credential changed', 'Your updated PIN or password will be required the next time the app locks.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update this setting.');
    } finally { setBusy(false); }
  };

  const title = action === 'enable' ? 'Turn on app lock' : action === 'change' ? 'Change PIN or password' : action === 'disable' ? 'Turn off app lock' : 'Biometric unlock';
  const needsNewCredential = action === 'enable' || action === 'change';
  const modeInput = (value: string, setter: (next: string) => void, label: string) => <TextInput value={value} onChangeText={(text) => { setter(nextMode === 'pin' ? text.replace(/\D/g, '').slice(0, 12) : text); setError(''); }} placeholder={label} placeholderTextColor="#94A198" secureTextEntry keyboardType={nextMode === 'pin' ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel={label} />;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.kicker}>PERSONALIZE YOUR APP</Text><Text style={s.title}>Settings</Text><Text style={s.subtitle}>Manage app access and privacy on this device.</Text>
      {loading ? <ActivityIndicator color={ink} style={{ marginTop: 40 }} /> : <>
        <View style={s.sectionHead}><Text style={s.sectionTitle}>Security</Text><Text style={s.sectionNote}>Stored securely on this device</Text></View>
        <View style={s.card}>
          <View style={s.row}><View style={s.icon}><Text style={s.iconGlyph}>⌑</Text></View><View style={s.rowCopy}><Text style={s.rowTitle}>App lock</Text><Text style={s.rowSub}>{enabled ? `${mode === 'pin' ? 'PIN' : 'Password'} required when you reopen the app` : 'Your app opens without a PIN or password'}</Text></View><Switch value={enabled} onValueChange={(value) => openAction(value ? 'enable' : 'disable')} trackColor={{ false: '#D9E1DC', true: '#8EB4A0' }} thumbColor={enabled ? ink : '#F7F8F6'} accessibilityLabel="App lock" /></View>
          {enabled && <>
            <View style={s.divider} />
            <Pressable onPress={() => { setNextMode(mode); openAction('change'); }} style={s.actionRow}><View style={s.actionCopy}><Text style={s.rowTitle}>Change PIN or password</Text><Text style={s.rowSub}>Verify your current credential first</Text></View><Text style={s.chevron}>›</Text></Pressable>
            {biometricAvailable && <><View style={s.divider} /><View style={s.row}><View style={s.actionCopy}><Text style={s.rowTitle}>{biometricName}</Text><Text style={s.rowSub}>Use device biometrics as an alternative</Text></View><Switch value={biometricEnabled} onValueChange={(value) => openAction('biometric', value)} trackColor={{ false: '#D9E1DC', true: '#8EB4A0' }} thumbColor={biometricEnabled ? ink : '#F7F8F6'} accessibilityLabel={biometricName} /></View></>}
          </>}
        </View>
        <View style={s.infoCard}><Text style={s.infoTitle}>Your data stays on this device</Text><Text style={s.infoText}>The app lock protects access to the app. Your accounts and transactions remain in the local database. Export a backup before changing or reinstalling the app.</Text></View>
      </>}
    </ScrollView>

    <Modal visible={Boolean(action)} transparent animationType="fade" onRequestClose={closeAction}>
      <KeyboardAvoidingView style={s.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>{title}</Text>
          <Text style={s.modalSub}>{action === 'enable' ? 'Create a credential to protect the app.' : action === 'change' ? 'Confirm your current credential, then enter a new one.' : action === 'disable' ? 'Confirm your credential to turn off the app lock.' : 'Confirm your PIN or password to change this option.'}</Text>
          {action !== 'enable' && <TextInput value={currentSecret} onChangeText={(value) => { setCurrentSecret(mode === 'pin' ? value.replace(/\D/g, '').slice(0, 12) : value); setError(''); }} placeholder={`Current ${mode}`} placeholderTextColor="#94A198" secureTextEntry keyboardType={mode === 'pin' ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel={`Current ${mode}`} />}
          {needsNewCredential && <>
            <View style={s.modeRow}><Pressable onPress={() => setNextMode('pin')} style={[s.modeChip, nextMode === 'pin' && s.modeChipOn]}><Text style={[s.modeText, nextMode === 'pin' && s.modeTextOn]}>PIN</Text></Pressable><Pressable onPress={() => setNextMode('password')} style={[s.modeChip, nextMode === 'password' && s.modeChipOn]}><Text style={[s.modeText, nextMode === 'password' && s.modeChipOn && s.modeTextOn]}>Password</Text></Pressable></View>
            {modeInput(newSecret, setNewSecret, `New ${nextMode}`)}
            {modeInput(confirmation, setConfirmation, `Confirm new ${nextMode}`)}
          </>}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={s.modalActions}><Pressable disabled={busy} onPress={closeAction} style={s.cancelButton}><Text style={s.cancelText}>Cancel</Text></Pressable><Pressable disabled={busy} onPress={() => void save()} style={[s.saveButton, action === 'disable' && s.destructive]}><Text style={s.saveText}>{busy ? 'Saving…' : action === 'disable' ? 'Turn off' : action === 'change' ? 'Save new credential' : action === 'enable' ? 'Enable lock' : 'Confirm'}</Text></Pressable></View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8F4' }, page: { padding: 21, paddingBottom: 45 }, kicker: { color: '#78867E', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, title: { color: ink, fontSize: 29, fontWeight: '700', marginTop: 5 }, subtitle: { color: '#78867E', fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 24 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }, sectionTitle: { color: ink, fontSize: 16, fontWeight: '700' }, sectionNote: { color: '#87938B', fontSize: 9 },
  card: { backgroundColor: 'white', borderRadius: 18, paddingHorizontal: 15, paddingVertical: 4 }, row: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#E7F0E8', alignItems: 'center', justifyContent: 'center' }, iconGlyph: { color: ink, fontSize: 21, fontWeight: '700' }, rowCopy: { flex: 1 }, rowTitle: { color: ink, fontSize: 12, fontWeight: '700' }, rowSub: { color: '#839087', fontSize: 10, lineHeight: 15, marginTop: 3 }, divider: { height: 1, backgroundColor: '#EEF1EC' }, actionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center' }, actionCopy: { flex: 1 }, chevron: { color: '#8A978F', fontSize: 24, paddingHorizontal: 5 },
  infoCard: { backgroundColor: '#E9F0E8', borderRadius: 16, padding: 15, marginTop: 15 }, infoTitle: { color: ink, fontSize: 12, fontWeight: '700' }, infoText: { color: '#65756B', fontSize: 10, lineHeight: 16, marginTop: 5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,26,18,0.42)', justifyContent: 'center', padding: 20 }, modalCard: { width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: '#F7F8F4', borderRadius: 20, padding: 20 }, modalTitle: { color: ink, fontSize: 18, fontWeight: '800' }, modalSub: { color: '#718078', fontSize: 11, lineHeight: 17, marginTop: 5, marginBottom: 15 }, input: { minHeight: 46, backgroundColor: 'white', borderWidth: 1, borderColor: '#E1E7E1', borderRadius: 12, paddingHorizontal: 13, marginBottom: 9, color: ink, fontSize: 14 }, modeRow: { flexDirection: 'row', gap: 7, marginBottom: 10 }, modeChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: '#E9EDE7' }, modeChipOn: { backgroundColor: ink }, modeText: { color: '#69776F', fontSize: 10, fontWeight: '600' }, modeTextOn: { color: 'white' }, error: { color: '#A54E40', fontSize: 10, lineHeight: 15, marginBottom: 8 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }, cancelButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13 }, cancelText: { color: '#65756B', fontSize: 11, fontWeight: '700' }, saveButton: { minHeight: 40, minWidth: 100, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: 11, backgroundColor: ink }, destructive: { backgroundColor: '#A94F41' }, saveText: { color: 'white', fontSize: 11, fontWeight: '700' },
});

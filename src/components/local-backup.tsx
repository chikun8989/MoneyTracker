import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Directory, File } from 'expo-file-system';
import { getAppSetting, setAppSetting } from '@/lib/database';
import { makeLocalBackup, restoreBackupData } from '@/lib/file-backup';

const ink = '#18352B';
const BACKUP_FOLDER_URI_KEY = 'localBackupFolderUri';

function message(title: string, body: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${body}`);
  else Alert.alert(title, body);
}

function confirmRestore(body: string) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`Restore backup?\n\n${body}`));
  return new Promise<boolean>((resolve) => Alert.alert('Restore backup?', body, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Replace data', style: 'destructive', onPress: () => resolve(true) },
  ]));
}

async function selectBackupFolder() {
  const savedUri = await getAppSetting(BACKUP_FOLDER_URI_KEY);
  let parent: Directory | null = null;
  if (savedUri) {
    try {
      const savedFolder = new Directory(savedUri);
      if (savedFolder.exists) parent = savedFolder;
    } catch { /* Reopen the folder picker if access to the saved location expired. */ }
  }
  if (!parent) parent = await Directory.pickDirectoryAsync(savedUri ?? undefined);

  const destination = parent.name.toLowerCase() === 'moneytracker'
    ? parent
    : parent.list().find((entry): entry is Directory => entry instanceof Directory && entry.name.toLowerCase() === 'moneytracker') ?? parent.createDirectory('MoneyTracker');
  await setAppSetting(BACKUP_FOLDER_URI_KEY, destination.uri);
  return destination;
}

export function LocalBackup() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const saveBackup = async () => {
    setBusy(true);
    setNotice('');
    try {
      const backup = await makeLocalBackup();
      const content = JSON.stringify(backup, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `MoneyTracker-backup-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Backup downloaded. Move the file to Google Drive or another location if you want an off-device copy.');
      } else {
        const folder = await selectBackupFolder();
        const stamp = backup.exportedAt.replace(/[:.]/g, '-');
        const file = folder.createFile(`MoneyTracker-backup-${stamp}.json`, 'application/json');
        await file.write(content);
        setNotice(`Backup saved to ${folder.name}. Future backups will use this folder when its permission remains available.`);
      }
    } catch (error) {
      message('Backup could not be saved', error instanceof Error ? error.message : 'Choose a folder and try again.');
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    setBusy(true);
    setNotice('');
    try {
      const selection = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/json'] });
      if (selection.canceled || !selection.result) return;
      const content = await selection.result.text();
      const parsed: unknown = JSON.parse(content);
      const count = parsed && typeof parsed === 'object' && 'transactions' in parsed && Array.isArray(parsed.transactions) ? parsed.transactions.length : 0;
      const accepted = await confirmRestore(`This replaces the accounts and transactions currently stored on this device with ${count} transactions from the selected file.`);
      if (!accepted) return;
      await restoreBackupData(parsed);
      setNotice(`Restored ${count} transactions from the selected backup file.`);
    } catch (error) {
      message('Restore failed', error instanceof Error ? error.message : 'Select a valid MoneyTracker backup file.');
    } finally {
      setBusy(false);
    }
  };

  return <View style={s.card}>
    <View style={s.header}><View style={s.icon}><Text style={s.iconText}>↥</Text></View><View style={s.heading}><Text style={s.title}>Backup & restore</Text><Text style={s.subtitle}>Save a copy wherever you choose</Text></View></View>
    <Text style={s.body}>Your records stay on this device unless you export them. The first backup asks you to choose a location, then creates a MoneyTracker folder there. Later backups reuse that folder when the device allows it. No Google sign-in, OAuth client ID, website, or MoneyTracker server is used.</Text>
    <View style={s.buttons}>
      <Pressable disabled={busy} onPress={() => void saveBackup()} style={s.primary}>{busy ? <ActivityIndicator color="white" size="small" /> : <Text style={s.primaryText}>Backup</Text>}</Pressable>
      <Pressable disabled={busy} onPress={() => void restoreBackup()} style={s.secondary}><Text style={s.secondaryText}>Restore</Text></Pressable>
    </View>
    <Text style={s.caption}>The backup is a readable JSON file containing account details, balances, categories, notes, amounts, and dates. Protect the file like your financial records.</Text>
    {notice ? <Text style={s.notice}>{notice}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: 'white', borderRadius: 19, padding: 16, marginTop: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E7F0E8', alignItems: 'center', justifyContent: 'center' }, iconText: { color: ink, fontSize: 21, fontWeight: '800' }, heading: { flex: 1 }, title: { color: ink, fontSize: 14, fontWeight: '700' }, subtitle: { color: '#77867E', fontSize: 10, marginTop: 3 },
  body: { color: '#596960', fontSize: 11, lineHeight: 17, marginTop: 13 }, buttons: { flexDirection: 'row', gap: 8, marginTop: 14 }, primary: { minHeight: 42, flex: 1, backgroundColor: ink, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, primaryText: { color: 'white', fontSize: 11, fontWeight: '700' }, secondary: { minHeight: 42, minWidth: 90, backgroundColor: '#E8EFE8', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, secondaryText: { color: ink, fontSize: 11, fontWeight: '700' }, caption: { color: '#8A958E', fontSize: 10, lineHeight: 15, marginTop: 10 }, notice: { color: '#43825A', fontSize: 10, lineHeight: 15, marginTop: 8 },
});

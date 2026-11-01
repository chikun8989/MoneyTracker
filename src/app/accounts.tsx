import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Account, AccountType, addAccount, archiveAccount, clearAllFinancialData, listAccounts, updateAccount } from '@/lib/database';
import { formatMoney, dateOnly, parseNonNegativeAmountToMinor } from '@/lib/finance';
import { LocalBackup } from '@/components/local-backup';

const ink = '#18352B';
const types: AccountType[] = ['cash', 'bank', 'wallet', 'credit', 'loan', 'other'];

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Account | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const refresh = useCallback(async () => {
    try { setAccounts(await listAccounts()); }
    catch { Alert.alert('Could not load accounts', 'Please reopen the app and try again.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const totalAvailable = accounts.filter((item) => ['cash', 'bank', 'wallet'].includes(item.type)).reduce((sum, item) => sum + item.currentBalanceMinor, 0);
  const openForm = (account?: Account) => { setEditing(account); setFormOpen(true); };

  const confirmArchive = (account: Account) => Alert.alert('Archive account?', `${account.name} will be hidden from new entries. Existing history will remain.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: () => { void archiveAccount(account.id).then(refresh).catch((error: Error) => Alert.alert('Could not archive', error.message)); } },
  ]);

  const resetData = () => {
    void clearAllFinancialData().then(refresh).catch((error: Error) => {
      if (Platform.OS === 'web') window.alert(`Could not clear data: ${error.message}`);
      else Alert.alert('Could not clear data', error.message);
    });
  };
  const confirmReset = () => {
    const message = 'This permanently deletes every account and transaction stored on this device. A fresh Cash account will be created. Export a backup first if you may need this data.';
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete all saved data?\n\n${message}`)) resetData();
      return;
    }
    Alert.alert('Delete all saved data?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all data', style: 'destructive', onPress: resetData },
    ]);
  };

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.kicker}>WHERE YOUR MONEY LIVES</Text><Text style={s.title}>Accounts</Text><Text style={s.subtitle}>Cash, banks, wallets and other accounts</Text>
      <View style={s.totalCard}><Text style={s.totalLabel}>AVAILABLE CASH AND BANK</Text><Text style={s.total}>{formatMoney(totalAvailable)}</Text><Text style={s.totalHint}>Investments and debts are tracked separately.</Text></View>
      <View style={s.header}><Text style={s.sectionTitle}>Your accounts</Text><Pressable onPress={() => openForm()} style={s.addBtn}><Text style={s.addText}>+ Add account</Text></Pressable></View>
      {loading ? <ActivityIndicator color={ink} style={{ marginTop: 35 }} /> : accounts.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>No accounts yet</Text><Text style={s.emptyBody}>Create a cash or bank account to track where transactions happen.</Text></View> : accounts.map((account) => <Pressable key={account.id} onPress={() => router.push({ pathname: '/explore', params: { accountId: String(account.id) } })} onLongPress={() => Alert.alert(account.name, 'Choose an account action.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Edit', onPress: () => openForm(account) }, { text: 'Archive', style: 'destructive', onPress: () => confirmArchive(account) }])} style={s.accountCard}>
        <View style={s.accountTop}><View style={s.accountIcon}><Text style={s.accountInitial}>{account.name[0]?.toUpperCase() ?? 'A'}</Text></View><View style={s.accountMain}><Text style={s.accountName}>{account.name}</Text><Text style={s.accountMeta}>{account.institution || account.type} · {account.type.toUpperCase()}</Text></View><Text style={s.menu}>···</Text></View>
        <View style={s.balanceRow}><Text style={s.balanceLabel}>Current balance</Text><Text style={s.balance}>{formatMoney(account.currentBalanceMinor, account.currency)}</Text></View>
        <Text style={s.opening}>Opening balance {formatMoney(account.openingBalanceMinor, account.currency)} · Since {account.openingDate}</Text>
      </Pressable>)}
      <LocalBackup />
      <Text style={s.hint}>Tap an account to view its activity. Press and hold for edit or archive.</Text>
      <Pressable onPress={confirmReset} style={s.resetButton}><Text style={s.resetText}>Clear all app data</Text></Pressable>
    </ScrollView>
    {formOpen && <AccountForm key={editing?.id ?? 'new-account'} initial={editing} onClose={() => setFormOpen(false)} onSaved={() => { void refresh(); }} />}
  </SafeAreaView>;
}

function AccountForm({ initial, onClose, onSaved }: { initial?: Account; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [institution, setInstitution] = useState(initial?.institution ?? '');
  const [type, setType] = useState<AccountType>(initial?.type ?? 'cash');
  const [opening, setOpening] = useState(initial ? (initial.openingBalanceMinor / 100).toFixed(2) : '0');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const validAmount = parseNonNegativeAmountToMinor(opening);
    if (!name.trim()) { Alert.alert('Account name required'); return; }
    if (validAmount === null || !Number.isSafeInteger(validAmount)) { Alert.alert('Check the opening balance', 'Enter a non-negative amount with up to two decimal places.'); return; }
    setSaving(true);
    try {
      if (initial) await updateAccount(initial.id, { name, institution, type });
      else await addAccount({ name, institution, type, openingBalanceMinor: validAmount, openingDate: dateOnly() });
      onSaved(); onClose();
    } catch { Alert.alert('Could not save account', 'Please try again.'); }
    finally { setSaving(false); }
  };
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}><View style={s.scrim}><View style={s.form}><View style={s.handle} /><View style={s.formHeader}><Text style={s.formTitle}>{initial ? 'Edit account' : 'Add account'}</Text><Pressable onPress={onClose}><Text style={s.close}>X</Text></Pressable></View>
    <Text style={s.label}>ACCOUNT NAME</Text><TextInput value={name} onChangeText={setName} placeholder="e.g. Main savings" style={s.input} maxLength={50} />
    <Text style={s.label}>ACCOUNT TYPE</Text><View style={s.types}>{types.map((value) => <Pressable key={value} onPress={() => setType(value)} style={[s.typeChip, type === value && s.typeOn]}><Text style={[s.typeText, type === value && s.typeTextOn]}>{value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
    <Text style={s.label}>BANK OR INSTITUTION (OPTIONAL)</Text><TextInput value={institution} onChangeText={setInstitution} placeholder="e.g. SBI" style={s.input} maxLength={60} />
    {!initial && <><Text style={s.label}>OPENING BALANCE (INR)</Text><TextInput value={opening} onChangeText={setOpening} keyboardType="decimal-pad" style={s.input} /></>}
    <Pressable onPress={() => void save()} disabled={saving} style={s.save}>{saving ? <ActivityIndicator color="white" /> : <Text style={s.saveText}>{initial ? 'Save changes' : 'Create account'}</Text>}</Pressable>
  </View></View></Modal>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F7F8F4' }, page: { paddingHorizontal: 21, paddingTop: 17, paddingBottom: 35 }, kicker: { color: '#77867E', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, title: { color: ink, fontSize: 29, fontWeight: '700', marginTop: 5 }, subtitle: { color: '#7A877F', fontSize: 12, marginTop: 4, marginBottom: 18 }, totalCard: { backgroundColor: ink, padding: 19, borderRadius: 21, marginBottom: 23 }, totalLabel: { color: '#C2D2C7', fontSize: 10, letterSpacing: 1, fontWeight: '700' }, total: { color: 'white', fontSize: 30, fontWeight: '700', marginTop: 9 }, totalHint: { color: '#BDCDC2', fontSize: 10, marginTop: 5 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, sectionTitle: { color: ink, fontSize: 17, fontWeight: '700' }, addBtn: { backgroundColor: '#E3ECE4', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }, addText: { color: ink, fontSize: 11, fontWeight: '700' }, accountCard: { backgroundColor: 'white', borderRadius: 18, padding: 15, marginBottom: 11 }, accountTop: { flexDirection: 'row', alignItems: 'center' }, accountIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: '#E4EEE6', alignItems: 'center', justifyContent: 'center' }, accountInitial: { color: ink, fontWeight: '700' }, accountMain: { flex: 1, marginLeft: 10 }, accountName: { color: ink, fontWeight: '700', fontSize: 13 }, accountMeta: { color: '#839087', fontSize: 10, marginTop: 3, textTransform: 'capitalize' }, menu: { color: '#86928A', fontSize: 18 }, balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EFF1ED', marginTop: 13, paddingTop: 12 }, balanceLabel: { color: '#77867E', fontSize: 11 }, balance: { color: ink, fontWeight: '700', fontSize: 15 }, opening: { color: '#929D95', fontSize: 9, marginTop: 8 }, hint: { color: '#89958D', textAlign: 'center', fontSize: 10, marginTop: 15 }, resetButton: { alignItems: 'center', paddingVertical: 14, marginTop: 8 }, resetText: { color: '#B24B3C', fontSize: 12, fontWeight: '700' }, empty: { backgroundColor: 'white', padding: 22, borderRadius: 18, alignItems: 'center' }, emptyTitle: { color: ink, fontWeight: '700', fontSize: 15 }, emptyBody: { color: '#7A877F', fontSize: 11, textAlign: 'center', marginTop: 6, lineHeight: 17 }, scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,29,22,.42)' }, form: { backgroundColor: '#FBFCF8', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 27 }, handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: '#D6DDD7', alignSelf: 'center', marginBottom: 17 }, formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, formTitle: { color: ink, fontSize: 20, fontWeight: '700' }, close: { color: '#77867E', fontSize: 15, padding: 5 }, label: { color: '#748279', fontSize: 10, letterSpacing: 1, fontWeight: '700', marginTop: 11, marginBottom: 7 }, input: { minHeight: 43, borderRadius: 11, backgroundColor: '#F0F3EE', paddingHorizontal: 12, color: ink, fontSize: 13 }, types: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, typeChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#EEF1EC' }, typeOn: { backgroundColor: ink }, typeText: { color: '#69786F', fontSize: 10, fontWeight: '600' }, typeTextOn: { color: 'white' }, save: { height: 49, backgroundColor: ink, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, saveText: { color: 'white', fontWeight: '700', fontSize: 13 } });

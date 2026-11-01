import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Account, addTransaction, EntryKind, listAccounts, NewTransaction, Transaction, updateTransaction } from '@/lib/database';
import { dateOnly, expenseCategories, incomeCategories, parseAmountToMinor } from '@/lib/finance';
import { DatePickerField } from '@/components/date-picker-field';

const ink = '#18352B';

type Props = { visible: boolean; onClose: () => void; onSaved: () => void; initial?: Transaction };
export function TransactionForm({ visible, onClose, onSaved, initial }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(initial ? (initial.amountMinor / 100).toFixed(2) : '');
  const [category, setCategory] = useState(initial?.category ?? 'Food');
  const [note, setNote] = useState(initial?.note ?? '');
  const [date, setDate] = useState(initial?.occurredAt ?? dateOnly());
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null);
  const [destinationId, setDestinationId] = useState<number | null>(initial?.destinationAccountId ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await listAccounts(Boolean(initial));
        if (active) {
          setAccounts(result);
          const fallbackSourceId = initial?.accountId ?? result[0]?.id;
          const fallbackDestinationId = result.find((account) => account.id !== fallbackSourceId)?.id;
          setAccountId((current) => current ?? fallbackSourceId ?? null);
          setDestinationId((current) => current ?? fallbackDestinationId ?? null);
        }
      } catch { if (active) Alert.alert('Could not load accounts'); }
    };
    void load();
    return () => { active = false; };
  }, [initial]);

  const availableCategories = kind === 'income' ? incomeCategories : expenseCategories;
  const selectKind = (next: EntryKind) => {
    setKind(next);
    setCategory(next === 'income' ? 'Salary' : next === 'transfer' ? 'Transfer' : 'Food');
  };
  const save = async () => {
    const amountMinor = parseAmountToMinor(amount);
    if (amountMinor === null) { Alert.alert('Check the amount', 'Enter a positive amount with up to two decimal places.'); return; }
    if (!accountId) { Alert.alert('Add an account first', 'Create a cash or bank account before recording a transaction.'); return; }
    if (kind === 'transfer' && (!destinationId || destinationId === accountId)) { Alert.alert('Choose another account', 'A transfer needs two different accounts.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) { Alert.alert('Check the date', 'Use the YYYY-MM-DD format.'); return; }
    const input: NewTransaction = { kind, amountMinor, category, note, occurredAt: date, accountId, destinationAccountId: kind === 'transfer' ? destinationId : null };
    setSaving(true);
    try {
      if (initial) await updateTransaction(initial.id, input);
      else await addTransaction(input);
      onSaved();
      onClose();
    } catch { Alert.alert('Could not save', 'The transaction was not changed. Please try again.'); }
    finally { setSaving(false); }
  };

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView style={s.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.titleRow}><Text style={s.title}>{initial ? 'Edit transaction' : 'New transaction'}</Text><Pressable onPress={onClose} accessibilityLabel="Close"><Text style={s.close}>X</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.segment}>{(['expense', 'income', 'transfer'] as EntryKind[]).map((value) => <Pressable key={value} onPress={() => selectKind(value)} style={[s.segmentItem, kind === value && s.segmentOn]}><Text style={[s.segmentText, kind === value && s.segmentTextOn]}>{value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
          <Text style={s.label}>AMOUNT (INR)</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" style={s.input} />
          {kind !== 'transfer' && <><Text style={s.label}>CATEGORY</Text><View style={s.chips}>{availableCategories.map((value) => <Pressable key={value} onPress={() => setCategory(value)} style={[s.chip, category === value && s.chipOn]}><Text style={[s.chipText, category === value && s.chipTextOn]}>{value}</Text></Pressable>)}</View></>}
          <Text style={s.label}>{kind === 'transfer' ? 'FROM ACCOUNT' : 'ACCOUNT'}</Text>
          <View style={s.chips}>{accounts.map((account) => <Pressable key={account.id} onPress={() => setAccountId(account.id)} style={[s.chip, accountId === account.id && s.chipOn]}><Text style={[s.chipText, accountId === account.id && s.chipTextOn]}>{account.name}</Text></Pressable>)}{accounts.length === 0 && <Text style={s.helper}>No accounts found. Add one from the Accounts tab.</Text>}</View>
          {kind === 'transfer' && <><Text style={s.label}>TO ACCOUNT</Text><View style={s.chips}>{accounts.filter((account) => account.id !== accountId).map((account) => <Pressable key={account.id} onPress={() => setDestinationId(account.id)} style={[s.chip, destinationId === account.id && s.chipOn]}><Text style={[s.chipText, destinationId === account.id && s.chipTextOn]}>{account.name}</Text></Pressable>)}</View></>}
          <DatePickerField value={date} onChange={setDate} label="DATE" />
          <Text style={s.label}>NOTE (OPTIONAL)</Text><TextInput value={note} onChangeText={setNote} placeholder="Add a short description" style={s.input} maxLength={120} />
          <Pressable disabled={saving} onPress={() => void save()} style={[s.save, saving && { opacity: 0.65 }]}>{saving ? <ActivityIndicator color="white" /> : <Text style={s.saveText}>{initial ? 'Save changes' : 'Save transaction'}</Text>}</Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const s = StyleSheet.create({ scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,29,22,.42)' }, sheet: { maxHeight: '92%', backgroundColor: '#FBFCF8', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 24 }, handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: '#D6DDD7', alignSelf: 'center', marginBottom: 16 }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }, title: { color: ink, fontSize: 20, fontWeight: '700' }, close: { color: '#718078', fontSize: 16, padding: 6 }, segment: { flexDirection: 'row', backgroundColor: '#EDF1EC', borderRadius: 13, padding: 4, marginBottom: 14 }, segmentItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 }, segmentOn: { backgroundColor: 'white' }, segmentText: { color: '#738077', fontSize: 12, fontWeight: '600' }, segmentTextOn: { color: ink }, label: { color: '#748279', fontSize: 10, letterSpacing: 1, fontWeight: '700', marginTop: 10, marginBottom: 7 }, input: { minHeight: 44, backgroundColor: '#F0F3EE', borderRadius: 12, paddingHorizontal: 12, color: ink, fontSize: 14 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { backgroundColor: '#EEF1EC', borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8 }, chipOn: { backgroundColor: ink }, chipText: { color: '#66756C', fontSize: 11, fontWeight: '600' }, chipTextOn: { color: 'white' }, helper: { color: '#7A877F', fontSize: 12, paddingVertical: 6 }, save: { height: 50, backgroundColor: ink, alignItems: 'center', justifyContent: 'center', borderRadius: 14, marginTop: 18 }, saveText: { color: 'white', fontSize: 14, fontWeight: '700' } });

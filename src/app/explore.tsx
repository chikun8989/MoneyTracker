import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, SafeAreaView, SectionList, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Account, EntryKind, listAccounts, listTransactions, NewTransaction, removeTransaction, replaceAllData, Transaction } from '@/lib/database';
import { formatMoney, parseAmountToMinor } from '@/lib/finance';
import { TransactionForm } from '@/components/transaction-form';
import { DatePickerField } from '@/components/date-picker-field';

const ink = '#18352B';
type DateFilter = 'all' | 'day' | 'month' | 'year' | 'custom';
const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};
const prettyDate = (value: string) => {
  const date = parseDateKey(value);
  return date ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : value;
};
const sectionDate = (value: string) => {
  const date = parseDateKey(value);
  return date ? new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date) : value;
};
type BackupPayload = { format: 'pocket-ledger-backup'; version: number; exportedAt?: string; accounts?: unknown[]; transactions: unknown[] };

export default function ActivityScreen() {
  const params = useLocalSearchParams<{ accountId?: string }>();
  const routeAccountId = Array.isArray(params.accountId) ? params.accountId[0] : params.accountId;
  const [items, setItems] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [kind, setKind] = useState<EntryKind | 'all'>('all');
  const [accountId, setAccountId] = useState<number | null>(routeAccountId ? Number(routeAccountId) : null);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [periodDate, setPeriodDate] = useState(() => new Date());
  const [fromDate, setFromDate] = useState(() => toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [toDate, setToDate] = useState(() => toDateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();

  const refresh = useCallback(async () => {
    try {
      const [transactions, nextAccounts] = await Promise.all([listTransactions(), listAccounts(true)]);
      setItems(transactions);
      setAccounts(nextAccounts);
      if (routeAccountId && Number.isFinite(Number(routeAccountId))) setAccountId(Number(routeAccountId));
    } catch { Alert.alert('Could not load activity', 'Please reopen the app and try again.'); }
    finally { setLoading(false); }
  }, [routeAccountId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const dateRange = useMemo(() => {
    if (dateFilter === 'all') return { from: '', to: '' };
    if (dateFilter === 'custom') return { from: fromDate, to: toDate };
    if (dateFilter === 'day') { const day = toDateKey(periodDate); return { from: day, to: day }; }
    if (dateFilter === 'year') return { from: `${periodDate.getFullYear()}-01-01`, to: `${periodDate.getFullYear()}-12-31` };
    return { from: toDateKey(new Date(periodDate.getFullYear(), periodDate.getMonth(), 1)), to: toDateKey(new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0)) };
  }, [dateFilter, periodDate, fromDate, toDate]);
  const invalidRange = dateFilter === 'custom' && (!parseDateKey(fromDate) || !parseDateKey(toDate) || fromDate > toDate);
  const periodLabel = dateFilter === 'day' ? prettyDate(toDateKey(periodDate)) : dateFilter === 'year' ? String(periodDate.getFullYear()) : new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(periodDate);
  const movePeriod = (amount: number) => setPeriodDate((current) => dateFilter === 'day' ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + amount) : dateFilter === 'year' ? new Date(current.getFullYear() + amount, current.getMonth(), 1) : new Date(current.getFullYear(), current.getMonth() + amount, 1));

  const visible = useMemo(() => items.filter((item) => {
    if (kind !== 'all' && item.kind !== kind) return false;
    if (accountId !== null && item.accountId !== accountId && item.destinationAccountId !== accountId) return false;
    if (invalidRange) return false;
    if (dateRange.from && item.occurredAt < dateRange.from) return false;
    if (dateRange.to && item.occurredAt > dateRange.to) return false;
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      const text = [item.category, item.note, item.accountName, item.destinationAccountName].join(' ').toLowerCase();
      if (!text.includes(needle)) return false;
    }
    return true;
  }), [items, kind, accountId, dateRange, invalidRange, query]);
  const sections = useMemo(() => {
    const grouped = new Map<string, Transaction[]>();
    for (const item of visible) grouped.set(item.occurredAt, [...(grouped.get(item.occurredAt) ?? []), item]);
    return [...grouped.entries()].map(([date, data]) => ({ date, data }));
  }, [visible]);

  const makePayload = async (): Promise<BackupPayload> => {
    const [allAccounts, transactions] = await Promise.all([listAccounts(true), listTransactions()]);
    return {
      format: 'pocket-ledger-backup', version: 2, exportedAt: new Date().toISOString(),
      accounts: allAccounts.map(({ id, name, institution, type, currency, openingBalanceMinor, openingDate, archived }) => ({ id, name, institution, type, currency, openingBalanceMinor, openingDate, archived })),
      transactions: transactions.map(({ kind: entryKind, amountMinor, category, note, occurredAt, accountId: sourceId, destinationAccountId }) => ({ kind: entryKind, amountMinor, category, note, occurredAt, accountId: sourceId, destinationAccountId })),
    };
  };
  const shareFile = async (file: File, mimeType: string, title: string) => {
    if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing unavailable', 'This device does not have a compatible app to save the export.'); return; }
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: title });
  };
  const exportBackup = async () => {
    setBusy(true);
    try {
      const file = new File(Paths.cache, `moneytracker-backup-${new Date().toISOString().slice(0, 10)}.json`);
      await file.write(JSON.stringify(await makePayload(), null, 2));
      await shareFile(file, 'application/json', 'Save your MoneyTracker backup');
    } catch { Alert.alert('Backup failed', 'Your local data has not changed. Please try again.'); }
    finally { setBusy(false); }
  };
  const exportCsv = async () => {
    setBusy(true);
    try {
      const q = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const lines = [['date', 'type', 'category', 'account', 'destination_account', 'amount_inr', 'note'].join(',')];
      for (const item of visible) lines.push([item.occurredAt, item.kind, item.category, item.accountName ?? '', item.destinationAccountName ?? '', (item.amountMinor / 100).toFixed(2), item.note].map(q).join(','));
      const filename = `moneytracker-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const file = new File(Paths.cache, filename);
        await file.write(lines.join('\n'));
        await shareFile(file, 'text/csv', 'Export filtered transactions as CSV');
      }
    } catch { Alert.alert('CSV export failed', 'Please try again.'); }
    finally { setBusy(false); }
  };

  const validateBackup = (parsed: BackupPayload) => {
    if (parsed.format !== 'pocket-ledger-backup' || !Array.isArray(parsed.transactions) || parsed.transactions.length > 100000) throw new Error('Unsupported backup format');
    if (parsed.version === 1) {
      const transactions = parsed.transactions.map((raw) => {
        const row = raw as Record<string, unknown>;
        const amountMinor = typeof row.amount === 'number' ? parseAmountToMinor(String(row.amount)) : null;
        if (!['income', 'expense'].includes(String(row.kind)) || amountMinor === null || typeof row.category !== 'string' || typeof row.note !== 'string' || typeof row.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.occurredAt)) throw new Error('Invalid legacy transaction');
        return { kind: row.kind as EntryKind, amountMinor, category: row.category, note: row.note, occurredAt: row.occurredAt, accountId: 1, destinationAccountId: null } satisfies NewTransaction;
      });
      return { accounts: [{ id: 1, name: 'Cash', institution: '', type: 'cash' as const, currency: 'INR', openingBalanceMinor: 0, openingDate: '2000-01-01', archived: 0 }], transactions };
    }
    if (parsed.version !== 2 || !Array.isArray(parsed.accounts) || parsed.accounts.length === 0 || parsed.accounts.length > 1000) throw new Error('Unsupported backup version');
    const validAccounts = parsed.accounts.map((raw) => {
      const row = raw as Record<string, unknown>;
      if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 || typeof row.name !== 'string' || row.name.length > 50 || typeof row.institution !== 'string' || !['cash', 'bank', 'wallet', 'credit', 'loan', 'other'].includes(String(row.type)) || typeof row.currency !== 'string' || !Number.isSafeInteger(row.openingBalanceMinor) || typeof row.openingDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.openingDate) || ![0, 1].includes(Number(row.archived))) throw new Error('Invalid account in backup');
      return { id: Number(row.id), name: row.name, institution: row.institution, type: row.type as Account['type'], currency: row.currency, openingBalanceMinor: Number(row.openingBalanceMinor), openingDate: row.openingDate, archived: Number(row.archived) };
    });
    const accountIds = new Set(validAccounts.map((account) => account.id));
    if (accountIds.size !== validAccounts.length) throw new Error('Duplicate account in backup');
    const validTransactions = parsed.transactions.map((raw) => {
      const row = raw as Record<string, unknown>;
      if (!['income', 'expense', 'transfer'].includes(String(row.kind)) || !Number.isSafeInteger(row.amountMinor) || Number(row.amountMinor) <= 0 || typeof row.category !== 'string' || typeof row.note !== 'string' || typeof row.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.occurredAt) || !Number.isSafeInteger(row.accountId) || !accountIds.has(Number(row.accountId))) throw new Error('Invalid transaction in backup');
      const destId = row.destinationAccountId === null ? null : Number(row.destinationAccountId);
      if (row.kind === 'transfer' && (!destId || !accountIds.has(destId) || destId === Number(row.accountId))) throw new Error('Invalid transfer in backup');
      if (row.kind !== 'transfer' && row.destinationAccountId !== null) throw new Error('Unexpected destination account');
      return { kind: row.kind as EntryKind, amountMinor: Number(row.amountMinor), category: row.category, note: row.note, occurredAt: row.occurredAt, accountId: Number(row.accountId), destinationAccountId: destId } satisfies NewTransaction;
    });
    return { accounts: validAccounts, transactions: validTransactions };
  };
  const importBackup = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'public.json'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(picked.assets[0].uri)) as BackupPayload;
      const data = validateBackup(parsed);
      Alert.alert('Restore backup?', `This will replace the accounts and transactions currently on this device with ${data.transactions.length} backed-up transactions.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace data', style: 'destructive', onPress: () => {
          setBusy(true);
          void (async () => {
            const safetyFile = new File(Paths.document, `moneytracker-before-restore-${Date.now()}.json`);
            await safetyFile.write(JSON.stringify(await makePayload(), null, 2));
            await replaceAllData(data.accounts, data.transactions);
            await refresh();
          })().catch(() => Alert.alert('Restore failed', 'A safety copy was kept if the restore began. Your current data was not intentionally cleared.')).finally(() => setBusy(false));
        } },
      ]);
    } catch { Alert.alert('Could not read backup', 'Choose a valid MoneyTracker JSON backup file.'); }
  };
  const deleteItem = (item: Transaction) => Alert.alert('Delete transaction?', `${item.category} | ${formatMoney(item.amountMinor)}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void removeTransaction(item.id).then(refresh).catch(() => Alert.alert('Delete failed', 'Please try again.')); } },
  ]);

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" />
    <View style={s.page}>
      <Text style={s.kicker}>YOUR MONEY, YOUR DEVICE</Text><Text style={s.title}>Transactions</Text><Text style={s.subtitle}>{visible.length} matching transaction{visible.length === 1 ? '' : 's'}</Text>
      <View style={s.actions}><Pressable disabled={busy} onPress={() => void exportBackup()} style={s.exportButton}><Text style={s.exportText}>{busy ? 'Working...' : 'Backup'}</Text></Pressable><Pressable disabled={busy} onPress={() => void importBackup()} style={s.exportButton}><Text style={s.exportText}>Restore</Text></Pressable><Pressable disabled={busy || visible.length === 0} onPress={() => void exportCsv()} accessibilityRole="button" accessibilityLabel="Download filtered transactions as CSV" style={[s.downloadButton, (busy || visible.length === 0) && s.downloadDisabled]}><SymbolView name={{ ios: 'arrow.down.to.line', android: 'file_download', web: 'file_download' }} size={17} tintColor={ink} /></Pressable></View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search note, category, or account" style={s.search} />
      <View style={s.filterRow}>{(['all', 'expense', 'income', 'transfer'] as const).map((value) => <Pressable key={value} onPress={() => setKind(value)} style={[s.filter, kind === value && s.filterOn]}><Text style={[s.filterText, kind === value && s.filterTextOn]}>{value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
      <View style={s.divider} />
      <View style={s.periodRow}>{(['day', 'month', 'year', 'custom', 'all'] as const).map((value) => <Pressable key={value} onPress={() => setDateFilter(value)} style={[s.periodFilter, dateFilter === value && s.filterOn]}><Text style={[s.periodText, dateFilter === value && s.filterTextOn]}>{value === 'all' ? 'All time' : value === 'custom' ? 'Custom range' : value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
      {dateFilter === 'custom' ? <View style={s.dateRow}><DatePickerField value={fromDate} onChange={setFromDate} label="FROM" containerStyle={s.dateField} buttonStyle={s.dateInput} /><Text style={s.to}>to</Text><DatePickerField value={toDate} onChange={setToDate} label="TO" containerStyle={s.dateField} buttonStyle={s.dateInput} /></View> : dateFilter !== 'all' ? <View style={s.periodControls}><Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => movePeriod(-1)} style={s.arrowButton}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={14} tintColor={ink} /></Pressable><Text style={s.periodLabel}>{periodLabel}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next period" onPress={() => movePeriod(1)} style={s.arrowButton}><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={ink} /></Pressable></View> : null}
      {invalidRange ? <Text style={s.validation}>Enter valid dates in YYYY-MM-DD format, with the start date before the end date.</Text> : null}
      <View style={s.divider} />
      <View style={s.accounts}><Pressable onPress={() => setAccountId(null)} style={[s.accountFilter, accountId === null && s.filterOn]}><Text numberOfLines={1} style={[s.filterText, accountId === null && s.filterTextOn]}>All accounts</Text></Pressable>{accounts.map((account) => <Pressable key={account.id} onPress={() => setAccountId(account.id)} style={[s.accountFilter, accountId === account.id && s.filterOn]}><Text numberOfLines={1} style={[s.filterText, accountId === account.id && s.filterTextOn]}>{account.name}</Text></Pressable>)}</View>
      {loading ? <ActivityIndicator color={ink} style={{ marginTop: 40 }} /> : <SectionList sections={sections} keyExtractor={(item) => String(item.id)} contentContainerStyle={sections.length === 0 ? { flexGrow: 1 } : { paddingBottom: 22 }} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTitle}>No transactions found</Text><Text style={s.emptyText}>{invalidRange ? 'Correct the custom date range to see transactions.' : 'Change the filters or add a transaction from Home.'}</Text></View>} renderSectionHeader={({ section }) => <View style={s.dayHeader}><Text style={s.dayTitle}>{sectionDate(section.date)}</Text><Text style={s.dayCount}>{section.data.length} transaction{section.data.length === 1 ? '' : 's'}</Text></View>} renderItem={({ item }) => <Pressable onPress={() => { setEditing(item); setFormOpen(true); }} onLongPress={() => deleteItem(item)} style={s.row}><View style={[s.icon, item.kind === 'income' && s.incomeIcon, item.kind === 'transfer' && s.transferIcon]}><Text style={s.glyph}>{item.kind === 'income' ? '+' : item.kind === 'transfer' ? 'T' : item.category[0]?.toUpperCase()}</Text></View><View style={s.rowInfo}><Text style={s.rowTitle}>{item.note || item.category}</Text><Text style={s.rowSub}>{item.kind[0].toUpperCase() + item.kind.slice(1)} | {item.category}</Text><Text style={s.rowDate}>{item.kind === 'transfer' ? `${item.accountName} -> ${item.destinationAccountName}` : item.accountName}</Text></View><Text style={[s.amount, item.kind === 'income' && s.positive]}>{item.kind === 'income' ? '+' : item.kind === 'expense' ? '-' : ''}{formatMoney(item.amountMinor)}</Text></Pressable>} />}
      <Text style={s.hint}>Tap to edit; press and hold to delete.</Text>
    </View>
    {formOpen && <TransactionForm key={editing?.id ?? 'new-entry'} visible onClose={() => setFormOpen(false)} onSaved={() => { void refresh(); }} initial={editing} />}
  </SafeAreaView>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F7F8F4' }, page: { flex: 1, paddingHorizontal: 20, paddingTop: 15 }, kicker: { color: '#718078', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, title: { color: ink, fontSize: 28, fontWeight: '700', marginTop: 5 }, subtitle: { color: '#78857D', fontSize: 12, marginTop: 4, marginBottom: 13 }, actions: { flexDirection: 'row', gap: 7, marginBottom: 12 }, exportButton: { flex: 1, backgroundColor: '#E5EDE6', alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: 10 }, downloadButton: { width: 42, height: 36, backgroundColor: '#E5EDE6', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, downloadDisabled: { opacity: 0.45 }, exportText: { color: ink, fontSize: 10, fontWeight: '700' }, search: { height: 42, borderRadius: 12, backgroundColor: 'white', paddingHorizontal: 12, color: ink, fontSize: 12, marginBottom: 10 }, filterRow: { width: '100%', flexDirection: 'row', gap: 6, marginBottom: 9 }, periodRow: { width: '100%', flexDirection: 'row', gap: 4, paddingBottom: 8 }, divider: { height: 1, backgroundColor: '#E0E5DF', marginVertical: 7 }, filter: { flex: 1, minWidth: 0, backgroundColor: '#ECEFEA', paddingHorizontal: 4, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, periodFilter: { flex: 1, minWidth: 0, minHeight: 34, backgroundColor: '#ECEFEA', paddingHorizontal: 2, paddingVertical: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, filterOn: { backgroundColor: ink }, filterText: { color: '#6D7971', fontSize: 10, fontWeight: '600', textAlign: 'center' }, periodText: { color: '#6D7971', fontSize: 9, fontWeight: '600', textAlign: 'center' }, filterTextOn: { color: 'white' }, periodControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 8 }, arrowButton: { width: 30, height: 28, borderRadius: 9, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }, periodLabel: { color: ink, fontSize: 12, fontWeight: '600', minWidth: 110, textAlign: 'center' }, dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 7 }, dateField: { flex: 1 }, dateInput: { height: 36, minHeight: 36, paddingHorizontal: 6 }, to: { color: '#87938B', fontSize: 10, paddingBottom: 13 }, validation: { color: '#B34A3C', fontSize: 10, marginBottom: 7 }, accounts: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 9 }, accountFilter: { flexGrow: 1, flexBasis: '29%', maxWidth: '47%', alignItems: 'center', backgroundColor: '#ECEFEA', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 8 }, dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F7F8F4', paddingTop: 13, paddingBottom: 7 }, dayTitle: { color: ink, fontSize: 12, fontWeight: '700' }, dayCount: { color: '#849188', fontSize: 10, fontWeight: '600' }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 72, borderBottomWidth: 1, borderBottomColor: '#E8ECE6', gap: 9, paddingVertical: 10 }, icon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#F3E8DC', alignItems: 'center', justifyContent: 'center' }, incomeIcon: { backgroundColor: '#E1EFE5' }, transferIcon: { backgroundColor: '#E6E8F1' }, glyph: { color: ink, fontWeight: '700' }, rowInfo: { flex: 1 }, rowTitle: { color: ink, fontWeight: '600', fontSize: 12 }, rowSub: { color: '#7A877F', fontSize: 9, marginTop: 4 }, rowDate: { color: '#7A877F', fontSize: 9, marginTop: 3 }, amount: { color: ink, fontWeight: '700', fontSize: 10 }, positive: { color: '#31825A' }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center' }, emptyTitle: { color: ink, fontWeight: '700', fontSize: 15 }, emptyText: { color: '#7A877F', textAlign: 'center', fontSize: 11, marginTop: 6 }, hint: { textAlign: 'center', color: '#859188', fontSize: 9, paddingVertical: 9 } });

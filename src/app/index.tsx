import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Account, listAccounts, listTransactions, Transaction } from '@/lib/database';
import { formatMoney, dateOnly } from '@/lib/finance';
import { TransactionForm } from '@/components/transaction-form';
import { DatePickerField } from '@/components/date-picker-field';

const ink = '#18352B';
type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

function getRange(period: Period, anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const end = new Date(start);
  if (period === 'week') {
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear(), 11, 31);
  }
  return { start: dateOnly(start), end: dateOnly(end) };
}

function VisibilityToggle({ hidden, onPress, light = false, label }: { hidden: boolean; onPress: () => void; light?: boolean; label: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${hidden ? 'Show' : 'Hide'} ${label}`} hitSlop={8} style={styles.visibilityButton}>
    <SymbolView name={{ ios: hidden ? 'eye.slash' : 'eye', android: hidden ? 'visibility_off' : 'visibility', web: hidden ? 'visibility_off' : 'visibility' }} size={19} tintColor={light ? '#D1DED4' : '#698073'} />
  </Pressable>;
}

function CategoryBreakdown({ title, rows, totalMinor, tone, hidden }: { title: string; rows: Transaction[]; totalMinor: number; tone: 'income' | 'expense'; hidden: boolean }) {
  const grouped = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>();
    for (const item of rows) {
      if (item.kind !== tone) continue;
      const current = totals.get(item.category) ?? { amount: 0, count: 0 };
      current.amount += item.amountMinor;
      current.count += 1;
      totals.set(item.category, current);
    }
    return [...totals.entries()].map(([category, value]) => ({ category, ...value }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows, tone]);
  const color = tone === 'income' ? '#52946B' : '#C98066';
  return <View style={styles.breakdownGroup}>
    <View style={styles.breakdownTitleRow}><Text style={styles.breakdownTitle}>{title}</Text><Text style={styles.breakdownTotal}>{hidden ? '••••••' : formatMoney(totalMinor)}</Text></View>
    {grouped.length === 0 ? <Text style={styles.emptyBreakdown}>No {tone} in this period</Text> : grouped.map((row) => {
      const share = totalMinor > 0 ? row.amount / totalMinor * 100 : 0;
      return <View key={row.category} style={styles.breakdownRow}>
        <View style={styles.categoryLabel}><Text style={styles.categoryName}>{row.category}</Text><Text style={styles.categoryCount}>{row.count} record{row.count === 1 ? '' : 's'}</Text></View>
        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(share, 3)}%`, backgroundColor: color }]} /></View>
        <View style={styles.amountLabel}><Text style={styles.categoryAmount}>{hidden ? '••••••' : formatMoney(row.amount)}</Text><Text style={styles.categoryShare}>{hidden ? '••' : `${Math.round(share)}%`}</Text></View>
      </View>;
    })}
  </View>;
}

export default function HomeScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [customStart, setCustomStart] = useState(dateOnly(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(dateOnly());
  const [hiddenCards, setHiddenCards] = useState<Record<string, boolean>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();

  const refresh = useCallback(async () => {
    try {
      const [nextTransactions, nextAccounts] = await Promise.all([listTransactions(), listAccounts()]);
      setTransactions(nextTransactions);
      setAccounts(nextAccounts);
    } catch { Alert.alert('Could not load your finances', 'Please reopen the app and try again.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        const [nextTransactions, nextAccounts] = await Promise.all([listTransactions(), listAccounts()]);
        if (active) { setTransactions(nextTransactions); setAccounts(nextAccounts); }
      } catch { if (active) Alert.alert('Could not load your finances', 'Please reopen the app and try again.'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []));

  const range = period === 'custom' ? { start: customStart, end: customEnd } : getRange(period, anchor);
  const periodTransactions = useMemo(() => transactions.filter((item) => item.occurredAt >= range.start && item.occurredAt <= range.end), [transactions, range.start, range.end]);
  const income = periodTransactions.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amountMinor, 0);
  const expenses = periodTransactions.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amountMinor, 0);
  const cashAccounts = accounts.filter((account) => ['cash', 'bank', 'wallet'].includes(account.type));
  const availableBalance = cashAccounts.reduce((sum, account) => sum + account.currentBalanceMinor, 0);
  const accountPeriodTotals = useMemo(() => {
    const totals = new Map<number, { income: number; expenses: number; expenseCount: number }>();
    for (const item of periodTransactions) {
      const row = totals.get(item.accountId) ?? { income: 0, expenses: 0, expenseCount: 0 };
      if (item.kind === 'income') row.income += item.amountMinor;
      if (item.kind === 'expense') { row.expenses += item.amountMinor; row.expenseCount += 1; }
      totals.set(item.accountId, row);
    }
    return totals;
  }, [periodTransactions]);
  const everydayAccount = useMemo(() => accounts
    .map((account) => ({ account, ...(accountPeriodTotals.get(account.id) ?? { income: 0, expenses: 0, expenseCount: 0 }) }))
    .filter((row) => row.expenseCount > 0)
    .sort((a, b) => b.expenseCount - a.expenseCount || b.expenses - a.expenses)[0], [accounts, accountPeriodTotals]);
  const trackedAssets = accounts.filter((account) => !['credit', 'loan'].includes(account.type)).reduce((sum, account) => sum + account.currentBalanceMinor, 0);
  const trackedLiabilities = accounts.filter((account) => ['credit', 'loan'].includes(account.type)).reduce((sum, account) => sum + Math.max(account.currentBalanceMinor, 0), 0);
  const isHidden = (key: string) => hiddenCards[key] ?? true;
  const toggleHidden = (key: string) => setHiddenCards((current) => ({ ...current, [key]: !(current[key] ?? false) }));
  const displayMoney = (amount: number, key: string) => isHidden(key) ? '••••••' : formatMoney(amount);

  const movePeriod = (direction: number) => {
    const next = new Date(anchor);
    if (period === 'day') next.setDate(next.getDate() + direction);
    else if (period === 'week') next.setDate(next.getDate() + direction * 7);
    else if (period === 'year') next.setFullYear(next.getFullYear() + direction);
    else next.setMonth(next.getMonth() + direction);
    setAnchor(next);
  };
  const periodLabel = period === 'custom' ? `${range.start} to ${range.end}` : period === 'day' ? anchor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : period === 'week' ? `${range.start} to ${range.end}` : period === 'year' ? String(anchor.getFullYear()) : anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const openNew = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (item: Transaction) => { setEditing(item); setFormOpen(true); };

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={styles.kicker}>MY MONEY</Text><Text style={styles.heading}>Your dashboard</Text></View></View>

      <View style={styles.balanceCard}>
        <View style={styles.cardTopLine}><Text style={styles.cardEyebrow}>AVAILABLE CASH AND BANK</Text><VisibilityToggle hidden={isHidden('summary')} onPress={() => toggleHidden('summary')} light label="available balance and cash flow" /></View>
        <Text style={styles.balance}>{displayMoney(availableBalance, 'summary')}</Text>
        <View style={styles.cardRule} />
        <View style={styles.cashFlowRow}><View><Text style={styles.flowLabel}>Income</Text><Text style={styles.flowIncome}>{displayMoney(income, 'summary')}</Text></View><View style={styles.flowDivider} /><View><Text style={styles.flowLabel}>Expenses</Text><Text style={styles.flowExpense}>{displayMoney(expenses, 'summary')}</Text></View><View style={styles.flowDivider} /><View><Text style={styles.flowLabel}>Net flow</Text><Text style={styles.flowNet}>{displayMoney(income - expenses, 'summary')}</Text></View></View>
      </View>

      <View style={styles.netWorthCard}><View style={styles.netWorthTop}><View><Text style={styles.netWorthLabel}>ESTIMATED NET WORTH</Text><Text style={styles.netWorthValue}>{displayMoney(trackedAssets - trackedLiabilities, 'networth')}</Text></View><VisibilityToggle hidden={isHidden('networth')} onPress={() => toggleHidden('networth')} label="net worth" /></View><View style={styles.netWorthDetails}><Text style={styles.assetText}>Assets {displayMoney(trackedAssets, 'networth')}</Text><Text style={styles.liabilityText}>Debts {displayMoney(trackedLiabilities, 'networth')}</Text></View><Text style={styles.netWorthNote}>Based on tracked accounts; deposits and investments are not included yet.</Text></View>
      <View style={styles.periodHeader}><View><Text style={styles.sectionTitle}>Cash flow</Text><Text style={styles.sectionSub}>{periodLabel}</Text></View><View style={styles.moveButtons}><Pressable onPress={() => movePeriod(-1)} style={styles.moveButton}><Text style={styles.moveText}>{'<'}</Text></Pressable><Pressable onPress={() => movePeriod(1)} style={styles.moveButton}><Text style={styles.moveText}>{'>'}</Text></Pressable></View></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodPills}>{(['day', 'week', 'month', 'year', 'custom'] as Period[]).map((value) => <Pressable key={value} onPress={() => setPeriod(value)} style={[styles.periodPill, period === value && styles.periodPillSelected]}><Text style={[styles.periodPillText, period === value && styles.periodPillTextSelected]}>{value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</ScrollView>
      {period === 'custom' && <View style={styles.customDates}><DatePickerField value={customStart} onChange={setCustomStart} label="FROM" containerStyle={styles.dateField} buttonStyle={styles.dateInput} /><Text style={styles.dateDash}>to</Text><DatePickerField value={customEnd} onChange={setCustomEnd} label="TO" containerStyle={styles.dateField} buttonStyle={styles.dateInput} /></View>}

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your accounts</Text><Text style={styles.sectionSub}>Swipe to see each balance and cash flow</Text></View><Pressable onPress={() => router.push('/accounts')}><Text style={styles.link}>Manage</Text></Pressable></View>
      {loading ? <ActivityIndicator color={ink} style={{ marginVertical: 24 }} /> : accounts.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>Add an account to start tracking your balances.</Text><Pressable onPress={() => router.push('/accounts')}><Text style={styles.link}>Create account</Text></Pressable></View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={282} decelerationRate="fast" contentContainerStyle={styles.accountCarousel}>
        {accounts.map((account) => {
          const totals = accountPeriodTotals.get(account.id) ?? { income: 0, expenses: 0, expenseCount: 0 };
          const visibilityKey = `account-${account.id}`;
          return <View key={account.id} style={styles.accountSlide}>
            <View style={styles.slideTop}><Pressable onPress={() => router.push({ pathname: '/explore', params: { accountId: String(account.id) } })} style={styles.slideAccountLink}><View style={styles.slideIcon}><Text style={styles.slideInitial}>{account.name[0]?.toUpperCase() ?? 'A'}</Text></View><View style={styles.slideHeading}><Text numberOfLines={1} style={styles.slideName}>{account.name}</Text><Text numberOfLines={1} style={styles.slideMeta}>{account.institution || account.type.toUpperCase()}</Text></View></Pressable><VisibilityToggle hidden={isHidden(visibilityKey)} onPress={() => toggleHidden(visibilityKey)} label={`${account.name} account details`} /></View>
            <Pressable onPress={() => router.push({ pathname: '/explore', params: { accountId: String(account.id) } })}>
              <Text style={styles.slideBalanceLabel}>CURRENT BALANCE</Text><Text style={styles.slideBalance}>{displayMoney(account.currentBalanceMinor, visibilityKey)}</Text>
              <View style={styles.slideDivider} />
              <View style={styles.slideFlow}><View><Text style={styles.slideFlowLabel}>Income</Text><Text style={styles.slideIncome}>{displayMoney(totals.income, visibilityKey)}</Text></View><View><Text style={styles.slideFlowLabel}>Expenses</Text><Text style={styles.slideExpense}>{displayMoney(totals.expenses, visibilityKey)}</Text></View><View><Text style={styles.slideFlowLabel}>Expense txns</Text><Text style={styles.slideEntries}>{isHidden(visibilityKey) ? '••' : totals.expenseCount}</Text></View></View>
            </Pressable>
          </View>;
        })}
      </ScrollView>}

      <View style={styles.everydayCard}>
        <View style={styles.everydayIcon}><Text style={styles.everydayGlyph}>↗</Text></View>
        <View style={styles.everydayContent}><View style={styles.everydayHeading}><Text style={styles.everydayEyebrow}>EVERYDAY SPENDING</Text><VisibilityToggle hidden={isHidden('everyday')} onPress={() => toggleHidden('everyday')} label="everyday spending" /></View>
          {everydayAccount ? <><Text style={styles.everydayName}>{isHidden('everyday') ? '••••••' : everydayAccount.account.name}</Text><Text style={styles.everydayDetail}>{isHidden('everyday') ? '•• expense entries' : `${everydayAccount.expenseCount} expense ${everydayAccount.expenseCount === 1 ? 'entry' : 'entries'}`} · {displayMoney(everydayAccount.expenses, 'everyday')} · {periodLabel}</Text></> : <><Text style={styles.everydayName}>No regular account yet</Text><Text style={styles.everydayDetail}>Add expenses to see which account you use most in this period.</Text></>}
        </View>
      </View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Transaction breakdown</Text><Text style={styles.sectionSub}>Counts and shares for this period</Text></View><VisibilityToggle hidden={isHidden('breakdown')} onPress={() => toggleHidden('breakdown')} label="transaction breakdown" /></View>
      <View style={styles.breakdownCard}><CategoryBreakdown title="Income sources" rows={periodTransactions} totalMinor={income} tone="income" hidden={isHidden('breakdown')} /><View style={styles.breakdownDivider} /><CategoryBreakdown title="Expense categories" rows={periodTransactions} totalMinor={expenses} tone="expense" hidden={isHidden('breakdown')} /></View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Recent activity</Text><Text style={styles.sectionSub}>Tap an entry to edit</Text></View><View style={styles.activityActions}><VisibilityToggle hidden={isHidden('activity')} onPress={() => toggleHidden('activity')} label="recent transaction amounts" /><Pressable onPress={() => router.push('/explore')}><Text style={styles.link}>See all</Text></Pressable></View></View>
      {periodTransactions.slice(0, 5).map((item) => <Pressable key={item.id} onPress={() => openEdit(item)} style={styles.transactionRow}><View style={[styles.transactionIcon, item.kind === 'income' && styles.incomeIcon]}><Text style={styles.transactionGlyph}>{item.kind === 'income' ? '+' : item.kind === 'transfer' ? 'T' : item.category[0]?.toUpperCase()}</Text></View><View style={styles.transactionInfo}><Text style={styles.transactionTitle}>{item.note || item.category}</Text><Text style={styles.transactionMeta}>{item.kind === 'transfer' ? item.accountName + ' to ' + item.destinationAccountName : item.category + ' · ' + item.accountName} · {item.occurredAt}</Text></View><Text style={[styles.transactionAmount, item.kind === 'income' && styles.positive]}>{item.kind === 'income' ? '+' : item.kind === 'expense' ? '-' : ''}{isHidden('activity') ? '••••••' : formatMoney(item.amountMinor)}</Text></Pressable>)}
      <Pressable onPress={openNew} style={styles.addButton}><Text style={styles.addButtonText}>+ Add income, expense, or transfer</Text></Pressable>
      <Text style={styles.footer}>Transactions are stored locally on this device.</Text>
    </ScrollView>
    {formOpen && <TransactionForm key={editing?.id ?? 'new-entry'} visible onClose={() => setFormOpen(false)} onSaved={() => { void refresh(); }} initial={editing} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8F4' }, page: { paddingHorizontal: 21, paddingBottom: 42 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 18 }, kicker: { color: '#78867E', fontSize: 10, letterSpacing: 1.6, fontWeight: '700' }, heading: { color: ink, fontSize: 25, fontWeight: '700', marginTop: 5 }, visibilityButton: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, cardTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceCard: { backgroundColor: ink, borderRadius: 23, padding: 20, marginBottom: 24 }, cardEyebrow: { color: '#BFD0C5', letterSpacing: 1, fontSize: 10, fontWeight: '700' }, balance: { color: 'white', fontSize: 34, letterSpacing: -1, fontWeight: '700', marginTop: 10, marginBottom: 17 }, cardRule: { height: 1, backgroundColor: '#3B5248', marginBottom: 15 }, cashFlowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, flowLabel: { color: '#B8C8BE', fontSize: 10, marginBottom: 5 }, flowIncome: { color: '#B7E3C7', fontSize: 12, fontWeight: '700' }, flowExpense: { color: '#FFC2B5', fontSize: 12, fontWeight: '700' }, flowNet: { color: 'white', fontSize: 12, fontWeight: '700' }, flowDivider: { width: 1, height: 28, backgroundColor: '#3B5248' },
  netWorthCard: { backgroundColor: "white", borderRadius: 18, padding: 15, marginTop: -10, marginBottom: 22 }, netWorthTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, netWorthLabel: { color: "#78867E", fontSize: 9, letterSpacing: 1, fontWeight: "700" }, netWorthValue: { color: ink, fontSize: 22, fontWeight: "700", marginTop: 5 }, netWorthDetails: { flexDirection: "row", gap: 15, marginTop: 9 }, assetText: { color: "#43825A", fontSize: 10, fontWeight: "600" }, liabilityText: { color: "#B76E58", fontSize: 10, fontWeight: "600" }, netWorthNote: { color: "#929D95", fontSize: 9, marginTop: 7 }, periodHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: ink, fontSize: 17, fontWeight: '700' }, sectionSub: { color: '#7C8981', fontSize: 11, marginTop: 3 }, activityActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, moveButtons: { flexDirection: 'row', gap: 7 }, moveButton: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#E9EEE8', alignItems: 'center', justifyContent: 'center' }, moveText: { color: ink, fontWeight: '700', fontSize: 15 }, periodPills: { gap: 7, paddingBottom: 17 }, periodPill: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#ECEFEA', borderRadius: 11 }, periodPillSelected: { backgroundColor: ink }, periodPillText: { color: '#68766E', fontSize: 11, fontWeight: '600' }, periodPillTextSelected: { color: 'white' }, customDates: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 16 }, dateField: { flex: 1 }, dateInput: { minHeight: 39, height: 39, paddingHorizontal: 8 }, dateDash: { color: '#77867E', fontSize: 10, paddingBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11, marginTop: 7 }, link: { color: '#3B7954', fontSize: 12, fontWeight: '700' }, accountCarousel: { gap: 14, paddingRight: 21, paddingBottom: 18 }, accountSlide: { width: 268, backgroundColor: 'white', borderRadius: 19, padding: 16, marginBottom: 3, borderWidth: 1, borderColor: '#E9EDE7' }, slideTop: { flexDirection: 'row', alignItems: 'center' }, slideAccountLink: { flex: 1, flexDirection: 'row', alignItems: 'center' }, slideIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#E5EEE6', alignItems: 'center', justifyContent: 'center' }, slideInitial: { color: ink, fontWeight: '700', fontSize: 13 }, slideHeading: { flex: 1, marginLeft: 10 }, slideName: { color: ink, fontSize: 13, fontWeight: '700' }, slideMeta: { color: '#87938B', fontSize: 9, marginTop: 3 }, slideBalanceLabel: { color: '#87938B', fontSize: 9, letterSpacing: 1, fontWeight: '700', marginTop: 16 }, slideBalance: { color: ink, fontSize: 24, fontWeight: '700', marginTop: 4 }, slideDivider: { height: 1, backgroundColor: '#EDF0EC', marginVertical: 13 }, slideFlow: { flexDirection: 'row', justifyContent: 'space-between' }, slideFlowLabel: { color: '#87938B', fontSize: 9, marginBottom: 4 }, slideIncome: { color: '#43825A', fontSize: 10, fontWeight: '700' }, slideExpense: { color: '#B76E58', fontSize: 10, fontWeight: '700' }, slideEntries: { color: ink, fontSize: 10, fontWeight: '700' }, everydayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E8EFE7', borderRadius: 17, padding: 15, marginBottom: 17 }, everydayIcon: { width: 39, height: 39, borderRadius: 14, backgroundColor: '#D6E5D7', alignItems: 'center', justifyContent: 'center' }, everydayGlyph: { color: '#39724D', fontSize: 20, fontWeight: '700' }, everydayContent: { flex: 1 }, everydayHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, everydayEyebrow: { color: '#6F8074', fontSize: 9, letterSpacing: 1, fontWeight: '700' }, everydayName: { color: ink, fontSize: 14, fontWeight: '700', marginTop: 4 }, everydayDetail: { color: '#738078', fontSize: 10, marginTop: 3, lineHeight: 15 }, emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', borderRadius: 16, padding: 14, marginBottom: 20 }, emptyText: { flex: 1, color: '#758279', fontSize: 11, lineHeight: 16 },
  breakdownCard: { backgroundColor: 'white', borderRadius: 19, padding: 15, marginBottom: 20 }, breakdownGroup: { gap: 11 }, breakdownTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }, breakdownTitle: { color: ink, fontSize: 13, fontWeight: '700' }, breakdownTotal: { color: ink, fontSize: 12, fontWeight: '700' }, breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, categoryLabel: { width: 88 }, categoryName: { color: '#68766E', fontSize: 11 }, categoryCount: { color: '#9AA49D', fontSize: 9, marginTop: 2 }, barTrack: { flex: 1, height: 6, backgroundColor: '#EDF1EC', borderRadius: 5, overflow: 'hidden' }, barFill: { height: '100%', borderRadius: 5 }, amountLabel: { width: 86, alignItems: 'flex-end' }, categoryAmount: { color: ink, fontSize: 10, fontWeight: '600' }, categoryShare: { color: '#89958D', fontSize: 9, marginTop: 2 }, emptyBreakdown: { color: '#909B93', fontSize: 11 }, breakdownDivider: { height: 1, backgroundColor: '#E9ECE7', marginVertical: 15 },
  transactionRow: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderBottomWidth: 1, borderBottomColor: '#E8ECE6' }, transactionIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#F3E8DC', alignItems: 'center', justifyContent: 'center' }, incomeIcon: { backgroundColor: '#E0EFE5' }, transactionGlyph: { color: ink, fontWeight: '700' }, transactionInfo: { flex: 1, marginLeft: 10 }, transactionTitle: { color: ink, fontSize: 12, fontWeight: '600' }, transactionMeta: { color: '#859188', fontSize: 9, marginTop: 4 }, transactionAmount: { color: ink, fontSize: 11, fontWeight: '700' }, positive: { color: '#31825A' }, addButton: { backgroundColor: '#E6EEE7', borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 16 }, addButtonText: { color: ink, fontSize: 12, fontWeight: '700' }, footer: { color: '#89958D', fontSize: 10, textAlign: 'center', paddingTop: 17 },
});

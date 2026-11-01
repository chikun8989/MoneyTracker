import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Account, listAccounts, listTransactions, Transaction } from '@/lib/database';
import { formatMoney } from '@/lib/finance';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

const ink = '#18352B';

type MonthSummary = { key: string; label: string; income: number; expenses: number };

type CategoryTotal = { name: string; amount: number; count: number };
type CategoryMode = 'all' | 'income' | 'expense';
type ChartType = 'pie' | 'bar' | 'line';

const chartColors = ['#5B9A72', '#CF8B70', '#7795B5', '#D6B45C', '#9B7EB4', '#5CABB0', '#C86F88', '#87947D'];

function pieSlicePath(start: number, end: number, radius: number, center: number) {
  const point = (angle: number) => ({ x: center + radius * Math.cos(angle * Math.PI / 180), y: center + radius * Math.sin(angle * Math.PI / 180) });
  const first = point(start);
  const last = point(end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${center} ${center} L ${first.x} ${first.y} A ${radius} ${radius} 0 ${largeArc} 1 ${last.x} ${last.y} Z`;
}

function getCategoryTotals(rows: Transaction[], kind: 'income' | 'expense'): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const item of rows) {
    if (item.kind !== kind) continue;
    const current = totals.get(item.category) ?? { name: item.category, amount: 0, count: 0 };
    current.amount += item.amountMinor;
    current.count += 1;
    totals.set(item.category, current);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

function CategoryChart({ title, rows, total, tone, monthLabel, chartType }: { title: string; rows: CategoryTotal[]; total: number; tone: 'income' | 'expense'; monthLabel: string; chartType: ChartType }) {
  const baseColor = tone === 'income' ? '#5B9A72' : '#CF8B70';
  const maxCategory = Math.max(1, ...rows.map((row) => row.amount));
  const pieSize = 200;
  const pieCenter = pieSize / 2;
  const pieRadius = 88;
  const pieSegments = rows.reduce<{ name: string; start: number; end: number; color: string }[]>((segments, row, index) => {
    const start = segments.length ? segments[segments.length - 1].end : -90;
    const sweep = total > 0 ? row.amount / total * 360 : 0;
    return [...segments, { name: row.name, start, end: start + sweep, color: chartColors[index % chartColors.length] }];
  }, []);
  const graphWidth = Math.max(300, rows.length * 62);
  const graphPoints = rows.map((row, index) => ({ x: rows.length === 1 ? graphWidth / 2 : 18 + index * (graphWidth - 36) / (rows.length - 1), y: 130 - row.amount / maxCategory * 100 }));
  const linePath = graphPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return <View style={s.card}>
    <Text style={s.cardTitle}>{title}</Text>
    <Text style={s.caption}>Category total: {formatMoney(total)} | {monthLabel}</Text>
    {rows.length === 0 ? <Text style={s.empty}>No {tone} recorded this month.</Text> : chartType === 'pie' ? <>
      <Svg width={pieSize} height={pieSize} viewBox={`0 0 ${pieSize} ${pieSize}`} style={s.pie}>
        {pieSegments.length === 1 ? <Circle cx={pieCenter} cy={pieCenter} r={pieRadius} fill={pieSegments[0].color} /> : pieSegments.map((slice) => <Path key={slice.name} d={pieSlicePath(slice.start, slice.end, pieRadius, pieCenter)} fill={slice.color} stroke="white" strokeWidth={1} />)}
      </Svg>
      {rows.map((row, index) => <View key={row.name} style={s.pieLegendRow}><View style={[s.legendSwatch, { backgroundColor: chartColors[index % chartColors.length] }]} /><Text numberOfLines={1} style={s.pieLegendName}>{row.name}</Text><Text style={s.categoryAmount}>{formatMoney(row.amount)}</Text><Text style={s.categoryPercent}>{total ? Math.round(row.amount / total * 100) : 0}%</Text></View>)}
    </> : chartType === 'line' ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><Svg width={graphWidth} height={180} viewBox={`0 0 ${graphWidth} 180`}>
        <Line x1="12" y1="130" x2={graphWidth - 12} y2="130" stroke="#E6EBE5" strokeWidth="1" />
        <Line x1="12" y1="80" x2={graphWidth - 12} y2="80" stroke="#EEF1EC" strokeWidth="1" />
        <Line x1="12" y1="30" x2={graphWidth - 12} y2="30" stroke="#EEF1EC" strokeWidth="1" />
        {graphPoints.length > 1 && <Path d={linePath} fill="none" stroke={baseColor} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {graphPoints.map((point, index) => <Circle key={rows[index].name} cx={point.x} cy={point.y} r="4" fill={baseColor} />)}
        {graphPoints.map((point, index) => <SvgText key={`label-${rows[index].name}`} x={point.x} y="157" fill="#53645A" fontSize="9" textAnchor="middle">{rows[index].name.slice(0, 9)}</SvgText>)}
      </Svg></ScrollView>
      <Text style={s.graphCaption}>Categories are arranged from highest to lowest amount.</Text>
      {rows.map((row) => <View key={row.name} style={s.lineLegendRow}><Text numberOfLines={1} style={s.categoryName}>{row.name}</Text><Text style={s.categoryAmount}>{formatMoney(row.amount)}</Text></View>)}
    </> : rows.map((row, index) => {
      const share = total ? Math.round(row.amount / total * 100) : 0;
      return <View key={row.name} style={s.categoryRow}>
        <View style={s.categoryHeader}><View style={s.categoryLabel}><Text numberOfLines={1} style={s.categoryName}>{row.name}</Text><Text style={s.categoryCount}>{row.count} transaction{row.count === 1 ? '' : 's'}</Text></View><View style={s.categoryValue}><Text style={s.categoryAmount}>{formatMoney(row.amount)}</Text><Text style={s.categoryPercent}>{share}%</Text></View></View>
        <View style={s.track}><View style={[s.fill, { width: `${Math.max(3, row.amount / maxCategory * 100)}%`, backgroundColor: chartColors[index % chartColors.length] }]} /></View>
      </View>;
    })}
  </View>;
}

export default function ReportsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [month, setMonth] = useState(new Date());
  const [categoryMode, setCategoryMode] = useState<CategoryMode>('all');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        const [allTransactions, allAccounts] = await Promise.all([listTransactions(), listAccounts()]);
        if (active) { setTransactions(allTransactions); setAccounts(allAccounts); }
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []));

const monthKey = `${month.getFullYear()}-${`${month.getMonth() + 1}`.padStart(2, '0')}`;
  const monthLabel = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const current = useMemo(() => transactions.filter((item) => item.occurredAt.startsWith(monthKey)), [transactions, monthKey]);
  const income = current.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amountMinor, 0);
  const expenses = current.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amountMinor, 0);
  const incomeCategories = useMemo(() => getCategoryTotals(current, 'income'), [current]);
  const expenseCategories = useMemo(() => getCategoryTotals(current, 'expense'), [current]);
  const trend = useMemo<MonthSummary[]>(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
    const rows = transactions.filter((item) => item.occurredAt.startsWith(key));
    return { key, label: date.toLocaleDateString('en-IN', { month: 'short' }), income: rows.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amountMinor, 0), expenses: rows.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amountMinor, 0) };
  }), [transactions, month]);
  const previousDate = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const previousKey = `${previousDate.getFullYear()}-${`${previousDate.getMonth() + 1}`.padStart(2, '0')}`;
  const previous = transactions.filter((item) => item.occurredAt.startsWith(previousKey) && item.kind === 'expense').reduce((sum, item) => sum + item.amountMinor, 0);
  const maxValue = Math.max(1, ...trend.flatMap((item) => [item.income, item.expenses]));
  const moveMonth = (offset: number) => setMonth((date) => new Date(date.getFullYear(), date.getMonth() + offset, 1));

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.kicker}>UNDERSTAND YOUR MONEY</Text><Text style={s.title}>Reports</Text>
      <View style={s.monthPicker}><Pressable onPress={() => moveMonth(-1)} style={s.navButton}><Text style={s.navText}>{'<'}</Text></Pressable><Text style={s.month}>{monthLabel}</Text><Pressable onPress={() => moveMonth(1)} style={s.navButton}><Text style={s.navText}>{'>'}</Text></Pressable></View>
      {loading ? <ActivityIndicator color={ink} style={{ marginTop: 40 }} /> : <>
        <View style={s.summary}><View><Text style={s.label}>INCOME</Text><Text style={s.income}>{formatMoney(income)}</Text></View><View><Text style={s.label}>EXPENSES</Text><Text style={s.expense}>{formatMoney(expenses)}</Text></View><View><Text style={s.label}>NET FLOW</Text><Text style={s.net}>{formatMoney(income - expenses)}</Text></View></View>
        <View style={s.card}><Text style={s.cardTitle}>Six-month cash flow</Text><View style={s.legend}><View style={s.legendItem}><View style={s.greenDot} /><Text style={s.legendText}>Income</Text></View><View style={s.legendItem}><View style={s.coralDot} /><Text style={s.legendText}>Expenses</Text></View></View><View style={s.chart}>{trend.map((item) => <View key={item.key} style={s.monthColumn}><View style={s.bars}><View style={[s.bar, s.incomeBar, { height: `${Math.max(3, item.income / maxValue * 100)}%` }]} /><View style={[s.bar, s.expenseBar, { height: `${Math.max(3, item.expenses / maxValue * 100)}%` }]} /></View><Text style={s.monthLabel}>{item.label}</Text></View>)}</View></View>
        <View style={s.categorySectionHeader}><View><Text style={s.sectionTitle}>Category charts</Text><Text style={s.caption}>See where income comes from and where spending goes</Text></View></View>
        <View style={s.categoryModes}>{(['all', 'income', 'expense'] as CategoryMode[]).map((value) => <Pressable key={value} onPress={() => setCategoryMode(value)} style={[s.modeChip, categoryMode === value && s.modeChipOn]}><Text style={[s.modeText, categoryMode === value && s.modeTextOn]}>{value === 'all' ? 'Both' : value === 'income' ? 'Income' : 'Expenses'}</Text></Pressable>)}</View>
        <View style={s.chartTypeRow}><Text style={s.chartTypeLabel}>Chart style</Text>{(['pie', 'bar', 'line'] as ChartType[]).map((value) => <Pressable key={value} onPress={() => setChartType(value)} style={[s.typeChip, chartType === value && s.typeChipOn]}><Text style={[s.typeText, chartType === value && s.typeTextOn]}>{value === 'line' ? 'Graph' : value === 'bar' ? 'Bars' : 'Pie'}</Text></Pressable>)}</View>
        {(categoryMode === 'all' || categoryMode === 'income') && <CategoryChart title="Income by category" rows={incomeCategories} total={income} tone="income" monthLabel={monthLabel} chartType={chartType} />}
        {(categoryMode === 'all' || categoryMode === 'expense') && <CategoryChart title="Expenses by category" rows={expenseCategories} total={expenses} tone="expense" monthLabel={monthLabel} chartType={chartType} />}
        <View style={s.card}><Text style={s.cardTitle}>Month comparison</Text><Text style={s.compareText}>Expenses this month: <Text style={s.bold}>{formatMoney(expenses)}</Text></Text><Text style={s.compareText}>Previous month: <Text style={s.bold}>{formatMoney(previous)}</Text></Text><Text style={s.caption}>Comparison uses recorded expenses only.</Text></View>
        <View style={s.card}><Text style={s.cardTitle}>Account balances</Text>{accounts.filter((account) => ['cash', 'bank', 'wallet'].includes(account.type)).map((account) => <View key={account.id} style={s.accountRow}><Text style={s.categoryName}>{account.name}</Text><Text style={s.categoryAmount}>{formatMoney(account.currentBalanceMinor, account.currency)}</Text></View>)}</View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({ chartTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 11, marginTop: 3 }, chartTypeLabel: { color: '#78867E', fontSize: 10, fontWeight: '600', marginRight: 2 }, typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#E9EEE8' }, typeChipOn: { backgroundColor: ink }, typeText: { color: '#68766E', fontSize: 10, fontWeight: '600' }, typeTextOn: { color: 'white' }, pie: { alignSelf: 'center', marginVertical: 12 }, pieLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 31 }, legendSwatch: { width: 10, height: 10, borderRadius: 5 }, pieLegendName: { flex: 1, color: '#53645A', fontSize: 10 }, graphCaption: { color: '#89958D', fontSize: 9, marginBottom: 5 }, lineLegendRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#EEF1EC' }, rangeModes: { flexDirection: 'row', gap: 7, marginBottom: 14 }, rangeChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11, backgroundColor: '#E9EEE8' }, rangeChipOn: { backgroundColor: ink }, rangeChipText: { color: '#68766E', fontSize: 10, fontWeight: '600' }, rangeChipTextOn: { color: 'white' }, customDates: { flexDirection: 'row', gap: 10, marginBottom: 15 }, dateField: { flex: 1 }, dateLabel: { color: '#7A877F', fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 5 }, dateInput: { height: 42, backgroundColor: 'white', borderWidth: 1, borderColor: '#E6EBE5', borderRadius: 11, paddingHorizontal: 10, color: ink, fontSize: 12 }, rangeError: { color: '#A84D3C', fontSize: 11, marginBottom: 12, lineHeight: 16 }, safe: { flex: 1, backgroundColor: '#F7F8F4' }, page: { padding: 21, paddingBottom: 40 }, kicker: { color: '#78867E', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, title: { color: ink, fontSize: 29, fontWeight: '700', marginTop: 5, marginBottom: 15 }, monthPicker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, navButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E9EEE8', alignItems: 'center', justifyContent: 'center' }, navText: { color: ink, fontWeight: '700', fontSize: 15 }, month: { color: ink, fontSize: 14, fontWeight: '700' }, summary: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: ink, borderRadius: 18, padding: 15, marginBottom: 14 }, label: { color: '#C4D2C8', fontSize: 8, letterSpacing: .7, fontWeight: '700' }, income: { color: '#B7E3C7', fontSize: 11, fontWeight: '700', marginTop: 7 }, expense: { color: '#FFC2B5', fontSize: 11, fontWeight: '700', marginTop: 7 }, net: { color: 'white', fontSize: 11, fontWeight: '700', marginTop: 7 }, card: { backgroundColor: 'white', borderRadius: 18, padding: 15, marginBottom: 12 }, cardTitle: { color: ink, fontSize: 14, fontWeight: '700' }, sectionTitle: { color: ink, fontSize: 17, fontWeight: '700' }, categorySectionHeader: { marginBottom: 9, marginTop: 3 }, categoryModes: { flexDirection: 'row', gap: 7, marginBottom: 5 }, modeChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 11, backgroundColor: '#E9EEE8' }, modeChipOn: { backgroundColor: ink }, modeText: { color: '#68766E', fontSize: 10, fontWeight: '600' }, modeTextOn: { color: 'white' }, caption: { color: '#89958D', fontSize: 10, marginTop: 4 }, legend: { flexDirection: 'row', gap: 13, marginTop: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#5B9A72' }, coralDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CF8B70' }, legendText: { color: '#7A877F', fontSize: 9 }, chart: { height: 122, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', marginTop: 14 }, monthColumn: { flex: 1, alignItems: 'center', height: '100%' }, bars: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, paddingHorizontal: 5 }, bar: { width: 9, maxHeight: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 }, incomeBar: { backgroundColor: '#5B9A72' }, expenseBar: { backgroundColor: '#CF8B70' }, monthLabel: { color: '#7A877F', fontSize: 9, marginTop: 6 }, categoryRow: { marginTop: 14 }, categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }, categoryLabel: { flex: 1 }, categoryValue: { flexDirection: 'row', alignItems: 'center', gap: 9 }, categoryCount: { color: '#8D9991', fontSize: 9, marginTop: 3 }, categoryPercent: { color: '#7A877F', fontSize: 9, width: 30, textAlign: 'right' }, categoryName: { color: '#53645A', fontSize: 11 }, categoryAmount: { color: ink, fontSize: 10, fontWeight: '600' }, track: { height: 5, borderRadius: 4, backgroundColor: '#EEF1EC', overflow: 'hidden' }, fill: { height: '100%', backgroundColor: '#C98066', borderRadius: 4 }, empty: { color: '#87938B', fontSize: 11, marginTop: 12 }, compareText: { color: '#68766E', fontSize: 11, marginTop: 11 }, bold: { color: ink, fontWeight: '700' }, accountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 } });

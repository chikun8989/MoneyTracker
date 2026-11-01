import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { dateOnly } from '@/lib/finance';

const ink = '#18352B';
const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : new Date();
};
const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDate(value));

type Props = { value: string; onChange: (value: string) => void; label?: string; containerStyle?: StyleProp<ViewStyle>; buttonStyle?: StyleProp<ViewStyle> };

/** Cross-platform calendar picker; keeps date selection usable in native apps and Expo web. */
export function DatePickerField({ value, onChange, label, containerStyle, buttonStyle }: Props) {
  const [open, setOpen] = useState(false);
  const [shownMonth, setShownMonth] = useState(() => {
    const date = parseDate(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const days = useMemo(() => {
    const first = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  }, [shownMonth]);
  const selectedDate = parseDate(value);
  const openPicker = () => {
    setShownMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setOpen(true);
  };
  const stepMonth = (amount: number) => setShownMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));

  return <View style={containerStyle}>
    {label ? <Text style={s.label}>{label}</Text> : null}
    <Pressable onPress={openPicker} accessibilityRole="button" accessibilityLabel={`${label ?? 'Date'}: ${formatDate(value)}. Tap to choose a date.`} style={[s.field, buttonStyle]}>
      <Text style={s.calendarIcon}>▦</Text><Text style={s.value}>{formatDate(value)}</Text><Text style={s.chevron}>⌄</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.scrim}>
        <View style={s.dialog}>
          <View style={s.header}><Text style={s.title}>Choose a date</Text><Pressable onPress={() => setOpen(false)} accessibilityLabel="Close date picker"><Text style={s.close}>×</Text></Pressable></View>
          <View style={s.monthRow}><Pressable onPress={() => stepMonth(-1)} style={s.monthButton} accessibilityLabel="Previous month"><Text style={s.monthArrow}>‹</Text></Pressable><Text style={s.monthTitle}>{shownMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text><Pressable onPress={() => stepMonth(1)} style={s.monthButton} accessibilityLabel="Next month"><Text style={s.monthArrow}>›</Text></Pressable></View>
          <View style={s.grid}>{weekdays.map((day, index) => <Text key={`${day}-${index}`} style={s.weekday}>{day}</Text>)}{days.map((day) => {
            const key = dateOnly(day);
            const selected = key === value;
            const inMonth = day.getMonth() === shownMonth.getMonth();
            return <Pressable key={key} onPress={() => { onChange(key); setOpen(false); }} accessibilityRole="button" accessibilityLabel={formatDate(key)} accessibilityState={{ selected }} style={[s.day, selected && s.daySelected]}><Text style={[s.dayText, !inMonth && s.dayOutside, selected && s.dayTextSelected]}>{day.getDate()}</Text></Pressable>;
          })}</View>
          <View style={s.footer}><Pressable onPress={() => { const today = dateOnly(); onChange(today); setShownMonth(new Date()); setOpen(false); }} style={s.todayButton}><Text style={s.todayText}>Today</Text></Pressable><Pressable onPress={() => setOpen(false)} style={s.doneButton}><Text style={s.doneText}>Done</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  label: { color: '#748279', fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 7 },
  field: { minHeight: 42, backgroundColor: 'white', borderWidth: 1, borderColor: '#E6EBE5', borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  calendarIcon: { color: '#698073', fontSize: 16 }, value: { flex: 1, color: ink, fontSize: 12, fontWeight: '600' }, chevron: { color: '#7A877F', fontSize: 17 },
  scrim: { flex: 1, backgroundColor: 'rgba(14,29,22,.45)', justifyContent: 'center', padding: 22 }, dialog: { backgroundColor: '#FBFCF8', borderRadius: 22, padding: 18, width: '100%', maxWidth: 380, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: ink, fontSize: 17, fontWeight: '700' }, close: { color: '#718078', fontSize: 24, paddingHorizontal: 5 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 12 }, monthButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E9EEE8', alignItems: 'center', justifyContent: 'center' }, monthArrow: { color: ink, fontSize: 23, lineHeight: 27 }, monthTitle: { color: ink, fontSize: 14, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', height: 34, textAlign: 'center', textAlignVertical: 'center', color: '#8A968E', fontSize: 11, fontWeight: '700' }, day: { width: '14.2857%', aspectRatio: 1, maxHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, daySelected: { backgroundColor: ink }, dayText: { color: ink, fontSize: 12, fontWeight: '500' }, dayOutside: { color: '#B7C0B9' }, dayTextSelected: { color: 'white', fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }, todayButton: { paddingHorizontal: 12, paddingVertical: 10 }, todayText: { color: ink, fontSize: 12, fontWeight: '700' }, doneButton: { backgroundColor: ink, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 10 }, doneText: { color: 'white', fontSize: 12, fontWeight: '700' },
});

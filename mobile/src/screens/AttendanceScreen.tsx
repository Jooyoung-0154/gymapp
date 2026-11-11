import { calendarToday } from '../utils/calendarToday';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { attendancePreview as data } from '../data/attendancePreview';
import { homePreview } from '../data/homePreview';
import { attendanceCount, calendarCells, monthKey, shiftMonth, type CalendarMonth } from '../utils/attendanceCalendar';
import { colors, fonts, layout } from '../theme/warmWellness';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const attended = new Set<string>(data.attendanceDates);

export function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const today = calendarToday();
  const [month, setMonth] = useState<CalendarMonth>({ ...data.snapshotMonth });
  const cells = useMemo(() => calendarCells(month), [month]);
  const key = monthKey(month);
  const latest = monthKey(data.snapshotMonth);
  const canPrevious = key > monthKey(data.earliestMonth);
  const canNext = key < latest;
  const count = attendanceCount(data.attendanceDates, month);
  const monthLabel = `${month.year}년 ${month.month}월`;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8, minHeight: insets.top + 76 }]}>
        <Text style={styles.gymName} accessibilityRole="header">{homePreview.gymName}</Text>
      </View>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never">
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">나의 출석</Text>
          <Text style={styles.subtitle}>꾸준히 쌓인 출석을 한눈에 확인하세요.</Text>
        </View>

        <View style={styles.calendar}>
          <View style={styles.monthControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 달" accessibilityState={{ disabled: !canPrevious }} disabled={!canPrevious} onPress={() => setMonth(current => shiftMonth(current, -1))} style={({ pressed }) => [styles.monthButton, !canPrevious && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.arrow} accessible={false}>‹</Text>
            </Pressable>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.monthTitle}>{monthLabel}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: !canNext }} disabled={!canNext} onPress={() => setMonth(current => shiftMonth(current, 1))} style={({ pressed }) => [styles.monthButton, !canNext && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.arrow} accessible={false}>›</Text>
            </Pressable>
          </View>
          <View style={styles.weekdays}>
            {weekdays.map((label, index) => <Text key={label} style={[styles.weekday, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{label}</Text>)}
          </View>
          <View style={styles.grid} accessibilityLabel={`${monthLabel} 출석 달력`}>
            {cells.map((cell, index) => {
              const isAttended = cell.date !== null && attended.has(cell.date);
              return (
                <View key={cell.key} style={styles.cell} accessible={cell.day !== null} accessibilityLabel={cell.day === null ? undefined : `${month.month}월 ${cell.day}일, ${isAttended ? '출석' : '출석 기록 없음'}${cell.date === today ? ', 오늘' : ''}`}>
                  {cell.day !== null && <View style={[styles.dayCircle, isAttended && styles.attended, isAttended && (index % 7 === 0 || index % 7 === 6) && styles.weekendAttended, cell.date === today && styles.today]}>
                    <Text style={[styles.dayNumber, isAttended && styles.attendedNumber, index % 7 === 0 && styles.sunday, index % 7 === 6 && styles.saturday]}>{cell.day}</Text>
                  </View>}
                </View>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={styles.todayRing} /><Text style={styles.legendText}>오늘</Text></View>
            <View style={styles.legendItem}><View style={styles.legendDot} /><Text style={styles.legendText}>출석</Text></View>
          </View>
          {count === 0 && <Text accessibilityLiveRegion="polite" style={styles.empty}>이 달에는 출석 기록이 없어요.</Text>}
          {key !== latest && <Pressable accessibilityRole="button" onPress={() => setMonth({ ...data.snapshotMonth })} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text style={styles.resetLabel}>현재 달력으로 돌아가기</Text></Pressable>}
        </View>

        <View style={styles.summary}>
          <View style={styles.stat} accessible accessibilityLabel={`${key === latest ? '이번 달' : '선택한 달'} 출석 ${count}일`}>
            <Text style={styles.statLabel}>{key === latest ? '이번 달 출석' : '선택한 달 출석'}</Text>
            <View style={styles.numberRow}><Text style={styles.statNumber}>{count}</Text><Text style={styles.unit}>일</Text></View>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat} accessible accessibilityLabel={`현재 연속 출석 ${data.streakDays}일`}>
            <Text style={styles.statLabel}>현재 연속 출석</Text>
            <View style={styles.numberRow}><Text style={styles.statNumber}>{data.streakDays}</Text><Text style={styles.unit}>일</Text></View>
          </View>
        </View>

        <View style={styles.reward}>
          <Text style={styles.rewardTitle}>누적 보상 확인</Text>
          <View style={styles.rewardRule}><Text style={styles.rewardRuleText}>10일 연속 출석 시</Text><View style={styles.rewardHighlight}><Text style={styles.rewardHighlightText}>이용일 1일</Text></View><Text style={styles.rewardRuleText}>추가</Text></View>
          <View style={styles.rewardRow}><Text style={styles.rewardLabel}>누적 보상</Text><Text style={styles.rewardValue}>{data.cumulativeRewardDays}일</Text></View>
          <View style={styles.rewardRow}><Text style={styles.rewardLabel}>다음 보상까지</Text><Text style={styles.rewardValue}>출석 {data.daysUntilReward}일</Text></View>
          <Text style={styles.policy}>휴무와 휴회일은 개근 진행을 보존해요. (회원 신청 휴회는 개근 보존이 되지 않아요.)</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 24, paddingBottom: 8, justifyContent: 'center', backgroundColor: '#F3E7D9', borderBottomWidth: 2, borderBottomColor: '#CBB099' },
  gymName: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30, letterSpacing: -0.6, color: colors.ink },
  content: { paddingHorizontal: layout.pageGutter, paddingTop: 8, paddingBottom: 24, gap: 16 },
  intro: { gap: 6, paddingHorizontal: 4, marginBottom: 2 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 36, color: colors.ink, letterSpacing: -0.7 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.readableMuted },
  calendar: { padding: 16, gap: 14, backgroundColor: colors.card, borderRadius: layout.cardRadius },
  monthControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monthButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.background },
  arrow: { fontSize: 28, lineHeight: 34, color: colors.primary },
  disabled: { opacity: 0.3 }, pressed: { opacity: 0.65 },
  monthTitle: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 27, color: colors.ink, flexShrink: 1 },
  weekdays: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.medium, fontSize: 12, lineHeight: 24, color: colors.readableMuted },
  sunday: { color: '#C44336' }, saturday: { color: '#2E63B8' }, weekendAttended: { backgroundColor: '#F1E2D6', borderColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, minHeight: 44, paddingVertical: 3, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: '100%', maxWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
  attended: { backgroundColor: colors.primary },
  snapshot: { outlineColor: colors.primary, outlineWidth: 1, outlineOffset: 2 },
  dayNumber: { fontFamily: fonts.number, fontSize: 13, lineHeight: 24, color: colors.ink },
  attendedNumber: { color: colors.onPrimary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  legendItem: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  today: { borderColor: '#FF2020', borderWidth: 2 }, todayRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FF2020' },
  rewardRule: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }, rewardRuleText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 22, color: colors.ink }, rewardHighlight: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }, rewardHighlightText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 24, color: colors.onPrimary },
  legendRing: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.primary },
  legendText: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, color: colors.readableMuted },
  empty: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, textAlign: 'center', color: colors.readableMuted },
  resetButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resetLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  summary: { flexDirection: 'row', padding: 20, borderRadius: layout.cardRadius, backgroundColor: colors.card, gap: 12 },
  stat: { flex: 1, gap: 10 },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.readableMuted },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  statNumber: { fontFamily: fonts.number, fontSize: 32, lineHeight: 40, letterSpacing: -1, color: colors.ink },
  unit: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  divider: { width: 1, backgroundColor: colors.border, marginHorizontal: 2 },
  reward: { padding: 20, borderRadius: layout.cardRadius, backgroundColor: colors.congestion, gap: 14 },
  rewardHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 2 },
  rewardTitle: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 22, color: colors.ink },
  rewardBadge: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 18, color: colors.primary, backgroundColor: colors.card, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  rewardLabel: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 22, color: colors.readableMuted },
  rewardValue: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.primary },
  policy: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, color: colors.readableMuted, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  example: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 19, color: colors.readableMuted, paddingHorizontal: 4 },
});

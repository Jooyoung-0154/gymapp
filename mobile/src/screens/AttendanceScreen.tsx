// [목적] AttendanceScreen은 로그인한 회원의 월별 실제 출석을 조회합니다. 보상 집계는 후속 구현입니다.
import { CalendarLegend, marks } from '../components/CalendarLegend';
import { calendarToday } from '../utils/calendarToday';
import { useAttendance } from '../hooks/useAttendance';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { homePreview } from '../data/homePreview';
import { calendarCells, monthKey, shiftMonth, type CalendarMonth } from '../utils/attendanceCalendar';
import { colors, fonts, layout } from '../theme/warmWellness';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];


export function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const initialToday = calendarToday();
  const [month, setMonth] = useState<CalendarMonth>({ year: Number(initialToday.slice(0,4)), month: Number(initialToday.slice(5,7)) });
  const key = monthKey(month);
  const { data, error, loading, retry } = useAttendance(key);
  const today = data?.today ?? initialToday;
  const latest = today.slice(0,7);
  const cells = useMemo(() => calendarCells(month), [month]);
  const attended = new Set(data?.attendanceDates ?? []);
  const canPrevious = !!data && key > data.earliestMonth;
  const canNext = !loading && key < latest;
  const count = data?.attendanceCount;
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
          {loading && <ActivityIndicator color={colors.primary} accessibilityLabel="출석 조회 중" />}
          {!!error && <View accessibilityRole="alert"><Text style={styles.empty}>{error}</Text><Pressable accessibilityRole="button" onPress={retry} style={styles.resetButton}><Text style={styles.resetLabel}>다시 불러오기</Text></Pressable></View>}
          {!loading && !error && <Pressable accessibilityRole="button" onPress={retry}><Text style={styles.resetLabel}>출석 새로고침</Text></Pressable>}
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
                <View key={cell.key} style={styles.cell} accessible={cell.day !== null} accessibilityLabel={cell.day === null ? undefined : `${month.month}월 ${cell.day}일, ${isAttended ? '출석' : data ? '출석 기록 없음' : '조회되지 않음'}${cell.date === today ? ', 오늘' : ''}`}>
                  {cell.day !== null && <View style={[styles.dayCircle, isAttended && marks.attended, cell.date === today && marks.today]}>
                    <Text style={[styles.dayNumber, index % 7 === 0 && styles.sunday, index % 7 === 6 && styles.saturday, cell.date === today && marks.todayNumber]}>{cell.day}</Text>
                  </View>}
                </View>
              );
            })}
          </View>
          <CalendarLegend />
          {count === 0 && <Text accessibilityLiveRegion="polite" style={styles.empty}>이 달에는 출석 기록이 없어요.</Text>}
          {key !== latest && <Pressable accessibilityRole="button" onPress={() => setMonth({ year: Number(latest.slice(0,4)), month: Number(latest.slice(5,7)) })} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text style={styles.resetLabel}>현재 달력으로 돌아가기</Text></Pressable>}
        </View>

        <View style={styles.summary}>
          <View style={styles.stat} accessible accessibilityLabel={`${key === latest ? '이번 달' : '선택한 달'} 출석 ${count ?? '조회 중'}일`}>
            <Text style={styles.statLabel}>{key === latest ? '이번 달 출석' : '선택한 달 출석'}</Text>
            <View style={styles.numberRow}><Text style={styles.statNumber}>{count ?? '—'}</Text><Text style={styles.unit}>일</Text></View>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat} accessible accessibilityLabel="현재 연속 출석 집계 준비 중">
            <Text style={styles.statLabel}>현재 연속 출석</Text>
            <View style={styles.numberRow}><Text style={styles.statNumber}>—</Text><Text style={styles.unit}>일</Text></View>
          </View>
        </View>

        <View style={styles.reward}>
          <Text style={styles.rewardTitle}>누적 보상 확인</Text>
          <View style={styles.rewardRule}><Text style={styles.rewardRuleText}>10일 연속 출석 시</Text><View style={styles.rewardHighlight}><Text style={styles.rewardHighlightText}>이용일 1일</Text></View><Text style={styles.rewardRuleText}>추가</Text></View>
          <View style={styles.rewardRow}><Text style={styles.rewardLabel}>누적 보상</Text><Text style={styles.rewardValue}>집계 준비 중</Text></View>
          <View style={styles.rewardRow}><Text style={styles.rewardLabel}>다음 보상까지</Text><Text style={styles.rewardValue}>집계 준비 중</Text></View>
          <Text style={styles.policy}>연속 출석과 보상은 집계 기능 연결 후 표시돼요.</Text>
          <Text style={styles.policy}>회원 신청 휴회는 개근 보존이 되지 않아요.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
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
  dayCircle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
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



import { StreakProgress } from '../components/StreakProgress';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignIcon } from '../components/DesignIcon';
import { PreviewNotice, type PreviewMessage } from '../components/PreviewNotice';
import { homePreview as data } from '../data/homePreview';
import { colors, fonts, layout } from '../theme/warmWellness';
import { useBookingPreview } from '../state/BookingPreviewContext';
import { heldCredits, dateLabel, endTime, startsAt } from '../utils/bookingPreview';

export function HomeScreen({ onOpenBookings, onOpenAttendance, onOpenMy }: { onOpenBookings: () => void; onOpenAttendance: () => void; onOpenMy: () => void }) {
  const insets = useSafeAreaInsets();
  const { state } = useBookingPreview();
  const nextBooking = state.bookings.filter(b => b.status === 'scheduled').sort((a, b) => startsAt(a) - startsAt(b))[0];
  const nextBookingLabel = nextBooking ? `${dateLabel(nextBooking.date)} ${nextBooking.time}–${endTime(nextBooking.time)}` : '예정된 예약이 없어요';
  const [notice, setNotice] = useState<PreviewMessage | null>(null);
  const showNotice = (title: string, message: string) => setNotice({ title, message });

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8, minHeight: insets.top + 76 }]}>
        <Text style={styles.gymName} accessibilityRole="header">{data.gymName}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" accessibilityLabel="홈 화면, 예시 데이터">
        <View style={styles.congestion} accessible accessibilityLabel={`혼잡도 ${data.congestion.label}, 약 ${data.congestion.people}명. 2시간 내 입장 인원입니다.`}>
          <Text style={styles.sectionTitle}>현재 혼잡도</Text>
          <View style={styles.between}>
            <View style={styles.badge}><View style={styles.badgeDot} /><Text style={styles.badgeText}>{data.congestion.label}</Text></View>
            <View style={styles.numberRow}><Text style={styles.numberUnit}>약</Text><Text style={styles.peopleNumber}>{data.congestion.people}</Text><Text style={styles.numberUnit}>명</Text></View>
          </View>
          <Text style={styles.congestionCaption}>2시간 내 입장 인원</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.qrButton, pressed && styles.primaryPressed]}
          accessibilityRole="button" accessibilityLabel="입장용 개인 QR 보기"
          accessibilityHint="디자인 미리보기 안내를 엽니다. 실제 입장 QR은 발급하지 않습니다."
          onPress={() => showNotice('입장용 개인 QR', '지금은 홈 디자인을 확인하는 미리보기예요. 실제 입장용 QR은 발급되지 않아요.')}
        >
          <DesignIcon name="scan" /><Text style={styles.qrLabel}>입장용 개인 QR 보기</Text><DesignIcon name="arrow" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.membership, pressed && styles.cardPressed]}
          accessibilityRole="button" accessibilityLabel={`시설 이용권, 예시 잔여 ${data.membership.remainingDays}일, 만료일 ${data.membership.expiresOnLabel}`}
          onPress={onOpenMy}
        >
          <View style={styles.between}><Text style={styles.sectionTitle}>시설 이용권</Text><DesignIcon name="chevron" /></View>
          <View style={styles.expiryGroup}>
            <Text style={styles.caption}>만료일</Text>
            <Text style={styles.expiryDate}>{data.membership.expiresOnLabel}<Text style={styles.until}>까지</Text></Text>
            <Text style={styles.daysLeft}>D + {data.membership.remainingDays}일</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.attendance, pressed && styles.cardPressed]}
          accessibilityRole="button" accessibilityLabel={`현재 연속 출석 예시 ${data.attendance.streakDays}일, 다음 보상까지 출석 ${data.attendance.daysUntilReward}일`}
          onPress={onOpenAttendance}
        >
          <View style={styles.between}><Text style={styles.sectionTitle}>현재 연속 출석</Text><DesignIcon name="chevron" /></View>
          <StreakProgress days={data.attendance.streakDays} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.nextBooking, pressed && styles.cardPressed]}
          accessibilityRole="button" accessibilityLabel={`다음 예약 예시, ${nextBookingLabel}`}
          onPress={onOpenBookings}
        >
          <View style={styles.between}><Text style={styles.sectionTitle}>다음 예약</Text><DesignIcon name="chevron" /></View>
          <Text style={styles.bookingTime}>{nextBookingLabel}</Text>
          <Text style={styles.caption}>{nextBooking ? `개인 PT · ${data.nextBooking.trainerName} 트레이너` : '담당 트레이너의 빈 시간을 확인해 보세요.'}</Text>
          <Text style={styles.bookingDetail}>{nextBooking ? `현재 예약 횟수 ${heldCredits(state)}회 · 상세 보기` : '내 예약 보기'}</Text>
        </Pressable>
      </ScrollView>

      <PreviewNotice notice={notice} onClose={() => setNotice(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 24, paddingBottom: 8, justifyContent: 'center', backgroundColor: '#F3E7D9', borderBottomWidth: 2, borderBottomColor: '#CBB099' },
  gymName: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30, letterSpacing: -0.6, color: colors.ink },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.pageGutter, paddingTop: 12, paddingBottom: 20, gap: layout.cardGap },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 21, color: colors.ink, flexShrink: 1 },
  congestion: { minHeight: 164, backgroundColor: colors.congestion, padding: 22, borderRadius: layout.congestionRadius, gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100, backgroundColor: colors.badge },
  badgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.badgeInk },
  badgeText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 20, color: colors.badgeInk },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, flexShrink: 0 },
  peopleNumber: { fontFamily: fonts.number, fontSize: 50, lineHeight: 53, letterSpacing: -2, color: colors.ink, includeFontPadding: false },
  numberUnit: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: colors.ink },
  congestionCaption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.readableMuted },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.readableMuted },
  qrButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 100 },
  qrLabel: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 23, color: colors.onPrimary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  cardPressed: { opacity: 0.72 },
  membership: { minHeight: 145, padding: 20, borderRadius: layout.cardRadius, backgroundColor: colors.card, gap: 12 },
  expiryGroup: { gap: 2 }, until: { fontFamily: fonts.medium, fontSize: 14, color: colors.readableMuted }, daysLeft: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 22, color: colors.primary },
  expiryDate: { fontFamily: fonts.number, fontSize: 30, lineHeight: 42, color: colors.primary, letterSpacing: -1 },
  membershipSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  membershipDates: { gap: 4, flexShrink: 1 },
  remainingNumber: { fontFamily: fonts.number, fontSize: 38, lineHeight: 40, letterSpacing: -2, color: colors.primary, includeFontPadding: false },
  primaryText: { color: colors.primary },
  attendance: { minHeight: 137, padding: 20, gap: 14, borderRadius: layout.cardRadius, backgroundColor: colors.card },
  attendanceSummary: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  attendanceTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  streakBadge: { minWidth: 68, minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', gap: 5, alignItems: 'baseline', justifyContent: 'center', borderRadius: 100, backgroundColor: colors.background },
  streakNumber: { fontFamily: fonts.number, fontSize: 32, lineHeight: 58, letterSpacing: -2, color: colors.ink, includeFontPadding: false },
  nextBooking: { minHeight: 148, gap: 11, padding: 20, backgroundColor: colors.card, borderRadius: layout.cardRadius },
  bookingTime: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 27, color: colors.ink },
  bookingDetail: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: colors.primary },
});

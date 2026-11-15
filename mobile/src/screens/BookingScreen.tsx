// [목적] BookingScreen.tsx 파일: 예약하기·내 예약 화면입니다. 날짜와 시간을 선택해 예시 예약을 추가·변경·취소하며 실제 서버에 예약을 저장하지 않습니다.
import { CalendarLegend, marks } from '../components/CalendarLegend';
import { attendancePreview } from '../data/attendancePreview';
import { calendarToday } from '../utils/calendarToday';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MemberPage } from '../components/MemberPage';
import { DetailSheet } from '../components/DetailSheet';
import { DesignIcon } from '../components/DesignIcon';
import { memberStyles as ui } from '../components/memberStyles';
import { memberPreview as member } from '../data/memberPreview';
import { useBookingPreview } from '../state/BookingPreviewContext';
import { availableCredits, canChange, cancellationKind, dateLabel, endTime, hasPublishedTimes, heldCredits, publishedTimes, slotState, startsAt, type PreviewBooking } from '../utils/bookingPreview';
import { calendarCells, monthKey, shiftMonth, type CalendarMonth } from '../utils/attendanceCalendar';
import { colors, fonts } from '../theme/warmWellness';

// [정의] BookingSection은 예약 화면의 하위 탭을 표현하는 타입입니다.
// [구성] new는 예약하기, mine은 내 예약 목록을 뜻합니다.
// [목적] BookingScreen은 BookingSection 값으로 표시할 화면을 선택합니다.
export type BookingSection = 'new' | 'mine';
// [정의] Dialog는 예약 화면에서 표시할 모달 종류와 내용을 정의하는 유니온 타입입니다.
// [구성] confirm은 date·time, detail·cancel은 id, message는 title·message를 가집니다.
// [목적] Dialog.kind 값으로 모달의 제목·본문·확인 동작을 구분합니다.
type Dialog = { kind: 'confirm'; date: string; time: string } | { kind: 'detail' | 'cancel'; id: string } | { kind: 'message'; title: string; message: string };

export function BookingScreen({ section, onSectionChange }: { section: BookingSection; onSectionChange: (value: BookingSection) => void }) {
  const { state, change } = useBookingPreview();
  const today = calendarToday();
  const [month, setMonth] = useState<CalendarMonth>({ year: 2026, month: 11 });
  const [date, setDate] = useState('2026-11-14');
  const [time, setTime] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [editingId, setEditingId] = useState<string | null>(null);
  // [구성] dialog 상태: 모달 종류별로 필요한 데이터만 가지도록 Dialog 타입으로 관리합니다.
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const cells = useMemo(() => calendarCells(month), [month]);
  const editing = state.bookings.find(b => b.id === editingId);
  const detailed = dialog && (dialog.kind === 'detail' || dialog.kind === 'cancel') ? state.bookings.find(b => b.id === dialog.id) : undefined;
  // [구성] list 변수: 예정 목록은 가까운 일정부터, 완료·취소 내역은 최근 일정부터 정렬합니다.
  const list = state.bookings.filter(b => filter === 'upcoming' ? b.status === 'scheduled' : b.status !== 'scheduled').sort((a, b) => filter === 'upcoming' ? startsAt(a) - startsAt(b) : startsAt(b) - startsAt(a));
  const available = availableCredits(state);
  const selectedStatus = time ? slotState(state, date, time, editingId ?? undefined) : null;
  const statusLabels = { scheduled: '예약 확정', completed: '수업 완료', cancelled: '취소 완료', late_cancelled: '늦은 취소' };

  // [기능] selectMonth 함수: 표시 월과 선택 날짜를 바꾸고 기존 선택 시간을 해제합니다.
  function selectMonth(offset: number) {
    const next = shiftMonth(month, offset);
    setMonth(next); setDate(`${monthKey(next)}-${next.month === 11 ? '14' : '01'}`); setTime(null);
  }

  // [기능] startNewBooking 함수: 수정 대상과 시간 선택을 초기화하고 예약하기 탭을 엽니다.
  function startNewBooking() { setEditingId(null); setTime(null); setDialog(null); onSectionChange('new'); }
  // [기능] startChange 함수: 선택한 예약을 수정 대상으로 잡고 해당 월의 날짜 선택 화면을 엽니다.
  function startChange(booking: PreviewBooking) {
    setEditingId(booking.id); setDate(booking.date); setTime(null);
    setMonth({ year: Number(booking.date.slice(0, 4)), month: Number(booking.date.slice(5, 7)) });
    setDialog(null); onSectionChange('new');
  }
  // [기능] confirmBooking 함수: 확인한 일정으로 예시 예약 생성 또는 변경 명령을 적용하고 결과를 안내합니다.
  function confirmBooking() {
    if (dialog?.kind !== 'confirm') return;
    const result = change(editingId ? { type: 'move', id: editingId, date: dialog.date, time: dialog.time } : { type: 'create', date: dialog.date, time: dialog.time });
    if (!result.ok) { setDialog({ kind: 'message', title: '일정을 다시 확인해 주세요', message: result.message }); return; }
    setDialog({ kind: 'message', title: editingId ? '예시 일정을 변경했어요' : '예시 예약을 추가했어요', message: `${dateLabel(result.booking.date)} ${result.booking.time}–${endTime(result.booking.time)}\n${member.trainer} 트레이너\n\n내 예약과 마이페이지의 현재 예약 횟수에 반영했어요. 앱을 다시 열면 예시 일정으로 돌아가요.` });
    setEditingId(null); setTime(null); setFilter('upcoming'); onSectionChange('mine');
  }
  // [기능] cancelBooking 함수: 상세 화면의 예약을 예시 상태에서 취소하고 차감 여부 안내를 표시합니다.
  function cancelBooking() {
    if (!detailed) return;
    const result = change({ type: 'cancel', id: detailed.id });
    setDialog(result.ok ? { kind: 'message', title: '예시 예약을 취소했어요', message: result.booking.status === 'late_cancelled' ? '늦은 취소는 원래 수업 종료 후 1회 차감되는 것으로 표시돼요. 그때까지 현재 예약 횟수 1회는 유지돼요.' : '현재 예약 횟수가 1회 줄었어요. 취소한 일정은 지난 예약에서 볼 수 있어요.' } : { kind: 'message', title: '취소할 수 없어요', message: result.message });
  }
  const sheetTitle = dialog?.kind === 'message' ? dialog.title : dialog?.kind === 'confirm' ? editingId ? '변경할 일정 확인' : '예약 내용 확인' : dialog?.kind === 'cancel' ? '예약을 취소할까요?' : '예약 상세';

  return <MemberPage title="예약" subtitle="담당 트레이너와 나에게 맞는 시간을 찾아보세요.">
    <View style={styles.segments} accessibilityRole="tablist" accessibilityLabel="예약 보기">
      {([{ key: 'new', label: '예약하기' }, { key: 'mine', label: '내 예약' }] as const).map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: section === item.key }} onPress={() => item.key === 'new' ? startNewBooking() : onSectionChange(item.key)} style={[styles.segment, section === item.key && styles.segmentSelected]}><Text style={[styles.segmentLabel, section === item.key && styles.segmentLabelSelected]}>{item.label}</Text></Pressable>)}
    </View>

    {section === 'new' ? <>
      {editing && <View style={ui.info}><Text style={ui.title}>예약 변경 중</Text><Text style={ui.caption}>기존 {dateLabel(editing.date)} {editing.time} · 새 일정 확인 전까지 유지돼요.</Text><Pressable accessibilityRole="button" onPress={() => { setEditingId(null); setTime(null); }} style={styles.inlineAction}><Text style={ui.link}>변경 그만하기</Text></Pressable></View>}
      <View style={[ui.card, ui.row]}><View style={styles.avatar}><Text style={styles.avatarLabel}>{member.trainerInitial}</Text></View><View style={ui.fill}><Text style={ui.small}>담당 트레이너</Text><Text style={ui.title}>{member.trainer} 트레이너</Text><Text style={ui.caption}>1:1 개인 PT · 60분 수업</Text></View></View>
      <View style={[styles.credits, ui.row]}><View style={ui.fill}><Text style={ui.title}>추가 예약 가능</Text><Text style={ui.caption}>잔여 {state.remaining}회 − 현재 예약 횟수 {heldCredits(state)}회</Text></View><View style={styles.creditNumber}><Text style={ui.number}>{available}</Text><Text style={styles.unit}>회</Text></View></View>
      <View style={ui.card}>
        <Text style={ui.title}>날짜 선택</Text>
        <View style={ui.row}>
          <Pressable accessibilityRole="button" accessibilityLabel="예약 이전 달" disabled={monthKey(month) === '2026-11'} accessibilityState={{ disabled: monthKey(month) === '2026-11' }} onPress={() => selectMonth(-1)} style={[styles.monthArrow, monthKey(month) === '2026-11' && ui.disabled]}><Text style={styles.arrow}>‹</Text></Pressable>
          <Text style={styles.monthTitle} accessibilityLiveRegion="polite">{month.year}년 {month.month}월</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="예약 다음 달" disabled={monthKey(month) === '2026-12'} accessibilityState={{ disabled: monthKey(month) === '2026-12' }} onPress={() => selectMonth(1)} style={[styles.monthArrow, monthKey(month) === '2026-12' && ui.disabled]}><Text style={styles.arrow}>›</Text></Pressable>
        </View>
        <View style={styles.weekdays}>{['일', '월', '화', '수', '목', '금', '토'].map((label, index) => <Text key={label} style={[styles.weekday, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{label}</Text>)}</View>
        <View style={styles.grid}>{cells.map((cell, index) => {
          const disabled = !cell.date || cell.date < '2026-11-12' || cell.date > member.pt.expiresOn;
          const selected = cell.date === date;
          const booked = state.bookings.some(booking => booking.date === cell.date && booking.status === 'scheduled');
          return <View key={cell.key} style={styles.dateCell}>{cell.date && <Pressable accessibilityRole="button" accessibilityLabel={`${month.month}월 ${cell.day}일 예약 날짜${cell.date === today ? ", 오늘" : ""}${booked ? ", 내 예약 있음" : ""}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => { setDate(cell.date!); setTime(null); }} style={[styles.dateButton, disabled && ui.disabled, cell.date && (attendancePreview.attendanceDates as readonly string[]).includes(cell.date) && marks.attended, booked && styles.bookedDate, selected && styles.dateSelected, cell.date === today && marks.today]}><Text style={[styles.dateNumber, index % 7 === 0 && styles.sunday, index % 7 === 6 && styles.saturday, selected && styles.dateNumberSelected, cell.date === today && marks.todayNumber]}>{cell.day}</Text>{!disabled && hasPublishedTimes(cell.date) && <View style={[styles.dateDot, selected && styles.dateDotSelected]} />}</Pressable>}</View>;
        })}</View>
        <CalendarLegend /><View style={styles.bookingLegend}><View style={[styles.bookingLegendCircle, styles.bookedDate]} /><Text style={ui.small}>내 예약</Text></View>
        <View><Text style={ui.small}>현재 달·다음 달의 공개 시간</Text><Text style={ui.small}>PT 유효기간 · 2026.12.30까지</Text></View>
      </View>
      <View style={ui.card}>
        <View style={ui.row}><Text style={ui.title}>시간 선택</Text><Text style={ui.link}>{dateLabel(date)}</Text></View>
        {!hasPublishedTimes(date) ? <View style={ui.empty}><Text style={ui.body}>공개된 시간이 없어요.</Text><Text style={ui.caption}>다른 날짜를 선택해 주세요.</Text></View> : <View style={styles.timeGrid}>{Array.from({ length: Math.ceil(publishedTimes.length / 3) }, (_, row) => <View key={row} style={styles.timeRow}>{[0, 1, 2].map(column => {
          const slot = publishedTimes[row * 3 + column];
          if (!slot) return <View key={column} style={styles.timeCell} />;
          const status = slotState(state, date, slot, editingId ?? undefined);
          const disabled = status !== 'available';
          const label = status === 'reserved' ? '내 예약' : status === 'full' ? '마감' : status === 'past' ? '지난 시간' : status === 'expired' ? '기간 만료' : '';
          return <View key={slot} style={styles.timeCell}><Pressable accessibilityRole="button" accessibilityLabel={`${slot} 수업${label ? `, ${label}` : ''}`} accessibilityState={{ selected: time === slot, disabled }} disabled={disabled} onPress={() => setTime(slot)} style={[styles.timeButton, time === slot && styles.timeSelected, disabled && styles.timeDisabled]}><Text style={[styles.timeText, time === slot && styles.timeTextSelected]}>{slot}</Text><Text style={[styles.timeCaption, time === slot && styles.timeTextSelected]}>{label || `~ ${endTime(slot)}`}</Text></Pressable></View>;
        })}</View>)}</View>}
        <Text style={ui.small}>예약한 수업의 예정 종료 후 1회를 차감해요.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={editingId ? '변경 내용 확인' : '예약 내용 확인'} disabled={!time || selectedStatus !== 'available' || (!editingId && available < 1)} accessibilityState={{ disabled: !time || selectedStatus !== 'available' || (!editingId && available < 1) }} onPress={() => time && setDialog({ kind: 'confirm', date, time })} style={[ui.button, (!time || selectedStatus !== 'available' || (!editingId && available < 1)) && ui.disabled]}><Text style={ui.buttonText}>{editingId ? '변경 내용 확인' : '예약 내용 확인'}</Text></Pressable>
      </View>
    </> : <>
      <View style={styles.listFilters}>{([{ key: 'upcoming', label: '예정된 예약' }, { key: 'past', label: '지난 예약' }] as const).map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: filter === item.key }} onPress={() => setFilter(item.key)} style={[styles.filter, filter === item.key && styles.filterSelected]}><Text style={[styles.filterText, filter === item.key && styles.filterTextSelected]}>{item.label}</Text></Pressable>)}</View>
      <View style={ui.row}><Text style={ui.caption}>{list.length}개의 {filter === 'upcoming' ? '예정된 수업' : '완료·취소 내역'}</Text><Text style={ui.link}>현재 예약 횟수 {heldCredits(state)}회</Text></View>
      {list.length === 0 && <View style={[ui.card, ui.empty]}><Text style={ui.title}>예정된 예약이 없어요.</Text><Text style={ui.caption}>담당 트레이너의 빈 시간을 확인해 보세요.</Text><Pressable accessibilityRole="button" onPress={startNewBooking} style={ui.secondary}><Text style={ui.secondaryText}>예약하러 가기</Text></Pressable></View>}
      {list.map(booking => <Pressable key={booking.id} accessibilityRole="button" accessibilityLabel={`${dateLabel(booking.date)} ${booking.time} 예약 상세`} onPress={() => setDialog({ kind: 'detail', id: booking.id })} style={({ pressed }) => [ui.card, pressed && ui.pressed]}>
        <View style={ui.row}><View style={styles.dateTile}><Text style={styles.tileMonth}>{Number(booking.date.slice(5, 7))}월</Text><Text style={styles.tileDay}>{Number(booking.date.slice(8))}</Text></View><View style={ui.fill}><Text style={ui.title}>{booking.time}–{endTime(booking.time)}</Text><Text style={ui.caption}>개인 PT · {member.trainer} 트레이너</Text></View><DesignIcon name="chevron" /></View>
        <View style={ui.row}><Text style={ui.badge}>{statusLabels[booking.status]}</Text><Text style={ui.small}>{booking.status === 'scheduled' ? '종료 후 1회 차감 예정' : booking.status === 'late_cancelled' ? '원래 종료 후 1회 차감' : booking.status === 'completed' ? '1회 차감 완료' : '예약 취소'}</Text></View>
      </Pressable>)}
    </>}

    <DetailSheet visible={dialog !== null} title={sheetTitle} onClose={() => setDialog(null)} footer={dialog?.kind === 'confirm' ? <Pressable accessibilityRole="button" onPress={confirmBooking} style={ui.button}><Text style={ui.buttonText}>{editingId ? '미리보기 일정 변경' : '미리보기 예약하기'}</Text></Pressable> : dialog?.kind === 'cancel' ? <><Pressable accessibilityRole="button" onPress={cancelBooking} style={ui.button}><Text style={ui.buttonText}>안내 확인 후 예시 예약 취소</Text></Pressable><Pressable accessibilityRole="button" onPress={() => detailed && setDialog({ kind: 'detail', id: detailed.id })} style={ui.secondary}><Text style={ui.secondaryText}>예약 유지하기</Text></Pressable></> : dialog?.kind === 'detail' && detailed?.status === 'scheduled' ? <><View style={styles.actionRow}><Pressable accessibilityRole="button" disabled={!canChange(detailed)} onPress={() => startChange(detailed)} style={[ui.secondary, ui.fill, !canChange(detailed) && ui.disabled]}><Text style={ui.secondaryText}>일정 변경</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setDialog({ kind: 'cancel', id: detailed.id })} style={[ui.secondary, ui.fill]}><Text style={ui.secondaryText}>예약 취소</Text></Pressable></View><Text style={ui.small}>일정 변경은 원래 수업 시작 24시간 전까지 가능해요.</Text></> : <><Pressable accessibilityRole="button" onPress={() => setDialog(null)} style={ui.button}><Text style={ui.buttonText}>확인</Text></Pressable>{dialog?.kind === 'message' && <Pressable accessibilityRole="button" onPress={startNewBooking} style={ui.secondary}><Text style={ui.secondaryText}>다른 수업 예약하기</Text></Pressable>}</>}>
      {dialog?.kind === 'message' && <Text style={ui.body}>{dialog.message}</Text>}
      {dialog?.kind === 'confirm' && <>
        <View style={ui.card}><Text style={ui.title}>{dateLabel(dialog.date)} {dialog.time}–{endTime(dialog.time)}</Text><Text style={ui.body}>개인 PT · {member.trainer} 트레이너</Text><Text style={ui.caption}>{member.pt.label} · 12.30까지 유효</Text></View>
        {editing && <Text style={ui.caption}>기존 {dateLabel(editing.date)} {editing.time} → 새 시간으로 변경해요. 확인 전까지 원래 예약은 유지돼요.</Text>}
        <View style={ui.info}><Text style={ui.title}>{editingId ? '현재 예약 횟수는 그대로예요' : `예약 가능 ${available}회 → ${Math.max(0, available - 1)}회`}</Text><Text style={ui.caption}>수업 예정 종료 후 1회를 차감해요.</Text></View>
        <Text style={ui.caption}>취소 기한: {new Date(startsAt(dialog) - 86400000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}까지{ '\n' }24시간 이내 취소도 원래 종료 후 1회 차감돼요.</Text>
        <Text style={ui.small}>디자인 확인용 예시 예약이에요. 실제 수업이 등록되지는 않아요.</Text>
      </>}
      {detailed && <>
        <View style={ui.card}><Text style={ui.badge}>{statusLabels[detailed.status]}</Text><Text style={ui.title}>{dateLabel(detailed.date)} {detailed.time}–{endTime(detailed.time)}</Text><Text style={ui.body}>개인 PT · {member.trainer} 트레이너</Text><Text style={ui.caption}>{member.pt.label}</Text></View>
        {dialog?.kind === 'cancel' ? <View style={ui.info}><Text style={ui.title}>{cancellationKind(detailed) === 'on_time' ? '현재 예약 횟수가 1회 줄어요' : '취소해도 1회 차감돼요'}</Text><Text style={ui.body}>{cancellationKind(detailed) === 'on_time' ? '수업 시작까지 24시간 이상 남아 있어요. 취소 후 다른 수업을 예약할 수 있어요.' : '수업 시작 24시간 이내예요. 원래 수업 종료 후 1회 차감되며, 그때까지 현재 예약 횟수를 유지해요.'}</Text></View> : <>
          <View style={ui.info}><Text style={ui.title}>{detailed.status === 'scheduled' ? '예약 종료 후 1회 차감 예정' : detailed.status === 'completed' ? '수업 종료 후 1회 차감 완료' : detailed.status === 'late_cancelled' ? '늦은 취소 · 차감 예정' : '취소 · 취소 완료'}</Text><Text style={ui.caption}>표시된 예약과 횟수는 미리보기 예시예요.</Text></View>
          {detailed.status === 'completed' && <View style={ui.card}><Text style={ui.title}>수업 일지</Text><Text style={ui.body}>{detailed.journal || '트레이너가 수업 일지를 준비하고 있어요.'}</Text></View>}
        </>}
      </>}
    </DetailSheet>
  </MemberPage>;
}

// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
const styles = StyleSheet.create({
  segments: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 28, padding: 4 }, segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 24 }, segmentSelected: { backgroundColor: colors.card }, segmentLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.readableMuted }, segmentLabelSelected: { fontFamily: fonts.bold, color: colors.primary },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.congestion }, avatarLabel: { fontFamily: fonts.bold, fontSize: 18, color: colors.primary }, trainerTag: { fontFamily: fonts.medium, fontSize: 11, color: colors.primary },
  credits: { backgroundColor: colors.congestion, padding: 20, borderRadius: 24 }, creditNumber: { flexDirection: 'row', alignItems: 'baseline', gap: 5 }, unit: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary },
  monthArrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderRadius: 22 }, arrow: { fontSize: 28, color: colors.primary }, monthTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  weekdays: { flexDirection: 'row' }, weekday: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.medium, fontSize: 11, lineHeight: 22, color: colors.readableMuted }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, dateCell: { width: `${100 / 7}%`, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, dateButton: { width: 36, height: 36, paddingVertical: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 20, gap: 3 }, dateSelected: { backgroundColor: colors.primary }, dateNumber: { fontFamily: fonts.number, fontSize: 13, lineHeight: 20, color: colors.ink }, dateNumberSelected: { color: colors.onPrimary }, dateDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.primary }, dateDotSelected: { backgroundColor: colors.onPrimary },
  today: { borderColor: '#FF2020', borderWidth: 2 }, todayRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FF2020' }, legend: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  sunday: { color: '#C44336' }, saturday: { color: '#2E63B8' }, bookedDate: { backgroundColor: '#F1E2D6', borderWidth: 1, borderColor: colors.primary }, bookingLegend: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, bookingLegendCircle: { width: 12, height: 12, borderRadius: 6 },
  timeGrid: { gap: 10 }, timeRow: { flexDirection: 'row', gap: 10 }, timeCell: { flex: 1, minWidth: 0 }, timeButton: { width: '100%', height: 66, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.background, borderRadius: 16, borderWidth: 1, borderColor: colors.border }, timeSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, timeDisabled: { opacity: 0.4 }, timeText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink }, timeCaption: { fontFamily: fonts.regular, fontSize: 10, color: colors.readableMuted }, timeTextSelected: { color: colors.onPrimary },
  listFilters: { flexDirection: 'row', gap: 10 }, filter: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: 22, backgroundColor: colors.card }, filterSelected: { backgroundColor: colors.ink }, filterText: { fontFamily: fonts.medium, fontSize: 12, color: colors.readableMuted }, filterTextSelected: { color: colors.onPrimary },
  dateTile: { minWidth: 52, minHeight: 64, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.background }, tileMonth: { fontFamily: fonts.medium, fontSize: 10, color: colors.readableMuted }, tileDay: { fontFamily: fonts.number, fontSize: 24, lineHeight: 32, color: colors.primary }, inlineAction: { minHeight: 40, justifyContent: 'center' }, actionRow: { flexDirection: 'row', gap: 10 },
});



import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { MemberPage } from '../components/MemberPage';
import { DetailSheet } from '../components/DetailSheet';
import { DesignIcon } from '../components/DesignIcon';
import { memberStyles as ui } from '../components/memberStyles';
import { memberPreview as member } from '../data/memberPreview';
import { useBookingPreview } from '../state/BookingPreviewContext';
import { availableCredits, dateLabel, heldCredits } from '../utils/bookingPreview';
import { colors, fonts } from '../theme/warmWellness';

type Menu = 'profile' | 'membership' | 'pt' | 'pause' | 'pause-help' | 'journals' | 'news' | 'notifications' | 'settings' | 'password' | 'logout' | 'withdraw';
const titles: Record<Menu, string> = { profile: '회원정보', membership: '시설 이용권', pt: 'PT 이용권', pause: '휴회 신청 및 내역', 'pause-help': '휴회 신청 안내', journals: 'PT 완료 일지', news: '소식', notifications: '알림함', settings: '알림 설정', password: '비밀번호 변경', logout: '로그아웃', withdraw: '회원 탈퇴 안내' };

export function MyPageScreen({ onOpenBookings }: { onOpenBookings: () => void }) {
  const { state } = useBookingPreview();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [selectedJournal, setSelectedJournal] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<string | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);
  const [readNotices, setReadNotices] = useState<string[]>([]);
  const [settings, setSettings] = useState({ booking: true, membership: true, journal: false });
  const unread = member.notifications.length - readNotices.length;
  const completed = state.bookings.filter(b => b.status === 'completed');
  const journal = completed.find(b => b.id === selectedJournal);
  const news = member.news.find(item => item.id === selectedNews);
  const notification = member.notifications.find(item => item.id === selectedNotice);
  const available = availableCredits(state);

  function open(value: Menu) { setSelectedJournal(null); setSelectedNews(null); setSelectedNotice(null); setMenu(value); }
  function row(value: Menu, label: string, badge?: string) {
    return <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} onPress={() => open(value)} style={({ pressed }) => [styles.menuRow, pressed && ui.pressed]}><Text style={styles.menuLabel}>{label}</Text>{badge && <Text style={styles.menuBadge}>{badge}</Text>}<DesignIcon name="chevron" /></Pressable>;
  }
  function pair(label: string, value: string) { return <View key={label} style={[ui.row, ui.wrap]}><Text style={ui.caption}>{label}</Text><Text style={ui.title}>{value}</Text></View>; }

  return <MemberPage title="마이페이지" subtitle="나의 이용권과 운동 소식을 모아봤어요.">
    <Pressable accessibilityRole="button" accessibilityLabel="회원정보 보기" onPress={() => open('profile')} style={({ pressed }) => [ui.card, ui.row, pressed && ui.pressed]}>
      <View style={styles.avatar}><Text style={styles.avatarText}>하</Text></View><View style={ui.fill}><Text style={styles.memberName}>{member.name}님</Text><Text style={ui.caption}>{member.maskedPhone}</Text><Text style={styles.memberTag}>MEMBER · 예시 회원</Text></View><DesignIcon name="chevron" />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="시설 이용권 상세" onPress={() => open('membership')} style={({ pressed }) => [styles.membershipCard, pressed && ui.pressed]}>
      <View style={ui.row}><Text style={ui.title}>시설 이용권</Text><DesignIcon name="chevron" /></View>
      <Text style={ui.caption}>만료일</Text><Text style={[ui.number, { fontSize: 30 }]}>{member.membership.expiresOn}</Text>
      <Text style={styles.activeBadge}>이용 중</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="PT 이용권 상세" onPress={() => open('pt')} style={({ pressed }) => [ui.card, pressed && ui.pressed]}>
      <View style={ui.row}><Text style={ui.title}>나의 PT 이용권</Text><DesignIcon name="chevron" /></View>
      <Text style={ui.caption}>{member.pt.label} · {member.trainer} 트레이너</Text>
      <View style={styles.ptStats}>{[{ label: '실제 잔여', value: state.remaining }, { label: '현재 예약 횟수', value: heldCredits(state) }, { label: '추가 예약 가능', value: available }].map((item, index) => <View key={item.label} accessible accessibilityLabel={`${item.label} ${item.value}회`} style={[styles.ptStat, index !== 0 && styles.ptDivider]}><Text style={styles.ptLabel}>{item.label}</Text><Text style={[styles.ptValue, index === 2 && styles.accent]}>{item.value}<Text style={styles.ptUnit}> 회</Text></Text></View>)}</View>
    </Pressable>

    <View style={styles.group}><Text style={styles.groupTitle}>나의 운동</Text><View style={styles.menuCard}>{row('pause', '휴회 신청 및 내역')}{row('journals', 'PT 완료 일지', `${completed.length}`)}{row('news', '소식', 'NEW')}</View></View>
    <View style={styles.group}><Text style={styles.groupTitle}>알림</Text><View style={styles.menuCard}>{row('notifications', '알림함', unread ? `${unread}` : undefined)}{row('settings', '알림 설정')}</View></View>
    <View style={styles.group}><Text style={styles.groupTitle}>계정 관리</Text><View style={styles.menuCard}>{row('password', '비밀번호 변경')}{row('logout', '로그아웃')}{row('withdraw', '회원 탈퇴')}</View></View>

    <DetailSheet visible={menu !== null} title={menu ? titles[menu] : ''} onClose={() => setMenu(null)} footer={menu === 'pt' ? <Pressable accessibilityRole="button" onPress={() => { setMenu(null); onOpenBookings(); }} style={ui.button}><Text style={ui.buttonText}>내 예약 보기</Text></Pressable> : menu === 'pause' ? <Pressable accessibilityRole="button" onPress={() => setMenu('pause-help')} style={ui.button}><Text style={ui.buttonText}>휴회 신청 안내</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => setMenu(null)} style={ui.button}><Text style={ui.buttonText}>확인</Text></Pressable>}>
      {menu === 'profile' && <><View style={ui.card}>{pair('이름', member.name)}{pair('휴대전화', member.phone)}{pair('회원번호', member.memberNumber)}{pair('담당 트레이너', `${member.trainer} 트레이너`)}</View><Text style={ui.caption}>휴대전화번호 변경은 본인 확인을 위해 데스크에 문의해 주세요.</Text></>}
      {menu === 'membership' && <><View style={ui.info}><Text style={ui.title}>시설 이용권 · 이용 중</Text><Text style={[ui.number, { fontSize: 30 }]}>{member.membership.expiresOn}</Text><Text style={ui.caption}>만료일</Text></View><View style={ui.card}>{pair('이용 시작', member.membership.startsOn)}{pair('현재 만료일', member.membership.expiresOn)}{pair('누적 개근 보상', '2일')}</View><Text style={ui.title}>기간 변경 이력</Text><View style={ui.card}><Text style={ui.body}>개근 보상으로 1일 연장</Text><Text style={ui.caption}>예시 기록 · 2026.10.23</Text><View style={ui.divider} /><Text style={ui.body}>개근 보상으로 1일 연장</Text><Text style={ui.caption}>예시 기록 · 2026.10.05</Text></View></>}
      {menu === 'pt' && <><View style={ui.card}><Text style={ui.title}>{member.pt.label}</Text>{pair('담당 트레이너', member.trainer)}{pair('유효기간', '2026.11.01–12.30')}{pair('실제 잔여', `${state.remaining}회`)}{pair('현재 예약 횟수', `${heldCredits(state)}회`)}{pair('추가 예약 가능', `${available}회`)}</View><View style={ui.info}><Text style={ui.body}>예약하면 추가 예약 가능 횟수가 1회 줄어요.</Text><Text style={ui.caption}>실제 차감은 수업 예정 종료 후 이루어져요. 예약·변경·취소 예시가 이 횟수에도 함께 반영돼요.</Text></View></>}
      {menu === 'pause' && <><View style={[ui.card, ui.empty]}><Text style={ui.title}>등록된 휴회 내역이 없어요.</Text><Text style={ui.caption}>운동을 잠시 쉬어야 할 때 휴회를 신청할 수 있어요.</Text></View><Text style={ui.body}>휴무와 휴회일은 개근 진행을 보존해요. (회원 신청 휴회는 개근 보존이 되지 않아요.)</Text><Text style={ui.caption}>신청 가능한 기간과 횟수는 데스크에서 설정한 이용권 조건에 따라 달라져요.</Text></>}
      {menu === 'pause-help' && <><Text style={ui.body}>휴회 시작일 전에 기간을 정해 신청해 주세요.</Text><View style={ui.info}><Text style={ui.title}>승인 후 적용되는 내용</Text><Text style={ui.caption}>승인된 실제 휴회 일수만큼 시설·PT 유효기간을 조정해요. 겹치는 PT 예약은 무차감 취소되며 취소된 예약은 자동 복원되지 않아요.</Text></View><Text style={ui.caption}>현재는 화면 미리보기예요. 실제 휴회가 접수되지는 않아요.</Text></>}
      {menu === 'journals' && (journal ? <><Pressable accessibilityRole="button" onPress={() => setSelectedJournal(null)} style={styles.backLink}><Text style={ui.link}>‹ 일지 목록</Text></Pressable><Text style={ui.title}>{dateLabel(journal.date)} {journal.time} 개인 PT</Text><Text style={ui.caption}>작성자 {member.trainer} 트레이너</Text><View style={ui.card}><Text style={ui.body}>{journal.journal || '트레이너가 일지를 준비하고 있어요.'}</Text></View><Text style={ui.small}>회원은 본인의 수업 일지를 읽을 수 있어요.</Text></> : completed.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${dateLabel(item.date)} 수업 일지`} onPress={() => setSelectedJournal(item.id)} style={ui.card}><View style={ui.row}><Text style={ui.title}>{dateLabel(item.date)} 개인 PT</Text><DesignIcon name="chevron" /></View><Text style={ui.caption}>{member.trainer} 트레이너 · {item.journal ? '작성 완료' : '작성 대기'}</Text></Pressable>))}
      {menu === 'news' && (news ? <><Pressable accessibilityRole="button" onPress={() => setSelectedNews(null)} style={styles.backLink}><Text style={ui.link}>‹ 소식 목록</Text></Pressable><Text style={ui.badge}>{news.category}</Text><Text style={ui.title}>{news.title}</Text><Text style={ui.caption}>{news.date}</Text><Text style={ui.body}>{news.body}</Text></> : member.news.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => setSelectedNews(item.id)} style={ui.card}><Text style={ui.link}>{item.category}</Text><View style={ui.row}><Text style={[ui.title, ui.fill]}>{item.title}</Text><DesignIcon name="chevron" /></View><Text style={ui.caption}>{item.date}</Text></Pressable>))}
      {menu === 'notifications' && <>{member.notifications.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => { setSelectedNotice(item.id); setReadNotices(current => current.includes(item.id) ? current : [...current, item.id]); }} style={ui.card}><View style={ui.row}><Text style={[ui.title, ui.fill]}>{item.title}</Text>{!readNotices.includes(item.id) && <View style={styles.unreadDot} />}</View><Text style={ui.caption}>{item.date}</Text>{notification?.id === item.id && <Text style={ui.body}>{item.body}</Text>}</Pressable>)}<Text style={ui.caption}>푸시 알림을 꺼도 알림함 기록은 유지돼요.</Text></>}
      {menu === 'settings' && <><Text style={ui.caption}>받고 싶은 앱 알림을 선택해 주세요.</Text><View style={styles.menuCard}>{([{ key: 'booking', label: 'PT 예약·수업 알림' }, { key: 'membership', label: '이용권 만료 알림' }, { key: 'journal', label: '수업 일지 등록 알림' }] as const).map(item => <View key={item.key} style={styles.settingRow}><Text style={[ui.body, ui.fill]}>{item.label}</Text><Switch accessibilityLabel={item.label} value={settings[item.key]} onValueChange={value => setSettings(current => ({ ...current, [item.key]: value }))} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.card} ios_backgroundColor={colors.border} /></View>)}</View><Text style={ui.small}>미리보기 설정이에요. 앱을 다시 열면 초기값으로 돌아가요. 알림함 기록에는 영향을 주지 않아요.</Text></>}
      {menu === 'password' && <><View style={ui.info}><Text style={ui.title}>안전하게 계정을 관리해요.</Text><Text style={ui.body}>비밀번호 변경에는 현재 계정의 본인 인증이 필요해요.</Text></View><Text style={ui.caption}>이번 디자인 미리보기에서는 비밀번호를 입력하거나 변경하지 않아요.</Text></>}
      {menu === 'logout' && <><Text style={ui.body}>로그아웃하면 다음 이용 시 다시 로그인해야 해요.</Text><View style={ui.info}><Text style={ui.caption}>지금은 디자인 미리보기예요. 계정 로그인 상태를 변경하지 않고 화면 확인만 마쳐요.</Text></View></>}
      {menu === 'withdraw' && <><Text style={ui.body}>탈퇴하기 전에 남은 이용권과 예약을 확인해 주세요.</Text><View style={ui.card}>{pair('시설 이용권', `${member.membership.remainingDays}일`)}{pair('PT 실제 잔여', `${state.remaining}회`)}{pair('현재 예약 횟수', `${heldCredits(state)}회`)}</View><Text style={ui.caption}>탈퇴는 환불 실행이나 남은 계약 포기 동의로 간주되지 않아요. 정산은 데스크에 별도로 문의해 주세요.</Text><View style={ui.info}><Text style={ui.small}>현재는 안내 화면만 확인해요. 실제 탈퇴가 접수되거나 회원정보가 삭제되지 않아요.</Text></View></>}
    </DetailSheet>
  </MemberPage>;
}

const styles = StyleSheet.create({
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.congestion }, avatarText: { fontFamily: fonts.medium, fontSize: 22, color: colors.primary }, memberName: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30, color: colors.ink }, memberTag: { fontFamily: fonts.medium, fontSize: 9, lineHeight: 18, letterSpacing: 1, color: colors.primary },
  membershipCard: { backgroundColor: colors.congestion, padding: 20, borderRadius: 24, gap: 14 }, valueRow: { flexDirection: 'row', gap: 5, alignItems: 'baseline' }, membershipNumber: { fontFamily: fonts.number, fontSize: 38, lineHeight: 46, letterSpacing: -1, color: colors.primary }, unit: { fontFamily: fonts.medium, fontSize: 14, color: colors.primary }, activeBadge: { alignSelf: 'flex-start', backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.medium, fontSize: 10, color: colors.primary, overflow: 'hidden' },
  ptStats: { flexDirection: 'row', paddingTop: 4 }, ptStat: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 4 }, ptDivider: { borderLeftWidth: 1, borderLeftColor: colors.border }, ptLabel: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 18, color: colors.readableMuted, textAlign: 'center' }, ptValue: { fontFamily: fonts.number, fontSize: 24, lineHeight: 32, color: colors.ink }, ptUnit: { fontFamily: fonts.medium, fontSize: 11 }, accent: { color: colors.primary },
  group: { gap: 10 }, groupTitle: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.readableMuted, paddingHorizontal: 6, marginTop: 4 }, menuCard: { borderRadius: 24, backgroundColor: colors.card, overflow: 'hidden' }, menuRow: { minHeight: 60, paddingHorizontal: 20, paddingVertical: 16, gap: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, menuLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 24, color: colors.ink }, menuBadge: { fontFamily: fonts.bold, fontSize: 10, color: colors.primary, backgroundColor: colors.congestion, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  backLink: { minHeight: 40, justifyContent: 'center' }, unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

// [목적] 회원 관리·가입 승인·시설 이용권을 각각 독립된 경로로 표시합니다. 표시할 기능의 데이터만 렌더링합니다.
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useNavigate, useSearchParams } from '../navigation/router';
import { AdminDateInput } from '../components/AdminDateInput';
import type { MemberSummary } from '../api/authApi';
import { useAdmin } from '../state/AdminContext';
import { adminSections, membershipDateError, selectAdminMembers, type AdminMemberSection } from '../utils/adminNavigation';
import { colors, fonts } from '../theme/warmWellness';

export function AdminMembersScreen({ section }: { section: AdminMemberSection }) {
  const { members, busy, loading, error, refresh, approve, registerMembership } = useAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('member');
  const [query, setQuery] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [formError, setFormError] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const wide = useWindowDimensions().width >= 850;
  const feature = adminSections.find(item => item.key === section)!;
  const visible = selectAdminMembers(members, section, query);
  const eligible = selectAdminMembers(members, 'memberships', '');
  const selected = section === 'memberships' ? eligible.find(member => member.accountId === selectedId) : undefined;
  useEffect(() => { setStartsOn(''); setExpiresOn(''); setFormError(''); }, [selectedId]);
  useEffect(() => { if (selectedId && !wide) scroll.current?.scrollTo({ y: 0, animated: true }); }, [selectedId, wide]);
  const statusLabel = (member: MemberSummary) => member.accountStatus === 'SUSPENDED' || member.status === 'SUSPENDED' ? '이용 정지' : member.status === 'PENDING' ? '승인 대기' : member.status === 'ACTIVE' ? '승인 완료' : '이용 불가';
  const phoneLabel = (phone: string) => phone.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  function openMembership(member: MemberSummary) {
    if (section === 'memberships') setParams({ member: member.accountId });
    else navigate('/admin/memberships?member=' + member.accountId);
  }
  async function save() {
    if (!selected || busy) return;
    const invalid = membershipDateError(startsOn, expiresOn);
    setFormError(invalid);
    if (invalid) return;
    if (await registerMembership(selected, startsOn, expiresOn)) setParams({});
  }
  function action(label: string, onPress: () => void, primary = false) {
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}><Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text></Pressable>;
  }
  return <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content} accessibilityLabel={feature.label}>
    <View style={styles.pageHeading}>
      <View style={styles.headingText}><Text accessibilityRole="header" style={styles.title}>{feature.label}</Text><Text style={styles.description}>{feature.description}</Text></View>
      {action(busy ? '처리 중…' : '목록 새로고침', () => void refresh())}
    </View>
    <View style={styles.summaryRow}>
      {[{ label: '조회된 회원', value: members.length }, { label: '승인 대기', value: selectAdminMembers(members, 'approvals', '').length }, { label: '승인 완료', value: eligible.length }].map(item => <View key={item.label} style={styles.summary}><Text style={styles.summaryLabel}>{item.label}</Text><Text style={styles.summaryNumber}>{loading ? '—' : item.value}<Text style={styles.summaryUnit}> 명</Text></Text></View>)}
    </View>
    <View style={[styles.columns, wide ? styles.wideColumns : section === 'memberships' && styles.smallColumns]}>
      <View style={styles.listColumn}>
        <View style={styles.searchGroup}>
          <Text style={styles.label}>회원 검색</Text>
          <TextInput accessibilityLabel="닉네임 또는 휴대전화번호로 회원 검색" placeholder="닉네임 또는 휴대전화번호" value={query} onChangeText={setQuery} style={styles.search} autoCapitalize="none" autoCorrect={false} />
          <Text style={styles.caption}>최근 등록 회원 최대 100명 중 {visible.length}명 표시</Text>
        </View>
        {loading ? <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.description}>회원 목록을 불러오고 있어요.</Text></View> : error && !members.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>회원 목록을 불러오지 못했어요.</Text><Text style={styles.description}>목록 새로고침으로 다시 시도해 주세요.</Text></View> : !visible.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? '검색 결과가 없습니다.' : section === 'approvals' ? '승인 대기 중인 회원이 없습니다.' : section === 'memberships' ? '이용권을 등록할 수 있는 회원이 없습니다.' : '등록된 회원이 없습니다.'}</Text><Text style={styles.description}>{query ? '다른 닉네임이나 휴대전화번호로 검색해 보세요.' : section === 'memberships' ? '가입 승인을 완료하면 이 목록에 표시됩니다.' : '새로 등록된 회원은 목록 새로고침으로 확인할 수 있습니다.'}</Text></View> : <View style={styles.list}>
          {visible.map(member => <View key={member.accountId} style={[styles.memberRow, selectedId === member.accountId && styles.selectedRow]}>
            <View style={styles.memberInfo}><Text style={styles.memberName}>{member.name || '닉네임 설정 전'}</Text><Text style={styles.phone}>{phoneLabel(member.phone)}</Text><Text style={[styles.status, member.status === 'PENDING' && styles.pendingStatus]}>{statusLabel(member)}</Text></View>
            {section === 'approvals' ? action('회원 승인', () => void approve(member), true) : member.status === 'ACTIVE' && member.accountStatus === 'ACTIVE' ? action('이용권 등록', () => openMembership(member), section === 'memberships') : member.status === 'PENDING' ? action('승인 화면', () => navigate('/admin/approvals')) : null}
          </View>)}
        </View>}
      </View>
      {section === 'memberships' && <View style={[styles.formColumn, wide && styles.wideForm]}>
        <Text style={styles.formTitle}>시설 이용권 등록</Text>
        {selected ? <>
          <View style={styles.selectedMember}><Text style={styles.memberName}>{selected.name || '닉네임 설정 전'}</Text><Text style={styles.phone}>{phoneLabel(selected.phone)}</Text></View>
          <Text style={styles.label}>이용 시작일</Text><AdminDateInput label="이용 시작일" value={startsOn} onChange={setStartsOn} disabled={busy} />
          <Text style={styles.label}>이용 만료일</Text><AdminDateInput label="이용 만료일" value={expiresOn} onChange={setExpiresOn} disabled={busy} />
          <Text style={styles.caption}>시작일과 만료일을 포함해 등록합니다. 기존 이용권과 기간이 겹치면 등록할 수 없습니다.</Text>
          {!!formError && <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text>}
          {action(busy ? '등록 중…' : '시설 이용권 저장', () => void save(), true)}
          {action('선택 취소', () => setParams({}))}
        </> : <View style={styles.formEmpty}><Text style={styles.emptyTitle}>등록할 회원을 선택하세요.</Text><Text style={styles.description}>목록의 ‘이용권 등록’을 누르면 이용 기간을 설정할 수 있습니다.</Text></View>}
      </View>}
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  scroll: { flex: 1 }, content: { padding: 24, gap: 22, paddingBottom: 36 }, pageHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }, headingText: { flexShrink: 1, gap: 6 },
  title: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 32, color: colors.ink }, description: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 22, color: colors.readableMuted },
  summaryRow: { flexDirection: 'row', gap: 10 }, summary: { flex: 1, paddingHorizontal: 15, paddingVertical: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, gap: 10 }, summaryLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.readableMuted }, summaryNumber: { fontFamily: fonts.number, fontSize: 25, color: colors.ink }, summaryUnit: { fontFamily: fonts.regular, fontSize: 11, color: colors.readableMuted },
  columns: { gap: 20 }, wideColumns: { flexDirection: 'row', alignItems: 'flex-start' }, smallColumns: { flexDirection: 'column-reverse' }, listColumn: { flex: 1, gap: 14 }, searchGroup: { gap: 8 }, label: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink }, search: { minHeight: 46, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card, fontFamily: fonts.regular, color: colors.ink, fontSize: 13 }, caption: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 19, color: colors.readableMuted },
  list: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' }, memberRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border }, selectedRow: { backgroundColor: colors.congestion }, memberInfo: { flexShrink: 1, gap: 5 }, memberName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink }, phone: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.readableMuted }, status: { alignSelf: 'flex-start', fontFamily: fonts.medium, fontSize: 10, lineHeight: 18, backgroundColor: colors.canvas, color: colors.ink, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }, pendingStatus: { backgroundColor: colors.badge, color: colors.badgeInk },
  button: { minHeight: 42, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.card }, primaryButton: { backgroundColor: colors.primary, borderColor: colors.primary }, buttonText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.ink }, primaryButtonText: { color: colors.onPrimary }, pressed: { opacity: 0.7 }, disabled: { opacity: 0.5 },
  empty: { padding: 30, gap: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card }, emptyTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, lineHeight: 23 },
  formColumn: { gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 20 }, wideForm: { width: 320 }, formTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, marginBottom: 4 }, selectedMember: { padding: 12, borderRadius: 10, gap: 4, backgroundColor: colors.background, marginBottom: 6 }, formEmpty: { paddingVertical: 28, gap: 10 }, formError: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.primary },
});

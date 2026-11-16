// [목적] 앱에서는 회원을 한 열의 터치 카드로 표시합니다. 이용권 입력은 목록과 분리된 화면으로 이동합니다.
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigate, useSearchParams } from '../navigation/router';
import type { MemberSummary } from '../api/authApi';
import { useAdmin } from '../state/AdminContext';
import { adminSections, selectAdminMembers, type AdminMemberSection } from '../utils/adminNavigation';
import { colors, fonts } from '../theme/warmWellness';
import { AdminMembershipFormScreen } from './AdminMembershipFormScreen';

export function AdminMembersScreen({ section }: { section: AdminMemberSection }) {
  const { members, busy, loading, error, refresh, approve } = useAdmin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const feature = adminSections.find(item => item.key === section)!;
  const visible = selectAdminMembers(members, section, query);
  const memberId = params.get('member');
  // [기능] 같은 이용권 경로에서도 앱은 선택한 회원의 입력 화면만 표시합니다. 웹은 기존 목록·입력 패널을 유지합니다.
  if (section === 'memberships' && params.has('member')) return <AdminMembershipFormScreen key={memberId} memberId={memberId ?? ''} />;
  async function reload() {
    if (busy || refreshing) return;
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }
  function memberCard({ item }: { item: MemberSummary }) {
    const active = item.status === 'ACTIVE' && item.accountStatus === 'ACTIVE';
    const pending = item.status === 'PENDING' && item.accountStatus === 'PENDING';
    const status = pending ? '승인 대기' : active ? '승인 완료' : item.status === 'SUSPENDED' || item.accountStatus === 'SUSPENDED' ? '이용 정지' : '이용 불가';
    const label = section === 'approvals' ? '회원 승인' : active ? '시설 이용권 등록' : pending ? '가입 승인으로 이동' : '';
    return <View style={styles.card}>
      <View style={styles.cardHeading}>
        <View style={styles.avatar} accessible={false}><Text style={styles.avatarText}>{item.name.slice(0, 1) || '회'}</Text></View>
        <View style={styles.memberInfo}><Text style={styles.name}>{item.name || '닉네임 설정 전'}</Text><Text style={styles.phone}>{item.phone.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3')}</Text></View>
        <View style={[styles.status, pending && styles.pendingStatus]}><Text style={[styles.statusText, pending && styles.pendingText]}>{status}</Text></View>
      </View>
      {!!label && <Pressable accessibilityRole="button" accessibilityLabel={`${item.name || item.phone} ${label}`} disabled={busy} onPress={() => {
        if (section === 'approvals') void approve(item);
        else if (active) navigate('/admin/memberships?member=' + item.accountId);
        else navigate('/admin/approvals');
      }} style={({ pressed }) => [styles.cardAction, section === 'approvals' && styles.primaryAction, busy && styles.disabled, pressed && styles.pressed]}>
        <Text style={[styles.cardActionText, section === 'approvals' && styles.primaryText]}>{busy ? '처리 중…' : label}</Text>
        {section !== 'approvals' && <Text style={styles.chevron} accessible={false}>›</Text>}
      </Pressable>}
    </View>;
  }
  const header = <View style={styles.intro}>
    <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.title}>{feature.label}</Text><Text style={styles.count}>{loading ? '조회 중' : `${visible.length}명`}</Text></View>
    <Text style={styles.description}>{feature.description}</Text>
    <Text style={styles.searchLabel}>회원 검색</Text>
    <TextInput accessibilityLabel="닉네임 또는 휴대전화번호로 회원 검색" value={query} onChangeText={setQuery} placeholder="닉네임 또는 휴대전화번호" clearButtonMode="while-editing" autoCapitalize="none" autoCorrect={false} style={styles.search} />
    <Text style={styles.caption}>최근 등록 회원 최대 100명 기준 · 아래로 당겨 새로고침</Text>
  </View>;
  const empty = <View style={styles.empty}>
    {loading ? <><ActivityIndicator color={colors.primary} /><Text style={styles.description}>회원 목록을 불러오고 있어요.</Text></> : <>
      <Text style={styles.emptyTitle}>{error ? '목록을 불러오지 못했어요.' : query ? '검색 결과가 없어요.' : section === 'approvals' ? '승인 대기 중인 회원이 없어요.' : section === 'memberships' ? '승인된 회원이 없어요.' : '등록된 회원이 없어요.'}</Text>
      <Text style={styles.description}>{query ? '다른 닉네임이나 휴대전화번호로 검색해 주세요.' : section === 'memberships' && !error ? '회원 가입을 승인하면 이용권을 등록할 수 있어요.' : '새로고침으로 최신 목록을 확인할 수 있어요.'}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void reload()} style={styles.retry}><Text style={styles.cardActionText}>목록 새로고침</Text></Pressable>
    </>}
  </View>;
  return <FlatList style={styles.list} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} data={visible} keyExtractor={item => item.accountId} renderItem={memberCard} ListHeaderComponent={header} ListEmptyComponent={empty} ItemSeparatorComponent={CardGap} refreshing={refreshing} onRefresh={() => void reload()} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" accessibilityLabel={`${feature.label} 회원 카드 목록`} />;
}
function CardGap() { return <View style={styles.cardGap} />; }
const styles = StyleSheet.create({
  list: { flex: 1 }, content: { paddingHorizontal: 20, paddingTop: 16, flexGrow: 1 }, intro: { gap: 8, marginBottom: 20 }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 34, color: colors.ink }, count: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary }, description: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 22, color: colors.readableMuted }, caption: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 18, color: colors.readableMuted }, searchLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink, marginTop: 10 }, search: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  card: { borderRadius: 20, padding: 18, gap: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }, cardGap: { height: 12 }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.congestion }, avatarText: { fontFamily: fonts.medium, fontSize: 18, color: colors.primary }, memberInfo: { flex: 1, gap: 5 }, name: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.ink }, phone: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.readableMuted }, status: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.canvas }, pendingStatus: { backgroundColor: colors.badge }, statusText: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 17, color: colors.readableMuted }, pendingText: { color: colors.badgeInk },
  cardAction: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 16 }, primaryAction: { backgroundColor: colors.primary, borderColor: colors.primary }, cardActionText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 22, color: colors.ink }, primaryText: { color: colors.onPrimary }, chevron: { fontSize: 23, lineHeight: 26, color: colors.readableMuted }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.65 }, empty: { marginTop: 18, padding: 24, gap: 12, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20 }, emptyTitle: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 25, color: colors.ink }, retry: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border },
});

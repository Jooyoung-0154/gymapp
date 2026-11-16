// [목적] 관리자 전용 레이아웃입니다. 상단 메뉴는 유지하고 기능별 하위 경로를 Outlet에 표시합니다.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Outlet, useLocation, useNavigate } from '../navigation/router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminProvider, useAdmin } from '../state/AdminContext';
import { useAuth } from '../state/AuthContext';
import { adminSections } from '../utils/adminNavigation';
import { colors, fonts } from '../theme/warmWellness';

export function AdminLayout() { return <AdminProvider><AdminShell /></AdminProvider>; }
function AdminShell() {
  const { account, logout } = useAuth();
  const { members, busy, error, notice } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const pendingCount = members.filter(member => member.status === 'PENDING' && member.accountStatus === 'PENDING').length;
  async function signOut() {
    if (loggingOut || busy) return;
    setLoggingOut(true); setLogoutError('');
    try { await logout(); navigate('/', { replace: true }); }
    catch (e) { setLogoutError((e as Error).message); }
    finally { setLoggingOut(false); }
  }
  return <View style={[styles.page, { paddingTop: insets.top }]}>
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>TEST GYM · 운영 관리</Text>
        <Text accessibilityRole="header" style={styles.title}>관리자 페이지</Text>
        <Text style={styles.caption}>{account?.name || '운영자'}님, 필요한 업무를 선택하세요.</Text>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="link" disabled={busy || loggingOut} onPress={() => navigate('/')} style={({ pressed }) => [styles.appLink, pressed && styles.pressed]}><Text style={styles.appLinkText}>회원앱으로</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy || loggingOut} onPress={() => void signOut()} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}><Text style={styles.caption}>{loggingOut ? '로그아웃 중…' : '로그아웃'}</Text></Pressable>
      </View>
    </View>
    <ScrollView horizontal style={styles.navigation} contentContainerStyle={styles.navContent} accessibilityLabel="관리자 기능 메뉴">
      {adminSections.map(section => {
        const selected = location.pathname.replace(/\/$/, '') === section.path;
        return <Pressable key={section.key} accessibilityRole="link" accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => navigate(section.path)} style={({ pressed }) => [styles.navItem, selected && styles.navSelected, pressed && styles.pressed]}>
          <Text style={[styles.navLabel, selected && styles.navSelectedLabel]}>{section.label}</Text>
          {section.key === 'approvals' && <Text style={[styles.count, selected && styles.selectedCount]}>{pendingCount}</Text>}
        </Pressable>;
      })}
    </ScrollView>
    {!!(error || logoutError) && <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error || logoutError}</Text></View>}
    {!!notice && <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice}</Text></View>}
    <View style={styles.content}><Outlet /></View>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 24, paddingBottom: 22, gap: 18 },
  heading: { gap: 5 }, eyebrow: { fontFamily: fonts.medium, fontSize: 11, color: colors.primary, letterSpacing: 1 },
  title: { fontFamily: fonts.bold, fontSize: 27, lineHeight: 40, color: colors.ink }, caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.readableMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, appLink: { minHeight: 42, paddingHorizontal: 15, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 10 }, appLinkText: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink }, logout: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 10 },
  navigation: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: colors.border }, navContent: { paddingHorizontal: 24, gap: 12 },
  navItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' }, navSelected: { borderBottomColor: colors.primary }, navLabel: { fontFamily: fonts.medium, color: colors.readableMuted, fontSize: 14 }, navSelectedLabel: { color: colors.primary, fontFamily: fonts.bold },
  count: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.border, color: colors.readableMuted, fontFamily: fonts.number, fontSize: 11 }, selectedCount: { backgroundColor: colors.congestion, color: colors.primary },
  content: { flex: 1 }, pressed: { opacity: 0.7 },
  error: { marginHorizontal: 24, marginTop: 16, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card }, errorText: { color: colors.primary, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 },
  notice: { marginHorizontal: 24, marginTop: 16, padding: 14, borderRadius: 10, backgroundColor: colors.badge }, noticeText: { color: colors.badgeInk, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 },
});

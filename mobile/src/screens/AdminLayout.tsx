// [목적] 앱 전용 관리자 레이아웃입니다. 웹은 AdminLayout.web.tsx를 사용하고 회원 데이터와 동작은 공통 제공자를 사용합니다.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Outlet, useLocation, useNavigate } from '../navigation/router';
import { AdminProvider, useAdmin } from '../state/AdminContext';
import { useAuth } from '../state/AuthContext';
import { adminBackTarget, adminSections } from '../utils/adminNavigation';
import { colors, fonts } from '../theme/warmWellness';

export function AdminLayout() { return <AdminProvider><AdminAppShell /></AdminProvider>; }
function AdminAppShell() {
  const insets = useSafeAreaInsets();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { logout } = useAuth();
  const { members, busy, error, notice } = useAdmin();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const form = adminBackTarget(pathname, search) === '/admin/memberships';
  const pendingCount = members.filter(member => member.status === 'PENDING' && member.accountStatus === 'PENDING').length;
  async function signOut() {
    if (busy || logoutBusy) return;
    setLogoutBusy(true); setLogoutError('');
    try { await logout(); navigate('/', { replace: true }); }
    catch (e) { setLogoutError((e as Error).message); }
    finally { setLogoutBusy(false); }
  }
  return <View style={[styles.page, { paddingTop: insets.top }]}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={form ? '이용권 회원 목록으로 돌아가기' : '회원앱으로 돌아가기'} disabled={busy || logoutBusy} onPress={() => navigate(adminBackTarget(pathname, search))} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
        <Text style={styles.backArrow}>‹</Text><Text style={styles.headerActionText}>{form ? '목록' : '회원앱'}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>{form ? '이용권 등록' : '관리자'}</Text>
      {form ? <View style={styles.headerSpacer} /> : <Pressable accessibilityRole="button" accessibilityLabel="운영자 로그아웃" disabled={busy || logoutBusy} onPress={() => void signOut()} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><Text style={styles.headerActionText}>{logoutBusy ? '종료 중' : '로그아웃'}</Text></Pressable>}
    </View>
    {!form && <ScrollView horizontal style={styles.menuScroll} contentContainerStyle={styles.menu} accessibilityRole="tablist" accessibilityLabel="관리자 앱 메뉴">
      {adminSections.map(section => {
        const selected = pathname.replace(/\/$/, '') === section.path;
        return <Pressable key={section.key} accessibilityRole="tab" accessibilityState={{ selected, disabled: busy || logoutBusy }} disabled={busy || logoutBusy} onPress={() => navigate(section.path)} style={({ pressed }) => [styles.menuItem, selected && styles.selectedMenu, pressed && styles.pressed]}>
          <Text style={[styles.menuText, selected && styles.selectedMenuText]}>{section.label}</Text>
          {section.key === 'approvals' && pendingCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>}
        </Pressable>;
      })}
    </ScrollView>}
    {!!(error || logoutError) && <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error || logoutError}</Text></View>}
    {!!notice && <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice}</Text></View>}
    <View style={styles.body}><Outlet /></View>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30, color: colors.ink }, headerAction: { minWidth: 68, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, headerSpacer: { width: 68 }, headerActionText: { fontFamily: fonts.medium, fontSize: 12, color: colors.readableMuted }, backArrow: { fontSize: 30, lineHeight: 34, color: colors.ink },
  menuScroll: { flexGrow: 0, flexShrink: 0 },
  menu: { flexDirection: 'row', gap: 4, padding: 5, backgroundColor: colors.canvas, borderRadius: 16, marginHorizontal: 20, marginTop: 18, marginBottom: 8 }, menuItem: { minWidth: 100, minHeight: 48, paddingHorizontal: 4, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, selectedMenu: { backgroundColor: colors.card }, menuText: { fontFamily: fonts.medium, fontSize: 12, color: colors.readableMuted }, selectedMenuText: { fontFamily: fonts.bold, color: colors.primary }, badge: { backgroundColor: colors.primary, borderRadius: 10, minWidth: 19, minHeight: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, badgeText: { color: colors.onPrimary, fontFamily: fonts.number, fontSize: 10 },
  body: { flex: 1 }, pressed: { opacity: 0.65 }, error: { marginHorizontal: 20, marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card }, errorText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.primary }, notice: { marginHorizontal: 20, marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.badge }, noticeText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.badgeInk },
});

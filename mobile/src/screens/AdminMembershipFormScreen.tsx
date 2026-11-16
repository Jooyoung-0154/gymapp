// [목적] 앱의 시설 이용권 입력 화면입니다. 선택한 회원과 날짜 입력에 집중하고 저장 버튼은 화면 아래에 유지합니다.
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigate } from '../navigation/router';
import { AdminDateInput } from '../components/AdminDateInput';
import { useAdmin } from '../state/AdminContext';
import { membershipDateError, selectAdminMembers } from '../utils/adminNavigation';
import { colors, fonts } from '../theme/warmWellness';

export function AdminMembershipFormScreen({ memberId }: { memberId: string }) {
  const { members, loading, busy, registerMembership } = useAdmin();
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const [startsOn, setStartsOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState('');
  const member = selectAdminMembers(members, 'memberships', '').find(item => item.accountId === memberId);
  async function save() {
    if (!member || busy) return;
    const invalid = membershipDateError(startsOn, expiresOn);
    setError(invalid);
    if (invalid) return;
    if (await registerMembership(member, startsOn, expiresOn)) navigate('/admin/memberships', { replace: true });
  }
  if (loading) return <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.caption}>회원 정보를 확인하고 있어요.</Text></View>;
  if (!member) return <View style={styles.empty}><Text style={styles.heading}>이용권을 등록할 수 없는 회원이에요.</Text><Text style={styles.body}>회원의 승인 상태를 확인하고 다시 선택해 주세요.</Text><Pressable accessibilityRole="button" onPress={() => navigate('/admin/memberships', { replace: true })} style={styles.secondaryButton}><Text style={styles.secondaryText}>회원 목록으로</Text></Pressable></View>;
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" accessibilityLabel="앱 시설 이용권 입력 화면">
      <Text style={styles.caption}>이용권을 등록할 회원</Text>
      <View style={styles.memberCard}><Text style={styles.name}>{member.name || '닉네임 설정 전'}</Text><Text style={styles.body}>{member.phone.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3')}</Text><Text style={styles.approved}>가입 승인 완료</Text></View>
      <View style={styles.intro}><Text accessibilityRole="header" style={styles.heading}>이용 기간을 정해 주세요</Text><Text style={styles.body}>시작일과 만료일을 포함한 기간으로 등록됩니다.</Text></View>
      <View style={styles.field}><Text style={styles.label}>이용 시작일</Text><AdminDateInput label="이용 시작일" value={startsOn} onChange={setStartsOn} disabled={busy} /></View>
      <View style={styles.field}><Text style={styles.label}>이용 만료일</Text><AdminDateInput label="이용 만료일" value={expiresOn} onChange={setExpiresOn} disabled={busy} /></View>
      <Text style={styles.caption}>숫자 8자리를 입력하면 날짜 형식으로 표시됩니다. 예: 20261201 → 2026-12-01</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.info}><Text style={styles.body}>기존 이용권과 기간이 겹치면 등록할 수 없어요.</Text><Text style={styles.caption}>저장한 이용권은 회원앱의 홈과 마이페이지에 반영됩니다.</Text></View>
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void save()} style={({ pressed }) => [styles.save, busy && styles.disabled, pressed && styles.pressed]}>{busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveText}>시설 이용권 등록</Text>}</Pressable>
    </View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 22, gap: 18, paddingBottom: 30 }, caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 21, color: colors.readableMuted }, body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 23, color: colors.readableMuted }, memberCard: { padding: 20, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 8 }, name: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30, color: colors.ink }, approved: { alignSelf: 'flex-start', backgroundColor: colors.congestion, color: colors.primary, fontFamily: fonts.medium, fontSize: 11, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' }, intro: { gap: 8, marginTop: 6 }, heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 31, color: colors.ink }, field: { gap: 9 }, label: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink }, info: { padding: 16, gap: 6, borderRadius: 16, backgroundColor: colors.canvas }, error: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 22, color: colors.primary },
  footer: { paddingTop: 14, paddingHorizontal: 20, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border }, save: { minHeight: 54, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: colors.primary }, saveText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onPrimary }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.7 }, empty: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 }, secondaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }, secondaryText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
});

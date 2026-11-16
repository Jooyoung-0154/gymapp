// [목적] 승인된 회원의 첫 닉네임 설정만 담당합니다. 운영자 기능은 관리자 경로에 분리했습니다.
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { authApi } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme/warmWellness';

export function AccountSetupScreen() {
  const { restore, logout } = useAuth();
  const [nickname, setNickname] = useState('');
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  function button(label: string, action: () => Promise<void>) {
    return <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(action)} style={{ backgroundColor: colors.primary, padding: 15, borderRadius: 12, opacity: busy ? 0.5 : 1 }}><Text style={{ color: colors.onPrimary }}>{label}</Text></Pressable>;
  }
  return <ScrollView contentContainerStyle={{ padding: 28, gap: 18, flexGrow: 1, backgroundColor: colors.background }}>
    <Text style={{ fontSize: 25, color: colors.ink }}>사용할 닉네임을 정해 주세요</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    <Text>승인이 완료되었습니다. 닉네임은 화면에 표시되는 이름이며 로그인에는 휴대전화번호를 사용합니다.</Text>
    <TextInput accessibilityLabel="닉네임" placeholder="닉네임 2~20자" value={nickname} onChangeText={setNickname} maxLength={20} editable={!busy} style={{ padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }} />
    {button('닉네임 저장하고 시작하기', async () => { await authApi.nickname(nickname.trim()); await restore(); })}
    {button('로그아웃', logout)}
  </ScrollView>;
}

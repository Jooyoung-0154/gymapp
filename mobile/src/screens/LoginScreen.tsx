// [목적] LoginScreen.tsx 파일: 전화번호와 비밀번호를 입력받아 인증 상태에 로그인 처리를 요청하고, 진행 상태와 실패 메시지를 표시합니다.
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../state/AuthContext';
import { colors, fonts } from '../theme/warmWellness';

export function LoginScreen() {
  const { login, error: connectionError, restore } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    if (!phone.trim() || !password) { setError('휴대전화번호와 비밀번호를 입력해 주세요.'); return; }
    pending.current = true; setBusy(true); setError('');
    try { await login(phone.trim(), password); }
    catch (e) { setError((e as Error).message); }
    finally { setPassword(''); pending.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>로그인</Text>
      <Text style={styles.caption}>헬스장에 등록된 회원 계정으로 로그인해 주세요.</Text>
      <View style={styles.form}>
        <Text style={styles.label}>휴대전화번호</Text>
        <TextInput accessibilityLabel="휴대전화번호" style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={40} editable={!busy} placeholder="01012345678" />
        <Text style={styles.label}>비밀번호</Text>
        <TextInput accessibilityLabel="비밀번호" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" maxLength={256} editable={!busy} onSubmitEditing={() => void submit()} />
        {!!(error || connectionError) && <Text accessibilityRole="alert" style={styles.error}>{error || connectionError}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void submit()} style={[styles.button, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>로그인</Text>}
        </Pressable>
        {!!connectionError && <Pressable accessibilityRole="button" onPress={() => void restore()}><Text style={styles.caption}>서버 연결 다시 확인</Text></Pressable>}
      </View>
      <Text style={styles.caption}>처음 이용하거나 비밀번호를 잊으셨다면 데스크에 문의해 주세요.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 20 },
  title: { fontFamily: fonts.bold, fontSize: 28, color: colors.ink },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 22, color: colors.readableMuted },
  form: { gap: 12 }, label: { fontFamily: fonts.medium, color: colors.ink },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, minHeight: 52, padding: 14, color: colors.ink, fontFamily: fonts.regular },
  button: { backgroundColor: colors.primary, borderRadius: 14, minHeight: 52, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  buttonText: { fontFamily: fonts.bold, color: colors.onPrimary, fontSize: 15 },
  error: { color: colors.primary, fontFamily: fonts.regular, lineHeight: 22 },
});

// [목적] LoginScreen.tsx 파일: 전화번호와 비밀번호를 입력받아 인증 상태에 로그인 처리를 요청하고, 진행 상태와 실패 메시지를 표시합니다.
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { authApi } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { colors, fonts } from '../theme/warmWellness';

export function LoginScreen() {
  const { login, error: connectionError, restore } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    if (!phone.trim() || !password) { setError('휴대전화번호와 비밀번호를 입력해 주세요.'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      if (registering) { await authApi.register(phone.trim(), password); setRegistering(false); setNotice('승인을 요청했습니다. 운영자 승인 후 로그인하면 닉네임을 설정할 수 있어요.'); }
      else await login(phone.trim(), password);
    }
    catch (e) { setError((e as Error).message); }
    finally { setPassword(''); pending.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{registering ? '회원 가입 · 승인 요청' : '로그인'}</Text>
      <Text style={styles.caption}>회원과 운영자가 함께 사용하는 로그인 화면입니다.</Text>
      <View style={styles.form}>
        <Text style={styles.label}>휴대전화번호</Text>
        <TextInput accessibilityLabel="휴대전화번호" style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={40} editable={!busy} placeholder="01012345678" />
        <Text style={styles.label}>{registering ? '비밀번호 (12~128자)' : '비밀번호'}</Text>
        <TextInput accessibilityLabel="비밀번호" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" maxLength={256} editable={!busy} onSubmitEditing={() => void submit()} />

        {!!notice && <Text style={styles.caption}>{notice}</Text>}
        {!!(error || connectionError) && <Text accessibilityRole="alert" style={styles.error}>{error || connectionError}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void submit()} style={[styles.button, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{registering ? '계정 생성 및 승인 요청' : '로그인'}</Text>}
        </Pressable>
        {!!connectionError && <Pressable accessibilityRole="button" onPress={() => void restore()}><Text style={styles.caption}>서버 연결 다시 확인</Text></Pressable>}
      </View>
      <Pressable disabled={busy} accessibilityRole="button" onPress={() => { setRegistering(!registering); setPassword(''); setError(''); setNotice(''); }}><Text style={styles.caption}>{registering ? '로그인으로 돌아가기' : '처음 이용하시나요? 회원 가입 및 승인 요청'}</Text></Pressable>
      <Text style={styles.caption}>로그인은 휴대전화번호를 사용합니다. 닉네임은 승인 후 설정합니다. 비밀번호를 잊으셨다면 데스크에 문의해 주세요.</Text>
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

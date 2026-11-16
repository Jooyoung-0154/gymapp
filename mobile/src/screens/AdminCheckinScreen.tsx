// [목적] 운영자 로그인 세션에 스캐너를 등록하고 QR 리더기 입력·입장 코드 붙여넣기로 입장을 확인합니다.
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { authApi } from '../api/client';
import { ApiError, makeCommandKey, type CheckinResult } from '../api/authApi';
import { adminOperationsStyles as ui } from '../components/adminOperationsStyles';
import { colors } from '../theme/warmWellness';
import { useAuth } from '../state/AuthContext';

export function AdminCheckinScreen() {
  const { expireSession } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const pending = useRef(false);
  const operation = useRef<{ token: string; key: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (deviceId) input.current?.focus(); }, [deviceId]);
  useEffect(() => { if (!result) return; const timer = setTimeout(() => setResult(null), 5000); return () => clearTimeout(timer); }, [result]);
  async function start() {
    if (pending.current) return; pending.current = true; setBusy(true); setError('');
    try { const device = await authApi.registerScanner(); if (mounted.current) setDeviceId(device.deviceId); }
    catch (e) { if (e instanceof ApiError && e.status === 401) expireSession(); if (mounted.current) setError((e as Error).message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function scan() {
    if (pending.current || !deviceId) return;
    const value = token.trim();
    if (!/^gymqr:[A-Za-z0-9_-]{43}$/.test(value)) { setError('QR 리더기로 입장 QR을 읽거나 올바른 입장 코드를 붙여 넣어 주세요.'); return; }
    if (!operation.current || operation.current.token !== value) operation.current = { token: value, key: makeCommandKey() };
    pending.current = true; setBusy(true); setError(''); setResult(null);
    try {
      const accepted = await authApi.checkin(deviceId, value, operation.current.key);
      if (!accepted.accepted) throw new Error('입장이 확인되지 않았습니다. 다시 확인해 주세요.');
      operation.current = null;
      if (mounted.current) { setResult(accepted); setToken(''); }
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status === 401) { expireSession(); return; }
      if (e instanceof ApiError && e.status !== 0) { operation.current = null; setToken(''); setError(e.message); }
      else setError('입장 결과를 확인하지 못했습니다. 같은 코드로 다시 확인을 누르면 중복 등록 없이 결과를 확인합니다.');
    } finally { pending.current = false; if (mounted.current) { setBusy(false); input.current?.focus(); } }
  }
  return <ScrollView style={ui.page} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={ui.title}>QR 입장 확인</Text>
    <Text style={ui.body}>연결된 QR 리더기로 회원의 입장 QR을 읽어 주세요. 리더기가 없으면 회원이 표시한 입장 코드를 복사해 붙여 넣을 수 있습니다.</Text>
    {!deviceId ? <View style={ui.card}><Text style={ui.label}>이 화면을 입장 스캐너로 사용합니다.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void start()} style={[ui.button, busy && ui.disabled]}><Text style={ui.buttonText}>{busy ? '등록 중…' : '스캐너 시작'}</Text></Pressable></View> : <View style={ui.card}>
      <Text style={ui.label}>스캐너 준비 완료</Text>
      <TextInput ref={input} accessibilityLabel="입장 QR 코드 입력" value={token} onChangeText={setToken} placeholder="QR 리더기로 스캔하거나 코드 붙여넣기" editable={!busy} autoCapitalize="none" autoCorrect={false} selectTextOnFocus onSubmitEditing={() => void scan()} style={ui.input} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void scan()} style={[ui.button, busy && ui.disabled]}>{busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={ui.buttonText}>입장 확인</Text>}</Pressable>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {result && <View style={ui.success}><Text accessibilityLiveRegion="polite" style={ui.successText}>{result.memberName || '회원'}님 · {result.duplicate ? '이미 입장 처리됐어요' : '입장 완료'}</Text><Text style={ui.body}>{result.attendanceDate} 출석 반영 · {result.admissionKind === 'PT_ONLY' ? 'PT 전용 입장' : '시설 이용권 입장'}</Text><Text style={ui.body}>확인 결과는 5초 후 사라집니다.</Text></View>}
    <Text style={ui.body}>만료·사용 완료·로그아웃한 QR, 정지 회원, 휴회 기간과 운영시간 밖의 입장은 허용되지 않습니다.</Text>
  </ScrollView>;
}

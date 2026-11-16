// [목적] 회원의 일회용 입장 QR을 표시합니다. 30초마다 갱신하고 앱이 배경으로 가거나 통신 상태를 확인하지 못하면 QR을 숨깁니다.
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigate } from '../navigation/router';
import { authApi } from '../api/client';
import { ApiError, type EntryQr } from '../api/authApi';
import { EntryQrImage } from '../components/EntryQrImage';
import { useAuth } from '../state/AuthContext';
import { colors, fonts } from '../theme/warmWellness';

export function EntryQrScreen() {
  const insets = useSafeAreaInsets();
  const navigate = useNavigate();
  const { expireSession } = useAuth();
  const [enabled, setEnabled] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [revision, setRevision] = useState(0);
  const [qr, setQr] = useState<EntryQr | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [used, setUsed] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setEnabled(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let alive = true; setQr(null); setShowCode(false);
    if (!enabled) return () => { alive = false; };
    setBusy(true); setError(''); setStatusError(''); setUsed(false);
    authApi.issueQr().then(result => {
      if (!alive) return;
      setQr(result); const received = Date.now(); setNow(received);
      setDeadline(received + Math.max(0, Date.parse(result.expiresAt) - Date.parse(result.serverTime)));
    }).catch(e => {
      if (!alive) return;
      if (e instanceof ApiError && e.status === 401) expireSession();
      setError((e as Error).message);
    }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [revision, enabled, expireSession]);
  useEffect(() => {
    if (!qr || !enabled || used) return;
    const refresh = setTimeout(() => setRevision(value => value + 1), qr.refreshAfterSeconds * 1000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(refresh); clearInterval(tick); };
  }, [qr, enabled, used]);
  useEffect(() => {
    if (!qr || !enabled || used) return;
    let alive = true; let pending = false;
    const poll = setInterval(async () => {
      if (pending) return; pending = true;
      try {
        const status = await authApi.qrStatus(qr.credentialId);
        if (!alive) return;
        if (status.used) { setUsed(true); setShowCode(false); }
        else if (status.expired || status.revoked) { setQr(null); setError('QR이 만료되었습니다. 새 QR을 발급해 주세요.'); }
        setStatusError('');
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) expireSession();
        setStatusError((e as Error).message);
      } finally { pending = false; }
    }, 2000);
    return () => { alive = false; clearInterval(poll); };
  }, [qr, enabled, used, expireSession]);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const visible = !!qr && enabled && !used && !error && !statusError && remaining > 0;
  return <View style={[styles.page, { paddingTop: insets.top }]}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="홈으로 돌아가기" onPress={() => navigate('/')} style={styles.back}><Text style={styles.backText}>‹ 홈</Text></Pressable><Text accessibilityRole="header" style={styles.title}>입장 QR</Text><View style={styles.spacer} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.description}>입구의 QR 리더기에 아래 코드를 보여 주세요.</Text>
      <View style={styles.qrCard}>
        {busy ? <ActivityIndicator color={colors.primary} accessibilityLabel="입장 QR 발급 중" /> : used ? <><Text style={styles.success}>입장이 확인됐어요</Text><Text style={styles.description}>출석 기록에 반영되었습니다.</Text></> : visible ? <EntryQrImage token={qr!.token} /> : <Text style={styles.description}>{!enabled ? '앱으로 돌아오면 새 QR을 발급합니다.' : error || statusError || 'QR을 새로 발급해 주세요.'}</Text>}
      </View>
      {visible && <Text style={styles.timer}>유효시간 {remaining}초 · 30초마다 자동 갱신</Text>}
      {!!(error || statusError) && <Text accessibilityRole="alert" style={styles.error}>{error || statusError}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !enabled} onPress={() => used ? navigate('/') : setRevision(value => value + 1)} style={({ pressed }) => [styles.button, pressed && styles.pressed, (busy || !enabled) && styles.disabled]}><Text style={styles.buttonText}>{used ? '홈으로 돌아가기' : busy ? 'QR 발급 중…' : '새 QR 발급'}</Text></Pressable>
      <Text style={styles.caption}>(입장 QR은 60초간 유효하며 한 번 사용하면 다시 사용할 수 없습니다.)</Text>
      {visible && <Pressable accessibilityRole="button" onPress={() => setShowCode(value => !value)} style={styles.codeToggle}><Text style={styles.codeToggleText}>{showCode ? '입장 코드 숨기기' : '스캔이 어려울 때 입장 코드 보기'}</Text></Pressable>}
      {visible && showCode && <View style={styles.code}><Text selectable style={styles.codeText}>{qr!.token}</Text><Text style={styles.caption}>코드를 복사해 운영자에게 보여 주세요. QR과 유효시간이 같습니다.</Text></View>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border }, back: { minWidth: 60, minHeight: 48, justifyContent: 'center' }, backText: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink }, title: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink }, spacer: { width: 60 }, content: { padding: 24, gap: 20, alignItems: 'center' }, description: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 24, color: colors.readableMuted, textAlign: 'center' }, qrCard: { minHeight: 300, alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 20, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 12 }, timer: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary }, success: { fontFamily: fonts.bold, fontSize: 22, color: colors.primary }, error: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 22, color: colors.primary, textAlign: 'center' }, button: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary }, buttonText: { color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 14 }, caption: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 20, color: colors.readableMuted, textAlign: 'center' }, pressed: { opacity: 0.7 }, disabled: { opacity: 0.5 }, codeToggle: { minHeight: 44, justifyContent: 'center' }, codeToggleText: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary }, code: { padding: 16, gap: 10, borderRadius: 12, backgroundColor: colors.card, alignSelf: 'stretch' }, codeText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.ink },
});

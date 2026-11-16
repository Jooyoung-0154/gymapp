// [목적] 입장 판정에 필요한 요일별 운영시간과 혼잡도 인원 기준을 설정합니다. 임의의 영업시간·인원을 기본값으로 저장하지 않습니다.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { authApi } from '../api/client';
import type { FacilitySettings, OpeningHours } from '../api/authApi';
import { ApiError } from '../api/authApi';
import { useAuth } from '../state/AuthContext';
import { adminOperationsStyles as ui } from '../components/adminOperationsStyles';
import { colors } from '../theme/warmWellness';
const days = ['월요일','화요일','수요일','목요일','금요일','토요일','일요일'];
function completeHours(hours: OpeningHours[]): OpeningHours[] {
  return days.map((_, index) => hours.find(item => item.weekday === index + 1) ?? { weekday: index + 1, closed: false, opensAt: '', closesAt: '', overnight: false });
}
export function AdminFacilitySettingsScreen() {
  const { expireSession } = useAuth();
  const [name, setName] = useState('');
  const [normal, setNormal] = useState('');
  const [crowded, setCrowded] = useState('');
  const [hours, setHours] = useState(completeHours([]));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  function apply(settings: FacilitySettings) { setName(settings.name); setNormal(settings.normalFrom?.toString() ?? ''); setCrowded(settings.crowdedFrom?.toString() ?? ''); setHours(completeHours(settings.hours)); }
  async function load() {
    if (pending.current) return; pending.current = true; setLoading(true); setError('');
    try { const settings = await authApi.facilitySettings(); if (mounted.current) apply(settings); }
    catch (e) { if (e instanceof ApiError && e.status === 401) expireSession(); if (mounted.current) setError((e as Error).message); }
    finally { pending.current = false; if (mounted.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, []);
  function update(day: number, value: Partial<OpeningHours>) { setHours(current => current.map(item => item.weekday === day ? { ...item, ...value } : item)); }
  async function save() {
    if (pending.current) return;
    const normalFrom = Number(normal), crowdedFrom = Number(crowded);
    if (!name.trim() || !Number.isInteger(normalFrom) || !Number.isInteger(crowdedFrom) || normalFrom <= 0 || crowdedFrom <= normalFrom) { setError('시설 이름과 양의 정수 인원을 입력해 주세요. 혼잡 인원은 보통 인원보다 커야 합니다.'); return; }
    if (hours.some(day => !day.closed && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(day.opensAt) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.closesAt)))) { setError('요일마다 HH:MM 형식의 영업시간을 입력하거나 휴무를 선택해 주세요.'); return; }
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { const saved = await authApi.saveFacilitySettings({ name: name.trim(), normalFrom, crowdedFrom, hours }); if (mounted.current) { apply(saved); setNotice('운영 설정을 저장했습니다. 오늘부터 입장 판정과 혼잡도 표시에 적용됩니다.'); } }
    catch (e) { if (e instanceof ApiError && e.status === 401) expireSession(); if (mounted.current) setError((e as Error).message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <ScrollView style={ui.page} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={ui.title}>운영 설정</Text><Text style={ui.body}>한국시간 기준 운영시간을 설정하세요. 운영시간이 없으면 QR 입장이 차단되며, 인원 기준이 없으면 혼잡도는 ‘기준 미설정’으로 표시됩니다.</Text>
    {loading ? <ActivityIndicator color={colors.primary} /> : <>
      <View style={ui.card}>
        <Text style={ui.label}>시설 이름</Text><TextInput accessibilityLabel="시설 이름" value={name} onChangeText={setName} maxLength={80} editable={!busy} style={ui.input} />
        <View style={ui.row}><View style={ui.field}><Text style={ui.label}>보통 시작 인원</Text><TextInput accessibilityLabel="보통 시작 인원" value={normal} onChangeText={setNormal} keyboardType="number-pad" maxLength={6} editable={!busy} style={ui.input} /></View><View style={ui.field}><Text style={ui.label}>혼잡 시작 인원</Text><TextInput accessibilityLabel="혼잡 시작 인원" value={crowded} onChangeText={setCrowded} keyboardType="number-pad" maxLength={6} editable={!busy} style={ui.input} /></View></View>
        <Text style={ui.body}>보통 기준 미만은 여유, 보통 기준 이상은 보통, 혼잡 기준 이상은 혼잡으로 표시됩니다.</Text>
      </View>
      {hours.map(day => <View key={day.weekday} style={ui.card}>
        <View style={ui.row}><Text style={ui.label}>{days[day.weekday - 1]}</Text><View style={ui.row}><Text style={ui.label}>휴무</Text><Switch accessibilityLabel={`${days[day.weekday - 1]} 휴무`} value={day.closed} disabled={busy} onValueChange={closed => update(day.weekday, { closed })} /></View></View>
        {!day.closed && <><View style={ui.row}><View style={ui.field}><Text style={ui.label}>시작 시각</Text><TextInput accessibilityLabel={`${days[day.weekday - 1]} 영업 시작`} placeholder="HH:MM" value={day.opensAt} onChangeText={opensAt => update(day.weekday, { opensAt })} maxLength={5} editable={!busy} style={ui.input} /></View><View style={ui.field}><Text style={ui.label}>종료 시각</Text><TextInput accessibilityLabel={`${days[day.weekday - 1]} 영업 종료`} placeholder="HH:MM" value={day.closesAt} onChangeText={closesAt => update(day.weekday, { closesAt })} maxLength={5} editable={!busy} style={ui.input} /></View></View><View style={ui.row}><Text style={ui.label}>다음 날 종료</Text><Switch accessibilityLabel={`${days[day.weekday - 1]} 다음 날 종료`} value={day.overnight} disabled={busy} onValueChange={overnight => update(day.weekday, { overnight })} /></View></>}
      </View>)}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[ui.button, busy && ui.disabled]}><Text style={ui.buttonText}>{busy ? '저장 중…' : '운영 설정 저장'}</Text></Pressable>
    </>}
    {!!error && <><Text accessibilityRole="alert" style={ui.error}>{error}</Text><Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void load()} style={ui.button}><Text style={ui.buttonText}>설정 다시 불러오기</Text></Pressable></>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={ui.body}>{notice}</Text>}
  </ScrollView>;
}

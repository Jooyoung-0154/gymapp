// [목적] 홈이 보일 때 실제 2시간 입장 인원을 1분마다 갱신합니다. 조회 실패·기준 미설정·정보 지연을 여유로 표시하지 않습니다.
import { useEffect, useState } from 'react';
import { authApi } from '../api/client';
import type { Occupancy } from '../api/authApi';
export function useOccupancy(active: boolean) {
  const [data, setData] = useState<Occupancy | null>(null);
  const [error, setError] = useState('');
  const [receivedAt, setReceivedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    let alive = true; let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try { const result = await authApi.occupancy(); if (alive) { setData(result); setReceivedAt(Date.now()); setError(''); } }
      catch (e) { if (alive) setError((e as Error).message); }
      finally { pending = false; if (alive) setNow(Date.now()); }
    }
    void refresh();
    const poll = setInterval(() => void refresh(), 60000);
    const tick = setInterval(() => setNow(Date.now()), 10000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [active]);
  const stale = !!receivedAt && now - receivedAt >= 180000;
  const label = stale ? '정보 지연' : error ? '조회 실패' : !data ? '조회 중' : { QUIET: '여유', NORMAL: '보통', CROWDED: '혼잡', UNCONFIGURED: '기준 미설정' }[data.level];
  return { people: data?.people ?? '—', label, caption: stale || error ? data ? '연결을 확인해 주세요. 마지막 조회 인원입니다.' : '현재 입장 인원을 확인하지 못했습니다.' : data ? `2시간 내 입장 인원 · ${new Date(data.serverTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })} 갱신` : '현재 입장 인원을 확인하고 있어요.' };
}

// [목적] 본인의 시설 이용권을 조회하고 탭 진입 시 최신 정보를 가져옵니다.
import { useEffect, useState } from 'react';
import { authApi } from '../api/client';
import type { Membership } from '../api/authApi';
export function useMembership(active: boolean) {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setMembership(null); setError('');
    authApi.membership().then(value => { if (!cancelled) setMembership(value); }).catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [active]);
  return {
    expiresOn: membership?.expiresOn ?? (error ? '조회 실패' : membership ? '미등록' : '조회 중'),
    startsOn: membership?.startsOn ?? '미등록',
    remainingDays: membership?.remainingDays ?? 0,
    label: error || (membership ? !membership.registered ? '등록된 이용권이 없습니다.' : membership.status === 'SCHEDULED' ? '이용 예정' : membership.status === 'EXPIRED' ? '기간 만료' : '이용 중' : '이용권 조회 중'),
  };
}

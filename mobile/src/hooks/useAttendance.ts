// [목적] useAttendance는 월별 출석 조회의 로딩·실패·재시도를 관리합니다.
import { useEffect, useState } from 'react';
import { authApi } from '../api/client';
import { ApiError, type AttendanceMonth } from '../api/authApi';
import { useAuth } from '../state/AuthContext';

export function useAttendance(month: string) {
  const { expireSession } = useAuth();
  const [result, setResult] = useState<AttendanceMonth | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setResult(null);
    authApi.attendance(month).then(data => {
      if (active) setResult(data);
    }).catch(e => {
      if (!active) return;
      if (e instanceof ApiError && e.status === 401) expireSession();
      else setError(e instanceof Error ? e.message : '출석 정보를 불러오지 못했어요.');
    }).finally(() => { if (active) setLoading(false); });
    // [목적] 월을 빨리 바꾸거나 로그아웃하면 이전 응답이 새 달·다른 회원 화면에 반영되지 않게 합니다.
    return () => { active = false; };
  }, [month, revision, expireSession]);
  return { data: result?.month === month ? result : null, error, loading, retry: () => setRevision(value => value + 1) };
}

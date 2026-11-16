// [목적] 관리자 기능별 페이지가 회원 목록과 작업 결과를 공유합니다. 운영자 경로 내부에서만 사용합니다.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { authApi } from '../api/client';
import { ApiError, type MemberSummary } from '../api/authApi';
import { useAuth } from './AuthContext';

type AdminData = {
  members: MemberSummary[]; busy: boolean; loading: boolean; error: string; notice: string;
  refresh: () => Promise<void>; approve: (member: MemberSummary) => Promise<boolean>;
  registerMembership: (member: MemberSummary, startsOn: string, expiresOn: string) => Promise<boolean>;
};
const AdminContext = createContext<AdminData | null>(null);
export function AdminProvider({ children }: { children: ReactNode }) {
  const { expireSession } = useAuth();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); return true; }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) expireSession();
      if (mounted.current) setError((e as Error).message);
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) { setBusy(false); setLoading(false); }
    }
  }
  async function refresh() {
    await run(async () => { const result = await authApi.members(); if (mounted.current) setMembers(result.items); });
  }
  useEffect(() => {
    mounted.current = true; void refresh();
    return () => { mounted.current = false; };
  }, []);
  async function approve(member: MemberSummary) {
    return run(async () => {
      await authApi.approve(member);
      // [목적] 승인 결과를 목록에 즉시 반영해 승인 대기에서 제외하고 이용권 등록 대상으로 옮깁니다.
      if (mounted.current) {
        setMembers(current => current.map(item => item.accountId === member.accountId ? { ...item, status: 'ACTIVE', accountStatus: 'ACTIVE', version: item.version + 1 } : item));
        setNotice('회원을 승인했습니다. 회원이 로그인하면 닉네임을 설정할 수 있습니다.');
      }
    });
  }
  async function registerMembership(member: MemberSummary, startsOn: string, expiresOn: string) {
    return run(async () => {
      await authApi.registerMembership(member.accountId, startsOn, expiresOn);
      if (mounted.current) setNotice(`${member.name || member.phone}님의 시설 이용권을 등록했습니다. 회원 홈과 마이페이지에 반영됩니다.`);
    });
  }
  return <AdminContext.Provider value={{ members, busy, loading, error, notice, refresh, approve, registerMembership }}>{children}</AdminContext.Provider>;
}
export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error('관리자 경로 안에서 사용해야 합니다.');
  return context;
}

// [목적] 운영자 권한이 없으면 관리자 컴포넌트를 마운트하지 않고 회원앱으로 이동시킵니다.
import type { ReactNode } from 'react';
export function OperatorGate({ account, children, fallback = null }: { account: { roles: string[] } | null; children: ReactNode; fallback?: ReactNode }) {
  return account?.roles.includes('OPERATOR') ? children : fallback;
}

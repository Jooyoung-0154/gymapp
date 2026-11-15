// [목적] AuthContext.tsx 파일: 앱 전체에서 로그인 계정과 세션 확인 상태를 공유합니다. 실제 서버 API를 호출하며, 로그인 여부는 회원 화면 진입 기준으로 사용됩니다.
import { useCallback, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, type Account } from '../api/authApi';
import { authApi } from '../api/client';

// [정의] AuthState는 인증 제공자가 화면에 공유하는 상태와 함수의 타입입니다.
// [구성] account는 Account 또는 null, checking은 세션 확인 중 여부, error는 오류 안내 문자열입니다.
// [목적] restore는 세션 복원, login은 전화번호·비밀번호 로그인, logout은 세션 종료를 요청하며 Promise<void>를 반환합니다.
type AuthState = {
  account: Account | null; checking: boolean; error: string; expireSession: () => void;
  restore: () => Promise<void>; login: (phone: string, password: string) => Promise<void>; logout: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
// [기능] AuthProvider 함수: 계정·조회 중 여부·오류 상태와 인증 함수를 하위 화면에 제공합니다.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  // [구성] generation 변수: 요청 순번을 ref에 보관합니다. 복원 요청 도중 로그아웃되면 늦게 도착한 응답이 계정을 되살리지 못하게 합니다.
  const generation = useRef(0);
  // [기능] expireSession은 API가 401을 반환할 때 기기의 회원 상태와 화면을 정리합니다.
  const expireSession = useCallback(() => {
    ++generation.current; setAccount(null); setError('로그인이 만료됐어요. 다시 로그인해 주세요.');
  }, []);
  // [기능] restore 함수: 기존 쿠키로 내 정보를 조회합니다. 요청 순번이 오래된 응답은 무시하고 401은 로그아웃 상태로 처리합니다.
  async function restore() {
    const current = ++generation.current;
    setChecking(true); setError('');
    try {
      const me = await authApi.me();
      if (!me.roles.includes('MEMBER')) throw new Error('등록된 회원 계정으로 로그인해 주세요.');
      if (current === generation.current) setAccount(me);
    } catch (e) {
      if (current !== generation.current) return;
      setAccount(null);
      if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message);
    } finally { if (current === generation.current) setChecking(false); }
  }
  // [기능] login 함수: 로그인을 요청합니다. 회원 앱은 추가 인증이 필요한 운영자와 MEMBER 역할이 없는 계정을 허용하지 않습니다.
  async function login(phone: string, password: string) {
    ++generation.current;
    const result = await authApi.login(phone, password);
    if (result.mfaRequired) throw new Error('운영자 계정은 서버의 운영자 화면에서 추가 인증해 주세요.');
    const me = await authApi.me();
    if (!me.roles.includes('MEMBER')) {
      await authApi.logout();
      throw new Error('등록된 회원 계정으로 로그인해 주세요.');
    }
    setAccount(me); setError('');
  }
  // [기능] logout 함수: 서버 세션을 종료합니다. 이미 만료된 세션의 401도 로그아웃 완료로 처리합니다.
  async function logout() {
    ++generation.current;
    try { await authApi.logout(); }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) throw e; }
    setAccount(null); setError('');
  }
  // [목적] useEffect 콜백 처리: 처음 표시될 때 세션을 복원하고 제공자가 해제되면 진행 중인 복원 응답을 무효화합니다.
  useEffect(() => { void restore(); return () => { ++generation.current; }; }, []);
  return <AuthContext.Provider value={{ account, checking, error, restore, login, logout, expireSession }}>{children}</AuthContext.Provider>;
}
// [기능] useAuth 함수: 공유 인증 상태를 읽습니다. 제공자 바깥에서 호출하면 구성 오류를 알립니다.
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}



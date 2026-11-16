// [목적] 네이티브 앱에서는 DOM에 의존하지 않는 메모리 경로를 사용합니다.
import { useEffect, type ReactNode } from 'react';
import { BackHandler } from 'react-native';
import { MemoryRouter, useLocation, useNavigate } from './router';
import { adminBackTarget } from '../utils/adminNavigation';
export function AppRouter({ children }: { children: ReactNode }) {
  return <MemoryRouter><NativeBackNavigation />{children}</MemoryRouter>;
}
function NativeBackNavigation() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pathname === '/entry-qr') { navigate('/'); return true; }
      if (!pathname.startsWith('/admin')) return false;
      navigate(adminBackTarget(pathname, search)); return true;
    });
    return () => listener.remove();
  }, [pathname, search, navigate]);
  return null;
}

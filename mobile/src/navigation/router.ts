// [목적] 네이티브에서는 브라우저 코드 없이 동일한 경로 구성을 사용합니다. 경로가 바뀌면 해당 화면만 마운트합니다.
import { Children, createContext, createElement, isValidElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Location = { pathname: string; search: string };
type NavigateOptions = { replace?: boolean };
type Navigation = { location: Location; navigate: (to: string | number, options?: NavigateOptions) => void };
const NavigationContext = createContext<Navigation | null>(null);
const OutletContext = createContext<ReactNode>(null);
function splitLocation(path: string): Location {
  const [pathname, ...query] = path.split('?');
  return { pathname: pathname || '/', search: query.length ? '?' + query.join('?') : '' };
}
export function MemoryRouter({ children, initialEntries = ['/'] }: { children: ReactNode; initialEntries?: string[] }) {
  const [history, setHistory] = useState({ entries: initialEntries, index: initialEntries.length - 1 });
  const navigate = useCallback((to: string | number, options?: NavigateOptions) => {
    setHistory(current => {
      if (typeof to === 'number') return { ...current, index: Math.max(0, Math.min(current.entries.length - 1, current.index + to)) };
      const previous = splitLocation(current.entries[current.index]);
      const next = to.startsWith('/') ? to : to.startsWith('?') ? previous.pathname + to : previous.pathname.replace(/\/$/, '') + '/' + to;
      if (next === current.entries[current.index]) return current;
      const entries = current.entries.slice(0, current.index + 1);
      if (options?.replace) entries[current.index] = next;
      else entries.push(next);
      return { entries, index: entries.length - 1 };
    });
  }, []);
  const value = useMemo(() => ({ location: splitLocation(history.entries[history.index]), navigate }), [history, navigate]);
  return createElement(NavigationContext.Provider, { value }, children);
}
function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('앱 라우터 안에서 사용해야 합니다.');
  return value;
}
export function useLocation() { return useNavigation().location; }
export function useNavigate() { return useNavigation().navigate; }
export function useSearchParams(): [URLSearchParams, (values: Record<string, string>, options?: NavigateOptions) => void] {
  const { location, navigate } = useNavigation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  return [params, (values, options) => { const query = new URLSearchParams(values).toString(); navigate(location.pathname + (query ? '?' + query : ''), options); }];
}
type RouteProps = { path?: string; index?: boolean; element?: ReactNode; children?: ReactNode };
export function Route(_props: RouteProps) { return null; }
// [기능] 중첩된 경로를 순서대로 일치시키고 부모 레이아웃의 Outlet에 자식 화면을 전달합니다.
function match(children: ReactNode, segments: string[]): { found: boolean; node: ReactNode } {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<RouteProps>(child) || child.type !== Route) continue;
    const props = child.props;
    if (props.index && segments.length !== 0) continue;
    const route = (props.path ?? '').split('/').filter(Boolean);
    const wildcard = props.path === '*';
    if (!wildcard && route.some((part, index) => part !== segments[index])) continue;
    const remaining = wildcard ? [] : segments.slice(route.length);
    const nested = match(props.children, remaining);
    if (remaining.length && !nested.found) continue;
    return { found: true, node: createElement(OutletContext.Provider, { value: nested.node }, props.element ?? nested.node) };
  }
  return { found: false, node: null };
}
export function Routes({ children }: { children: ReactNode }) {
  return match(children, useLocation().pathname.split('/').filter(Boolean)).node;
}
export function Outlet() { return useContext(OutletContext); }
export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace }); }, [navigate, to, replace]);
  return null;
}

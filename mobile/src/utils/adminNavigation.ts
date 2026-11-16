// [정의] 관리자 상단 메뉴와 경로를 함께 관리합니다. 새 기능은 여기에 메뉴를 추가합니다.
import type { MemberSummary } from '../api/authApi';
export const adminSections = [
  { key: 'members', segment: 'members', path: '/admin/members', label: '회원 관리', description: '회원 목록과 가입 상태를 확인하세요.' },
  { key: 'approvals', segment: 'approvals', path: '/admin/approvals', label: '가입 승인', description: '가입을 요청한 회원의 휴대전화번호를 확인하고 승인하세요.' },
  { key: 'memberships', segment: 'memberships', path: '/admin/memberships', label: '시설 이용권', description: '승인된 회원에게 시설 이용 기간을 등록하세요.' },
  { key: 'checkin', segment: 'checkin', path: '/admin/checkin', label: '입장 확인', description: '회원 QR을 읽고 입장을 확인하세요.' },
  { key: 'settings', segment: 'settings', path: '/admin/settings', label: '운영 설정', description: '운영시간과 혼잡도 인원을 설정하세요.' },
] as const;
export type AdminSection = typeof adminSections[number]['key'];
export type AdminMemberSection = 'members' | 'approvals' | 'memberships';
// [기능] 앱의 이용권 입력 화면에서 뒤로가면 회원 목록으로, 관리자 목록에서 뒤로가면 회원앱으로 이동합니다.
export function adminBackTarget(pathname: string, search: string) {
  return pathname.replace(/\/$/, '') === '/admin/memberships' && new URLSearchParams(search).has('member') ? '/admin/memberships' : '/';
}
// [기능] 앱의 숫자 키보드 입력과 붙여넣은 날짜를 YYYY-MM-DD 형식으로 정리합니다.
export function formatAdminDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 6) return digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6);
  if (digits.length > 4) return digits.slice(0, 4) + '-' + digits.slice(4);
  return digits;
}
// [기능] 메뉴별 대상과 검색어를 적용합니다. 전화번호는 하이픈·공백 없이도 검색할 수 있습니다.
export function selectAdminMembers(members: MemberSummary[], section: AdminMemberSection, query: string) {
  const text = query.trim().toLowerCase();
  const phone = text.replace(/[\s-]/g, '');
  return members.filter(member => {
    if (section === 'approvals' && (member.status !== 'PENDING' || member.accountStatus !== 'PENDING')) return false;
    if (section === 'memberships' && (member.status !== 'ACTIVE' || member.accountStatus !== 'ACTIVE')) return false;
    return !text || member.name.toLowerCase().includes(text) || (!!phone && member.phone.includes(phone));
  });
}
// [기능] 실재하는 날짜인지 검사합니다. 최종 유효성·기간 중복 검사는 서버가 수행합니다.
export function membershipDateError(startsOn: string, expiresOn: string): string {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2100-12-31';
  };
  if (!validDate(startsOn) || !validDate(expiresOn)) return '시작일과 만료일을 YYYY-MM-DD 형식의 올바른 날짜로 입력해 주세요.';
  return expiresOn < startsOn ? '만료일은 시작일과 같거나 이후여야 합니다.' : '';
}

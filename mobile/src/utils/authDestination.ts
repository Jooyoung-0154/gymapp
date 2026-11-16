// [기능] accountDestination은 공통 앱에서 계정 권한과 닉네임 설정 여부에 맞는 화면을 결정합니다.
import type { Account } from '../api/authApi';
export function accountDestination(account: Account | null): 'login' | 'operator' | 'nickname' | 'member' {
  if (!account) return 'login';
  if (account.roles.includes('OPERATOR')) return 'operator';
  if (!account.roles.includes('MEMBER')) return 'login';
  return account.nicknameRequired ? 'nickname' : 'member';
}

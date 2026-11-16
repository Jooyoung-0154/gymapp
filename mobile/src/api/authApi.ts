// [정의] AttendanceMonth는 서버가 조회한 본인의 월별 출석 결과입니다.
// [구성] attendanceDates는 유효 방문을 날짜별로 합친 목록, today는 한국 기준 서버 날짜입니다.
export type AttendanceMonth = {
  memberId: string; month: string; attendanceDates: string[];
  attendanceCount: number; today: string; earliestMonth: string;
};
// [목적] authApi.ts 파일: 로그인·내 정보·로그아웃 요청을 담당합니다. 쿠키 기반 인증과 CSRF 토큰을 사용하며 비밀번호를 JS 저장소에 보관하지 않습니다.
// [정의] Account는 서버에서 받은 사용자 계정 정보의 구조를 정의하는 객체 타입입니다.
// [구성] accountId는 계정 ID, name은 표시 이름, phone은 전화번호, roles는 권한 문자열 배열, status는 계정 상태 문자열입니다.
// [목적] Account 타입은 /me 응답과 앱의 로그인 계정 상태에 사용됩니다.
export type Account = {
  // [정의] Account.accountId는 서버가 부여한 계정 식별자이며 문자열로 전달됩니다.
  accountId: string;
  // [정의] Account.name은 화면에서 사용자에게 표시하는 계정 이름입니다.
  name: string;
  nicknameRequired?: boolean;
  // [정의] Account.phone은 서버에서 받은 사용자의 전화번호입니다. 화면의 마스킹 처리는 별도로 수행합니다.
  phone: string;
  // [구성] Account.roles는 MEMBER·OPERATOR 등 계정에 부여된 권한 이름의 배열입니다.
  roles: string[];
  // [정의] Account.status는 ACTIVE 등 서버에서 받은 계정 상태입니다. 현재 타입은 문자열 전체를 허용합니다.
  status: string
};
// [정의] ApiError는 HTTP 상태 코드와 오류 식별자를 담는 API 요청 실패 클래스입니다. export는 다른 파일에서 ApiError를 가져올 수 있게 합니다.
// [정의] ApiError는 Error를 상속합니다. ApiError.message는 안내 문구, ApiError.stack은 호출 경로이며 instanceof ApiError는 오류 종류를 검사합니다.
// [목적] AuthContext는 ApiError.status가 401인지 확인해 만료된 세션을 처리하고, 화면은 ApiError.message를 표시합니다.
export class ApiError extends Error {
  // [정의] ApiError.status는 HTTP 응답 상태 코드를 저장하는 숫자 필드입니다. 401은 인증 실패, 403은 접근 거부입니다.
  // [해설] ApiError.status가 0이면 클라이언트가 요청 또는 응답 처리를 완료하지 못한 연결 오류를 의미합니다.
  status: number;
  // [정의] ApiError.code는 오류 종류를 구분하는 문자열 필드입니다.
  // [구성] ApiError.code는 서버 오류 코드나 클라이언트의 HTTP_ERROR·CONNECTION_FAILED 값을 저장합니다.
  code: string;
  // [처리 흐름] ApiError.constructor 생성자: new ApiError(status, code, message)로 객체를 생성할 때 실행되는 생성자입니다.
  // [처리 흐름] ApiError 생성자의 매개변수: status·code는 이 오류 객체의 필드에 저장하고, 사용자 안내 문구 message는 부모 Error에 전달합니다.
  constructor(status: number, code: string, message: string) {
    // [처리 흐름] ApiError 생성자의 super(message) 호출: super(message)는 부모 생성자를 호출해 Error.message를 설정합니다.
    // [처리 흐름] ApiError 생성자의 this 참조: this는 지금 생성하는 오류 객체이며, 전달받은 상태 코드와 오류 코드를 각 필드에 보관합니다.
    super(message); this.status = status; this.code = code;
  }
}

/** Cookies stay in the platform cookie store; passwords/tokens are never saved in JS storage. */
// [기능] createAuthApi 함수: 서버 주소와 전송 함수를 받아 인증 요청 객체를 만듭니다. 전송 함수를 바꿔 테스트할 수 있습니다.
export function createAuthApi(baseUrl: string, transport: typeof fetch = fetch) {
  async function request<T>(path: string, body?: object, commandKey?: string): Promise<T> {
    const controller = new AbortController();
    // [구성] timer 변수: 15초 후 이 요청을 중단합니다. 성공·실패와 관계없이 finally에서 타이머를 정리합니다.
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) {
        // Fetch a fresh token before each command, including logout.
        const csrf = await request<{ token: string; headerName: string }>('/auth/csrf');
        headers[csrf.headerName] = csrf.token;
        headers['Content-Type'] = 'application/json';
        // [처리 흐름] request 함수의 headers['Idempotency-Key']: 변경 요청 식별자를 만들어 서버의 중복 처리 검사에 전달합니다. 이 코드는 자동 재시도를 수행하지 않습니다.
        headers['Idempotency-Key'] = commandKey ?? makeCommandKey();
      }
      const response = await transport(baseUrl.replace(/\/$/, '') + '/api/v1' + path, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'include',
        headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new ApiError(response.status, payload.error?.code ?? 'HTTP_ERROR', payload.error?.message ?? '요청을 처리하지 못했어요.');
      if (!payload.data) throw new Error('Invalid API response');
      return payload.data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'CONNECTION_FAILED', '서버에 연결하지 못했어요. 네트워크와 서버 주소를 확인해 주세요.');
    } finally { clearTimeout(timer); }
  }
  return {
    me: () => request<Account>('/me'),
    attendance: (month: string) => request<AttendanceMonth>('/me/attendance?month=' + encodeURIComponent(month)),
    login: (phone: string, password: string) => request<{ mfaRequired?: boolean; challengeId?: string; approvalPending?: boolean }>('/auth/login', { phone, password }),
    register: (phone: string, password: string) => request('/auth/register', { phone, password }),
    verifyMfa: (challengeId: string, totp: string) => request('/auth/mfa/verify', { challengeId, totp }),
    nickname: (nickname: string) => request<Account>('/me/nickname', { nickname }),
    members: () => request<{ items: MemberSummary[] }>('/admin/members'),
    membership: () => request<Membership>('/me/membership'),
    issueQr: () => request<EntryQr>('/me/qr', {}),
    qrStatus: (credentialId: string) => request<{ used: boolean; expired: boolean; revoked: boolean }>('/me/qr/' + encodeURIComponent(credentialId)),
    occupancy: () => request<Occupancy>('/occupancy'),
    registerScanner: () => request<{ deviceId: string }>('/admin/checkin-devices', {}),
    checkin: (deviceId: string, qrToken: string, key: string) => request<CheckinResult>('/admin/checkins', { deviceId, qrToken }, key),
    facilitySettings: () => request<FacilitySettings>('/admin/facility-settings'),
    saveFacilitySettings: (settings: FacilitySettings) => request<FacilitySettings>('/admin/facility-settings', settings),
    registerMembership: (accountId: string, startsOn: string, expiresOn: string) => request('/admin/accounts/' + accountId + '/membership', { startsOn, expiresOn }),
    approve: (member: MemberSummary) => request('/admin/accounts/' + member.accountId + '/status', { status: 'ACTIVE', expectedVersion: member.version }),
    logout: () => request('/auth/logout', {}),
  };
}



export type MemberSummary = { accountId: string; name: string; phone: string; status: string; accountStatus: string; version: number };
// [정의] Membership은 본인의 시설 이용권입니다. 미등록 상태에는 날짜가 없습니다.
export type Membership = { registered: boolean; startsOn?: string; expiresOn?: string; remainingDays?: number; status?: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' };
// [정의] QR 토큰은 회원 화면의 메모리에만 보관하며 로그·URL·기기 저장소에 저장하지 않습니다.
export type EntryQr = { credentialId: string; token: string; serverTime: string; expiresAt: string; refreshAfterSeconds: number };
export type Occupancy = { people: number; level: 'QUIET' | 'NORMAL' | 'CROWDED' | 'UNCONFIGURED'; serverTime: string; refreshSeconds: number; staleSeconds: number };
export type CheckinResult = { accepted: boolean; duplicate: boolean; memberName: string; attendanceDate: string; checkedInAt: string; visitId: string; admissionKind: string };
export type OpeningHours = { weekday: number; closed: boolean; opensAt: string; closesAt: string; overnight: boolean };
export type FacilitySettings = { name: string; normalFrom: number | null; crowdedFrom: number | null; hours: OpeningHours[] };
// [기능] 변경 요청 식별자는 통신 오류 후 같은 요청을 재전송할 때 재사용할 수 있습니다.
export function makeCommandKey() { return 'mobile-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2); }

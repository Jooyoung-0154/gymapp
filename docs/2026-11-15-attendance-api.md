# 출석 조회 연동 — 2026-11-15

## 구현한 범위
앱 출석 달력에서 고정 예시 데이터를 제거했다.
GET /api/v1/me/attendance?month=YYYY-MM API가 로그인한 회원의 유효 방문 날짜와 월 고유 출석일 수를 읽는다.
회원 ID를 요청으로 받지 않고, 인증 세션의 accountId에서 ACTIVE 회원을 조회한다.
원본 방문의 생성·정정·QR 입장·연속 출석 판정·보상 지급은 이번 범위가 아니다.
홈 출석 요약·이용권·예약은 여전히 예시다. 출석 화면의 연속 출석·보상은 집계 준비 중으로 표시한다.

## 코드별 설명
| 파일 | 정의·기능·목적 |
|---|---|
| server/src/main/java/kr/gym/AttendanceService.java | 본인 회원 조회, 한국 기준 서버 날짜, 월 검증, 유효 일별 출석 뷰 조회. 미래 날짜 제외 |
| server/src/main/java/kr/gym/ApiController.java | 출석 GET 경로를 서비스에 연결하고 기존 data/meta 응답 사용 |
| server/src/main/java/kr/gym/WebSecurity.java | 출석 API에 MEMBER 역할 요구 |
| mobile/src/api/authApi.ts | AttendanceMonth 응답 타입과 월별 출석 요청 함수 |
| mobile/src/hooks/useAttendance.ts | 조회·로딩·오류·재시도 관리. 달력 이동 후 늦게 온 이전 응답 무시 |
| mobile/src/screens/AttendanceScreen.tsx | API 날짜로 출석 표시, 실제 월 일수, 실패 시 재시도, 성공한 빈 조회만 기록 없음 표시 |
| mobile/src/state/AuthContext.tsx | 401에서 로그인 화면으로 돌아가는 expireSession 함수 |
| mobile/src/navigation/MemberTabs.tsx | 연결 범위 안내 갱신 |
| tools/prepare-dev-app.ps1 | 신규 개발 DB 앱 계정에 출석 뷰 SELECT 권한 부여 |
| db/003_app_attendance_read.sql | 기존 개발 DB에 같은 읽기 권한을 추가하는 증분 SQL |
| server/pom.xml | Mockito agent를 JVM 시작 시 로드. 동적 attach 파이프 차단으로 테스트 정지하는 환경 문제 해소 |

신규 코드에는 목적·정의·기능을 구분한 주석을 추가했다.

## API 응답
data:
- memberId: 문자열 ID
- month: 조회 월 YYYY-MM
- attendanceDates: 유효 방문이 있는 날짜 목록 YYYY-MM-DD, 오름차순, 중복 없음
- attendanceCount: 위 목록의 날짜 수
- today: Asia/Seoul 기준 서버 날짜
- earliestMonth: 과거 유효 출석의 첫 월, 기록 없으면 현재 월

로그인 없음 401, MEMBER 역할 없음 403, ACTIVE 회원 없음 404.
월 누락·잘못된 형식·1900~2100 범위 밖·미래 월은 422.
DB 장애는 기존 503 응답이며 앱은 빈 출석이나 예시 데이터로 바꾸지 않는다.

## DB 적용 전제
기존 테이블과 member_attendance_days 뷰를 사용하므로 테이블 재생성은 필요 없다.
기존 gym_app 역할에는 소유자 계정으로 db/003_app_attendance_read.sql을 한 번 적용해야 한다.
이 환경에서는 PostgreSQL pg_ctl.exe가 DLL 오류로 차단되어 DB 시작·권한 적용·실제 데이터 왕복은 미수행이다.
DB 소유자 계정을 서버 실행 계정으로 바꾸지 않는다.

## 검증 명령
프로젝트 루트 CMD:
    node --experimental-strip-types --test mobile/scripts/auth-api.test.mjs mobile/scripts/attendance-calendar.test.mjs
    node mobile/node_modules/typescript/bin/tsc --noEmit -p mobile/tsconfig.json

서버는 프로젝트 전용 Maven으로 AttendanceServiceTest, MobileWebSecurityTest, SecurityToolsTest를 실행한다.
서비스 테스트는 가짜 DB 응답으로 계정 범위·월 경계·빈 출석·잘못된 월을 검증한다.
실제 PostgreSQL 통합 검증을 대신하지 않는다.

## 최종 검증 결과
- 앱 API 통신 6개 + 달력 5개 = 11개 통과.
- 서버 출석 서비스 4개 + HTTP 보안 4개 + 암호 도구 4개 = 12개 통과.
- TypeScript 타입 검사와 Expo 웹 export 통과.
- 서버 테스트를 포함한 JAR 패키징 통과.
- PostgreSQL 실제 조회·DB 권한 SQL 적용·브라우저/휴대전화 전체 흐름은 미검증.
- 서버 테스트 중단은 Mockito 동적 attach 파이프 접근 오류로 확인했다. pom.xml의 시작 시 agent 로딩 설정 이후 위 12개 시험이 완료됐다.

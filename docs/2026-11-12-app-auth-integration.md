# 앱 인증 연동 — 2026-11-12

현재 범위: 로그인, 앱 시작 시 세션 확인, 본인 정보 조회, 로그아웃.
출석·이용권·예약·트레이너 정보·알림은 아직 예시 데이터다.

## 새 코드
- mobile/src/api/authApi.ts: 공통 HTTP 요청, 쿠키 포함, CSRF 조회, 명령별 Idempotency-Key, 오류·15초 제한.
- mobile/src/api/client.ts: 서버 주소 결정. EXPO_PUBLIC_API_URL 우선, 웹은 현재 호스트의 8080, Android 에뮬레이터는 10.0.2.2:8080.
- mobile/src/state/AuthContext.tsx: 계정 상태, 세션 복원, 로그인 후 /me 확인, 로그아웃 성공 후 상태 삭제.
- mobile/src/screens/LoginScreen.tsx: 휴대전화·비밀번호 입력, 중복 제출 방지, 실패 안내. 요청 후 비밀번호 입력값 제거.
- mobile/scripts/auth-api.test.mjs: 인증 HTTP 계약 테스트.

## 수정 코드
- mobile/App.tsx: 세션 확인 중 로딩 → 미로그인 로그인 화면 → 로그인 성공 회원 메뉴.
- mobile/src/screens/MyPageScreen.tsx: 이름·전화번호·계정번호를 /me 응답으로 표시. 로그아웃 버튼은 실제 API 호출.
- mobile/src/navigation/MemberTabs.tsx: 아직 연결하지 않은 데이터의 예시 표시.
- server/src/main/java/kr/gym/WebSecurity.java: 설정한 Origin에만 쿠키 포함 CORS 허용. 기존 CSRF·인증 검증 유지.
- server/src/main/resources/application.properties: GYM_CORS_ALLOWED_ORIGINS 설정 추가. 기본은 외부 Origin 허용 없음.
- tools/run-server.ps1: 로컬 실행 시 localhost:8081, 127.0.0.1:8081만 기본 허용.
- server/src/test/java/kr/gym/MobileWebSecurityTest.java: Expo Origin 허용·다른 Origin 차단·CSRF/인증 유지 검사.

## 실행
프로젝트 루트의 기존 로컬실행.cmd로 서버 실행. 앱은 mobile 폴더에서 다음 CMD 명령:

    npm run web

앱 8081, API 8080을 사용한다. 웹 주소가 localhost면 API도 localhost를 사용해야 SameSite 쿠키가 유지된다.
등록·승인·활성화 완료된 개발 회원 계정을 사용한다. 운영자 계정은 기존 서버 운영자 화면에서 MFA 인증한다.

실물 휴대전화의 localhost는 휴대전화 자신이다. PC의 LAN 주소를 EXPO_PUBLIC_API_URL로 설정해야 한다.
서버 기본 바인딩은 127.0.0.1이므로 LAN 접속은 별도 서버 바인딩·방화벽 설정이 필요하다.
네이티브 기기의 쿠키 유지·앱 재시작 후 세션 복원은 실제 기기에서 추가 검증해야 한다.
비밀번호나 세션 토큰을 AsyncStorage/localStorage에 저장하지 않는다.


## 이번 검증 결과
- TypeScript tsc --noEmit: 통과.
- Expo 웹 export: 통과.
- 앱 인증 통신 테스트: 4개 통과.
- Spring Boot JAR 빌드: 통과.
- 실제 PostgreSQL 통합 시험: 미완료. pg_ctl 실행 시 환경의 DLL/접근 오류 발생.
- 서버 테스트: 테스트 소스 컴파일까지 성공했으나 JVM의 Mockito agent 단계 이후 진행이 없어 중단. 통과로 계산하지 않음.
- 실제 브라우저/휴대전화의 회원 로그인 왕복: 미검증.

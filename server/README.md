# Spring Boot 회원 등록·인증

Java 21 / Spring Boot 3.5.16 / Spring Security / JDBC / PostgreSQL 15.19.

## 실행

2026-11-02 실행 파일 수정: 일반 Windows PATH에 PowerShell 7이 없는 것을 재현했다. `로컬실행.cmd`가 설치 경로와 Codex 번들 경로를 순서대로 찾도록 수정했다. 일반 Windows PATH로 `로컬실행.cmd --check` 실행 시 PowerShell 7.6.5 진입을 확인했다. 전체 서버 시작 요청은 권한 승인에서 거절되어 이번에도 실제 서버 기동은 확인하지 못했다. 실행 종료 시 창을 유지해 오류를 읽을 수 있게 했다.

현재 PC에는 Java, 프로젝트 전용 Maven, 개발 DB·서버 계정·설정과 빌드된 JAR가 준비돼 있다. 프로젝트 루트의 `로컬실행.cmd`를 직접 실행하면 DB 상태 확인 후 Spring Boot를 실행한다. 터미널을 유지하고 [개발 화면](http://127.0.0.1:8080)을 연다. 종료는 해당 창에서 Ctrl+C.

최초 실행이 완료되면 `.validation/app/시작안내.html`이 생성된다. 이 파일은 개발용 가상 운영자 계정의 휴대전화번호·비밀번호·현재 TOTP 번호를 보여준다. 암호화 키·자격증명·DB 데이터와 함께 `.validation`에만 두며 공유하거나 커밋하지 않는다. 이 안내 파일은 웹서버에서 제공하지 않는다.

1. 안내 파일의 정보로 로그인 → 추가 인증.
2. 새 회원에 가상 이름·전화번호 입력 → 만 14세 이상 본인 확인 체크 → 등록.
3. 회원 목록에서 승인(사유 입력) → 코드 발급(본인 확인·사유).
4. 발급 식별자와 코드를 복사한다. 운영자는 로그아웃한다.
5. 처음 이용/재설정 탭에서 식별자·코드·새 비밀번호 입력.
6. 회원 휴대전화번호·새 비밀번호로 로그인 → 본인 정보 확인 → 로그아웃.

운영자 로그인 직후 본인 인증은 5분간 코드 발급 한 번에 사용할 수 있다. 추가 코드 발급에는 비밀번호와 새로운 TOTP로 재인증한다. 동일한 30초 TOTP 재사용은 거절한다.

## 명령

프로젝트 루트 PowerShell에서:

```powershell
# 최초 개발 설정(기존 스키마를 삭제하지 않음)
./tools/prepare-dev-app.ps1
# 실제 PostgreSQL을 사용하는 전체 시험
./tools/run-server.ps1 -Test
# 실행 파일 빌드
./tools/run-server.ps1 -Build
# 웹 서버 실행
./tools/start-app.ps1
```

기본 DB 연결은 127.0.0.1:55432/gym_dev, 업무 계정은 gym_app. DB 소유자·파기 역할을 서버에 사용하지 않는다. gym_private 접근·감사 삭제·DB/역할 생성 권한은 없다. 개발 스키마/계정은 소유자 도구에서 준비하며 서버가 DDL을 실행하지 않는다.

## 구현된 경로

공통 접두사 `/api/v1`. 쓰기는 CSRF와 20~100자의 Idempotency-Key가 필요하다. ID는 문자열. 성공은 data/meta, 실패는 error/meta로 반환한다.

| 경로 | 동작 |
|---|---|
| GET /auth/csrf | 브라우저용 CSRF 토큰·헤더명 |
| POST /auth/login | 휴대전화·비밀번호 확인, 회원 세션 또는 운영자 MFA challenge |
| POST /auth/mfa/verify | TOTP 검증 후 운영자 세션. challenge 5분·5회 실패 제한·사용 후 폐기 |
| POST /auth/reauthenticate | 운영자 비밀번호+새 TOTP, 코드 발급용 5분·1회 권한 |
| POST /auth/code/consume | 최초 활성화/재설정. 코드와 식별자·newPassword |
| POST /auth/logout | 현재 DB 세션 회수 |
| GET /me | 현재 계정 본인 정보·역할 |
| GET /admin/members | 운영자용 최근 회원 최대 100개 |
| POST /admin/members | 이름·번호·age14Verified, 승인 대기 회원 등록 |
| POST /admin/accounts/{id}/status | 회원 승인/정지·expectedVersion·reason |
| POST /admin/accounts/{id}/codes | purpose ACTIVATE/RESET·identityVerified·reason. 재인증 1회 소비 |

전화번호 정규화+HMAC 검색, 이름·번호·MFA 비밀·사유 AES-GCM 암호화, 비밀번호 PBKDF2-HMAC-SHA256(무작위 salt·310,000회), 랜덤 세션/코드의 HMAC 저장을 적용했다. 세션은 HttpOnly/SameSite=Strict 쿠키이며 기본 Secure다. localhost 전용 설정에서만 HTTP 확인을 위해 Secure를 끈다.

멱등 처리는 DB 트랜잭션·요청별 advisory lock·본문 HMAC·암호화 응답으로 구현했다. DB 응답 저장소에 비밀번호 본문은 저장하지 않는다. 발급 코드·세션 응답 재전송을 위해 암호화한 결과를 보관하므로 운영용 자원별 KMS·만료 파기가 추가로 필요하다. 소유자 도구로 보관주기를 구현하기 전 임시 응답을 운영 데이터에 사용하지 않는다.

## 검증·현재 한계

2026-11-01: 실제 DB 통합 시험 8개 + 암호 도구 시험 4개 = 12개 통과, JAR 빌드 성공. 동시 등록/활성화, 코드 만료·5회 실패·소비 후 재사용 거절, MFA 전 권한 차단·challenge 재사용/만료, 세션 정지/미활동 회수, 멱등 충돌·중복 번호, CSRF 거절, 최소 DB 권한을 확인했다. 가상 TEST 회원·운영자 시험 데이터는 개발 DB에 남아 있다.

서버 실행 권한 요청이 거절되어 현재 JAR는 실행하지 않았고 브라우저 수동 점검도 미수행이다. 최초 운영자 bootstrap·실제 쿠키/CSRF 브라우저 왕복·모바일 배치는 앱 실행 후 확인해야 한다. 테스트는 Spring HTTP 필터/컨트롤러와 실제 DB를 연결한 MockMvc 시험이다.

현재 범위는 최초 회원 등록·인증 흐름이다. QR/이용권/PT·세션 전체 회수 UI·비밀번호 변경·운영자 MFA 등록/복구 코드 관리·번호 변경·탈퇴는 후속이다. 회원 목록의 cursor 페이지 처리·GET /operations/{key}·24시간 요청 결과 파기·배포용 TLS/KMS/백업/법정 보존 적용·공급자 연동·부하 검증도 남아 있다. 개발 파일 암호키는 외부 KMS 구현이 아니다. 이 상태를 운영 서비스 출시 완료로 사용하지 않는다.

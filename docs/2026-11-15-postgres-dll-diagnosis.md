# PostgreSQL DLL 오류 진단 — 2026-11-15

## 확인된 사실
- 도구의 PowerShell에서 pg_ctl.exe, psql.exe, postgres.exe의 --version이 실행 시작 전에 실패한다.
- .NET Process.Start가 반환한 NativeErrorCode는 623(ERROR_ILLEGAL_DLL_RELOCATION)이다.
- PATH를 PostgreSQL bin과 Windows 기본 경로로 축소해도 pg_ctl 실행 실패가 재현됐다. 원래 PATH는 복원했다.
- System32의 vcruntime140.dll, vcruntime140_1.dll, msvcp140.dll, ucrtbase.dll, kernel32.dll은 존재한다.
- Windows Application 이벤트 로그 조회는 권한 부족으로 거절됐다.
- 어느 DLL이 충돌했는지, 일반 사용자 CMD에서도 재현되는지는 아직 확인되지 않았다.
- DLL 파일 교체·삭제·다운로드, 시스템 설정 변경, PostgreSQL 재설치는 수행하지 않았다.

## 다음 진단
탐색기에서 프로젝트 루트의 DB진단.cmd를 직접 실행한다.
이 파일은 일반 CMD에서 세 실행 파일의 --version만 검사하며 DB를 변경하지 않는다.
결과는 .validation/pg-native-diagnostic.log에 저장하고 화면에도 표시한다.

세 종료 코드가 0이면 일반 CMD에서 PostgreSQL 실행은 정상이다.
이 경우 도구 실행 환경에서만 발생하는지 추가 구분하며 DLL 손상이라고 단정하지 않는다.
일반 CMD에서도 실패하면 출력된 오류와 Windows 이벤트 로그를 바탕으로 충돌 모듈을 식별한 후 복구 방법을 정한다.

Microsoft 코드 정의:
https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--500-999-

## 일반 CMD 확인 결과 — 2026-11-15 22:27 KST
사용자가 탐색기에서 DB진단.cmd를 실행한 화면과 저장 로그를 확인했다.
pg_ctl, psql, postgres 모두 PostgreSQL 15.19를 출력했으며 종료 코드는 각각 0이었다.
따라서 일반 CMD에서 세 실행 파일이 시작되는 것은 정상이다.
DLL 오류 623은 현재까지 도구 실행 환경에서만 재현됐다. 해당 환경에서의 구체적인 충돌 모듈은 미확인이다.
DLL 교체·재설치를 정당화하는 근거는 없다.
이 진단은 --version만 확인했으므로 DB 서버 기동·DB 접속 성공까지 확인한 것은 아니다.
다음은 일반 사용자 환경에서 기존 로컬실행.cmd로 DB와 Spring Boot를 기동하는 것이다.

## 일반 사용자 환경의 실제 기동 확인 — 2026-11-15 22:31 KST
사용자가 로컬실행.cmd를 실행한 화면에서 아래를 확인했다.
- PostgreSQL 서버 시작 완료, gym_dev DB에 gym_dev_owner로 접속해 SELECT 결과 출력.
- 개발 DB 주소 127.0.0.1:55432.
- Tomcat started on port 8080, Started GymApplication 로그 출력.
따라서 일반 사용자 실행 환경에서는 DB와 Spring Boot가 정상 기동한다.
도구에서 127.0.0.1:8080 HTTP 요청은 소켓 접근 권한 오류로 거절됐다.
도구의 DLL/소켓 제약은 해소되지 않았으며 정상 기동 화면만으로 앱 로그인·출석 조회 검증을 통과 처리하지 않는다.

## 운영자 안내 파일 경로 수정
서버가 생성한 안내·bootstrap 파일이 UTF-8 한글 절대 경로를 Java properties에서 잘못 해석한 형제 폴더에 있었다.
확인된 두 파일을 원래 프로젝트의 .validation/app으로 복사했다. 계정 값은 변경하거나 출력하지 않았다.
로컬 설정과 prepare-dev-app.ps1은 한글 경로를 Java properties의 Unicode escape로 저장하도록 수정했다.
현재 서버는 이미 기동했으므로 안내 파일 사용을 위해 재시작할 필요는 없다.
prepare-dev-app.ps1의 PowerShell 구문 검사를 통과했다. 재기동 후 경로 적용은 후속 확인이 필요하다.

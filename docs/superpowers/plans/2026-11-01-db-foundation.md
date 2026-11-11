# 개발 DB 기반 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 DB 파일을 새 개발 DB에서 실제 실행하고 후속 서버 개발에 사용할 검증 근거를 남긴다.

**Architecture:** 기존 `gym`, `gym_private` 스키마를 유지한다. 신규 빈 개발 DB만 대상으로 삼고 운영·기존 DB 변경은 별도 작업으로 분리한다.

**Tech Stack:** PostgreSQL 15 이상, psql, Python 3.12+pglast(선택적 정적 검사).

**Spec:** `요구사항정의서.md`, `DB설계서.md`, `db/README.md`, `기능별개발검증목록.md` DV01.

## Global Constraints

- 기존 데이터 삭제·마이그레이션 없이 새 개발 DB에 적용한다.
- `btree_gist`, `pg_trgm` 확장 설치 권한이 필요하다.
- 업무 API를 DB 소유자나 파기 역할로 실행하지 않는다.
- SQL 통과는 실제 API 동시성·법적 파기·복구 목표 달성 증거가 아니다.
- 정적 검사 수치를 실제 실행 통과로 기록하지 않는다.

## Review Focus

- 기존 스키마가 있는 DB에 잘못 적용: 대상 확인 후 중단, 삭제하지 않는다.
- 스모크 시험 실패: 오류 즉시 중단하고 오류·서버 버전 기록.
- 권한 과다: 소유자 성공과 업무 계정 성공을 구분한다.
- 동시 요청: 단일 연결의 스모크 시험으로 초과 확보 방지 통과를 주장하지 않는다.
- 복구: ROLLBACK 후에도 시퀀스 번호는 소모될 수 있으며 개발 DB만 사용한다.

### Task 1: 새 개발 DB에서 스키마·스모크 검증

**Files:** 기존 `db/001_schema.sql`, `db/002_smoke_test.sql`; 결과 갱신 `db/검증결과.md`.

**Interfaces:** 개발 DB 연결은 `DATABASE_URL`. 앱과 공유할 운영 연결은 사용하지 않는다.

- [x] 정적 검사 재실행: 번들 Python 3.12.14로 SQL 112문/4문과 외래키 125개 통과.
- [x] 현 PC 도구 확인: Node·Python·Git 있음, psql·PostgreSQL·Docker는 PATH에서 확인되지 않음.
- [x] Windows 설치 목록에서 PostgreSQL 15 계열 제공 확인. 설치 미수행.
- [x] PostgreSQL 15.19 설치·실행 확인. 별도 전용 개발 서버(127.0.0.1:55432, gym_dev)를 생성했다.
- [x] 대상 DB·소유자·버전 및 gym/gym_private 부재 확인. 암호를 명령 인자에 넣지 않기 위해 아래 실행은 `tools/start-dev-db.ps1 -Validate`의 PGPASSWORD 전달로 대체했다.
- [x] `001_schema.sql` ON_ERROR_STOP 실행, 종료 코드 0과 COMMIT 확인.
- [x] `002_smoke_test.sql` 실행, PASS·종료 코드 0·ROLLBACK 확인.
- [x] 날짜·버전·결과·미검증 범위를 검증결과에 기록. 재접속과 기존 스키마 재적용 거절도 확인했다.

Task 1 기록: 완료. 설치 때의 비밀번호를 요청하는 대신 프로젝트 전용 데이터 디렉터리·SCRAM 자격증명을 자동 생성했다. 기존 설치 서버를 변경하지 않고 업무 개발 시험을 재현할 수 있도록 한 선택이다. Task 2는 API별 권한·업무 트랜잭션 구현 후 실행하며 아직 통과 처리하지 않는다.

### Task 2: 최소권한·두 연결 경합 검증

**Files:** 새 `db/003_permissions_test.sql`, 새 `db/004_concurrency_test.py`, 결과 `db/검증결과.md`.

**Interfaces:** 실제 서버의 트랜잭션 규약 확정 후 업무 계정/전용 테스트 계정을 분리한다. 파기 역할을 업무 계정에 부여하지 않는다.

- [ ] 업무 계정에 필요한 테이블/시퀀스/함수 목록을 API 작업별로 정한다. 실제 GRANT 전 소유자와 파기 권한 부재를 확인한다.
- [ ] 권한 테스트에 PUBLIC 접근 거절·업무 계정의 gym_private 접근 거절·업무 쓰기 허용을 각각 넣는다.
- [ ] 서버 업무 처리 구현과 함께 두 연결을 장벽으로 동시에 시작하는 경합 시험을 작성한다. 마지막 PT 1회 확보·트레이너 겹침·QR 재사용은 한 건만 확정되어야 한다.
- [ ] 실패·응답 유실 뒤 같은 요청 키 재시도로 원장·방문·보상 중복이 없음을 확인한다.
- [ ] DV01과 경합 검증 결과를 구분해 기록한다. 아직 구현하지 않은 API 기능을 SQL만으로 완료 처리하지 않는다.

## 후속 구현 순서

다음 계획은 실제 DB 기반을 확인한 후 API 계약·인증·등록을 중심으로 작성한다. 서버/웹/모바일 프레임워크의 현재 지원 버전은 공식 문서를 확인해 정한다. 전체 기능 순서와 출시는 `프로젝트현황.md` 및 기존 개발·검증 목록을 따른다.

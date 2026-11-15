-- [목적] 003_auth_runtime.sql 파일: 인증 추가 검증·중복 요청 결과·운영 사유 저장용 테이블을 추가합니다. 기존 기준 스키마 적용 후 실행합니다.
-- Additive migration for authentication runtime. Apply as development owner.
BEGIN;
SET LOCAL search_path = gym,public;
-- [구성] auth_challenges 테이블: 운영자 추가 인증 도전의 지문·만료·사용 상태를 저장합니다. 외래 키는 연결 대상, CHECK·UNIQUE는 허용 조건을 제한합니다.
CREATE TABLE IF NOT EXISTS auth_challenges (
 id_hash bytea PRIMARY KEY, account_id bigint NOT NULL REFERENCES accounts,
 security_version integer NOT NULL, expires_at timestamptz NOT NULL,
 attempts smallint NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 used_at timestamptz
);
-- [구성] auth_operations 테이블: 중복 요청 검증용 본문 지문과 암호화된 처리 결과를 저장합니다. 외래 키는 연결 대상, CHECK·UNIQUE는 허용 조건을 제한합니다.
CREATE TABLE IF NOT EXISTS auth_operations (
 scope text NOT NULL, request_key text NOT NULL, path text NOT NULL,
 body_hash bytea NOT NULL, response_ciphertext bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,path,request_key)
);
CREATE INDEX IF NOT EXISTS auth_operations_expiry ON auth_operations(created_at);
-- [구성] auth_action_reasons 테이블: 감사 이벤트에 연결된 암호화 처리 사유를 저장합니다. 외래 키는 연결 대상, CHECK·UNIQUE는 허용 조건을 제한합니다.
CREATE TABLE IF NOT EXISTS auth_action_reasons (
 audit_id bigint PRIMARY KEY REFERENCES audit_events,
 reason_ciphertext bytea NOT NULL
);
COMMIT;

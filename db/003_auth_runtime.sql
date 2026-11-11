-- Additive migration for authentication runtime. Apply as development owner.
BEGIN;
SET LOCAL search_path = gym,public;
CREATE TABLE IF NOT EXISTS auth_challenges (
 id_hash bytea PRIMARY KEY, account_id bigint NOT NULL REFERENCES accounts,
 security_version integer NOT NULL, expires_at timestamptz NOT NULL,
 attempts smallint NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 used_at timestamptz
);
CREATE TABLE IF NOT EXISTS auth_operations (
 scope text NOT NULL, request_key text NOT NULL, path text NOT NULL,
 body_hash bytea NOT NULL, response_ciphertext bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,path,request_key)
);
CREATE INDEX IF NOT EXISTS auth_operations_expiry ON auth_operations(created_at);
CREATE TABLE IF NOT EXISTS auth_action_reasons (
 audit_id bigint PRIMARY KEY REFERENCES audit_events,
 reason_ciphertext bytea NOT NULL
);
COMMIT;

-- 요구사항정의서 v1.0 / DB 설계 v1.0 / PostgreSQL 15+
-- 신규 개발 DB용 기준 스키마. 기존 v0.1 DB의 업그레이드 스크립트가 아니다.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA gym;
CREATE SCHEMA gym_private;
SET LOCAL search_path = gym, public;

-- 로그인 식별 정보는 암호화한 전화번호와 검색용 HMAC로 분리한다.
-- 모든 암호화 키는 DB 밖 KMS에서 관리. *_key_ref는 비밀값이 아니다.
CREATE TABLE accounts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 phone_lookup_hmac bytea NOT NULL UNIQUE,
 phone_ciphertext bytea NOT NULL,
 display_name_ciphertext bytea NOT NULL,
 pii_key_ref text NOT NULL,
 password_hash text,
 status text NOT NULL CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','WITHDRAWN')),
 security_version integer NOT NULL DEFAULT 1 CHECK (security_version > 0),
 password_changed_at timestamptz,
 locked_until timestamptz,
 registered_by bigint REFERENCES accounts,
 age_14_verified_at timestamptz,
 age_14_verified_by bigint REFERENCES accounts,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'ACTIVE' OR password_hash IS NOT NULL)
);
CREATE TABLE account_roles (
 account_id bigint NOT NULL REFERENCES accounts,
 role text NOT NULL CHECK (role IN ('MEMBER','TRAINER','OPERATOR')),
 granted_by bigint NOT NULL REFERENCES accounts,
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (account_id,role)
);
CREATE TABLE members (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL UNIQUE REFERENCES accounts,
 status text NOT NULL CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','WITHDRAWN')),
 approved_by bigint REFERENCES accounts,
 approved_at timestamptz,
 first_use_on date,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'ACTIVE' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE trainers (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL UNIQUE REFERENCES accounts,
 status text NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','LEFT')),
 left_at timestamptz,
 CHECK (status <> 'LEFT' OR left_at IS NOT NULL)
);
CREATE TABLE auth_codes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES accounts,
 purpose text NOT NULL CHECK (purpose IN ('ACTIVATION','PASSWORD_RESET')),
 code_hash bytea NOT NULL UNIQUE,
 issued_by bigint NOT NULL REFERENCES accounts,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
 consumed_at timestamptz,
 revoked_at timestamptz,
 CHECK (expires_at = issued_at + CASE purpose WHEN 'ACTIVATION' THEN interval '24 hours' ELSE interval '15 minutes' END)
);
CREATE UNIQUE INDEX one_live_code ON auth_codes(account_id,purpose)
 WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE TABLE mfa_enrollments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES accounts,
 secret_ciphertext bytea NOT NULL,
 key_ref text NOT NULL,
 confirmed_at timestamptz,
 revoked_at timestamptz,
 last_accepted_time_step bigint,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_live_mfa ON mfa_enrollments(account_id) WHERE revoked_at IS NULL;
CREATE TABLE mfa_recovery_codes (
 enrollment_id bigint NOT NULL REFERENCES mfa_enrollments,
 code_no smallint NOT NULL CHECK (code_no BETWEEN 1 AND 10),
 code_hash bytea NOT NULL UNIQUE,
 used_at timestamptz,
 PRIMARY KEY (enrollment_id,code_no)
);
CREATE TABLE account_sessions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES accounts,
 token_hash bytea NOT NULL UNIQUE,
 privilege text NOT NULL CHECK (privilege IN ('STANDARD','OPERATOR')),
 security_version integer NOT NULL CHECK (security_version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 reauthenticated_at timestamptz,
 mfa_verified_at timestamptz,
 revoked_at timestamptz,
 CHECK (last_seen_at >= created_at),
 CHECK (expires_at = created_at + CASE privilege WHEN 'OPERATOR' THEN interval '12 hours' ELSE interval '30 days' END),
 CHECK (privilege <> 'OPERATOR' OR mfa_verified_at IS NOT NULL)
);
CREATE TABLE login_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint REFERENCES accounts,
 login_fingerprint bytea NOT NULL,
 source_fingerprint bytea NOT NULL,
 succeeded boolean NOT NULL,
 attempted_at timestamptz NOT NULL DEFAULT now(),
 purge_after timestamptz NOT NULL
);
CREATE INDEX login_failure_window ON login_attempts(login_fingerprint,attempted_at) WHERE NOT succeeded;
CREATE INDEX login_source_window ON login_attempts(source_fingerprint,attempted_at);

CREATE TABLE policy_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 version_name text NOT NULL UNIQUE,
 effective_from timestamptz NOT NULL,
 effective_until timestamptz,
 requirements_version text NOT NULL,
 values_snapshot jsonb NOT NULL CHECK (jsonb_typeof(values_snapshot) = 'object'),
 changed_by bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 EXCLUDE USING gist (tstzrange(effective_from,effective_until,'[)') WITH &&)
);
CREATE TABLE gym_settings (
 id smallint PRIMARY KEY CHECK (id = 1),
 name text NOT NULL,
 timezone text NOT NULL DEFAULT 'Asia/Seoul' CHECK (timezone = 'Asia/Seoul'),
 normal_from integer,
 crowded_from integer,
 refresh_seconds integer NOT NULL DEFAULT 60 CHECK (refresh_seconds = 60),
 stale_seconds integer NOT NULL DEFAULT 180 CHECK (stale_seconds = 180),
 updated_by bigint NOT NULL REFERENCES accounts,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((normal_from IS NULL AND crowded_from IS NULL) OR
  (normal_from IS NOT NULL AND crowded_from IS NOT NULL AND normal_from > 0 AND crowded_from > normal_from))
);
CREATE TABLE weekly_opening_hours (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 iso_weekday smallint NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
 effective_from date NOT NULL,
 effective_until date,
 is_closed boolean NOT NULL,
 opens_at time,
 closes_at time,
 closing_day_offset smallint NOT NULL DEFAULT 0 CHECK (closing_day_offset IN (0,1)),
 changed_by bigint NOT NULL REFERENCES accounts,
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 CHECK ((is_closed AND opens_at IS NULL AND closes_at IS NULL AND closing_day_offset=0) OR
  (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL
   AND (closing_day_offset=1 OR closes_at > opens_at))),
 EXCLUDE USING gist (iso_weekday WITH =, daterange(effective_from,effective_until,'[)') WITH &&)
);
-- 날짜는 KST 달력 날짜다. CLOSED는 전날 시작한 익일 영업에도 우선한다.
CREATE TABLE calendar_overrides (
 business_date date PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('CLOSED','CUSTOM_OPEN')),
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 changed_by bigint NOT NULL REFERENCES accounts,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE calendar_open_intervals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_date date NOT NULL REFERENCES calendar_overrides,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 CHECK (ends_at > starts_at AND ends_at-starts_at <= interval '24 hours'),
 EXCLUDE USING gist (business_date WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
);
CREATE TABLE pause_policy_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 effective_from timestamptz NOT NULL,
 effective_until timestamptz,
 min_days integer NOT NULL CHECK (min_days > 0),
 max_days integer NOT NULL,
 max_requests_per_contract integer NOT NULL CHECK (max_requests_per_contract > 0),
 changed_by bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 CHECK (max_days >= min_days),
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 EXCLUDE USING gist (tstzrange(effective_from,effective_until,'[)') WITH &&)
);

CREATE TABLE memberships (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 previous_membership_id bigint UNIQUE,
 original_starts_on date NOT NULL,
 original_expires_on date NOT NULL,
 starts_on date NOT NULL,
 current_expires_on date NOT NULL,
 status text NOT NULL CHECK (status IN ('REGISTERED','CANCELLED')),
 registered_by bigint NOT NULL REFERENCES accounts,
 policy_version_id bigint NOT NULL REFERENCES policy_versions,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,member_id),
 FOREIGN KEY (previous_membership_id,member_id) REFERENCES memberships(id,member_id),
 CHECK (previous_membership_id IS NULL OR previous_membership_id <> id),
 CHECK (original_expires_on >= original_starts_on AND current_expires_on >= starts_on),
 CONSTRAINT memberships_no_overlap EXCLUDE USING gist
  (member_id WITH =,daterange(starts_on,current_expires_on+1,'[)') WITH &&)
  WHERE (status='REGISTERED') DEFERRABLE INITIALLY IMMEDIATE
);
CREATE TABLE pt_passes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 starts_on date NOT NULL,
 original_expires_on date NOT NULL,
 current_expires_on date NOT NULL,
 balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
 held_count integer NOT NULL DEFAULT 0 CHECK (held_count >= 0 AND held_count <= balance),
 status text NOT NULL CHECK (status IN ('REGISTERED','CANCELLED')),
 registered_by bigint NOT NULL REFERENCES accounts,
 policy_version_id bigint NOT NULL REFERENCES policy_versions,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,member_id),
 CHECK (original_expires_on >= starts_on AND current_expires_on >= starts_on)
);
CREATE TABLE pause_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 membership_id bigint NOT NULL,
 member_id bigint NOT NULL REFERENCES members,
 pause_policy_id bigint NOT NULL REFERENCES pause_policy_versions,
 policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot)='object'),
 requested_from date NOT NULL,
 requested_until date NOT NULL,
 approved_from date,
 approved_until date,
 actual_from date,
 actual_until date,
 status text NOT NULL CHECK (status IN ('REQUESTED','APPROVED','REJECTED','CANCELLED','ACTIVE','ENDED')),
 requested_by bigint NOT NULL REFERENCES accounts,
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by bigint REFERENCES accounts,
 decided_at timestamptz,
 decision_reason text,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 UNIQUE(id,member_id),
 FOREIGN KEY (membership_id,member_id) REFERENCES memberships(id,member_id),
 CHECK (requested_until >= requested_from),
 CHECK ((approved_from IS NULL AND approved_until IS NULL) OR
  (approved_from IS NOT NULL AND approved_until IS NOT NULL AND approved_until >= approved_from)),
 CHECK ((actual_from IS NULL AND actual_until IS NULL) OR
  (actual_from IS NOT NULL AND actual_until IS NOT NULL AND actual_until >= actual_from)),
 CHECK (status NOT IN ('APPROVED','ACTIVE','ENDED') OR
  (approved_from IS NOT NULL AND actual_from IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
 EXCLUDE USING gist (member_id WITH =,daterange(actual_from,actual_until+1,'[)') WITH &&)
  WHERE (status IN ('APPROVED','ACTIVE','ENDED'))
);

CREATE TABLE trainer_assignments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 trainer_id bigint NOT NULL REFERENCES trainers,
 effective_from timestamptz NOT NULL,
 effective_until timestamptz,
 changed_by bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 UNIQUE (id,member_id,trainer_id),
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 EXCLUDE USING gist (member_id WITH =,tstzrange(effective_from,effective_until,'[)') WITH &&)
);
CREATE TABLE trainer_slots (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 trainer_id bigint NOT NULL REFERENCES trainers,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('PUBLISHED','WITHDRAWN')),
 created_by bigint NOT NULL REFERENCES accounts,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,trainer_id,starts_at,ends_at),
 UNIQUE (trainer_id,starts_at),
 CHECK (ends_at-starts_at=interval '1 hour'),
 CHECK (extract(minute FROM starts_at AT TIME ZONE 'Asia/Seoul') IN (0,30)
  AND extract(second FROM starts_at AT TIME ZONE 'Asia/Seoul')=0)
);
CREATE TABLE pt_bookings (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 trainer_id bigint NOT NULL REFERENCES trainers,
 assignment_id bigint NOT NULL,
 slot_id bigint NOT NULL,
 pt_pass_id bigint NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 -- 가장 최근에 합의된 수업 구간. 늦은 취소 시 보존하고 charge_due_at도 유지한다.
 status text NOT NULL CHECK (status IN ('CONFIRMED','CANCELLED','ENDED')),
 outcome text NOT NULL DEFAULT 'UNRECORDED' CHECK (outcome IN ('UNRECORDED','ATTENDED','NO_SHOW')),
 cancellation_kind text CHECK (cancellation_kind IN ('ON_TIME','LATE','TRAINER','PAUSE','OPERATOR')),
 cancelled_at timestamptz,
 cancelled_by bigint REFERENCES accounts,
 charge_due_at timestamptz NOT NULL,
 policy_version_id bigint NOT NULL REFERENCES policy_versions,
 booked_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 UNIQUE (id,member_id),
 UNIQUE (id,member_id,pt_pass_id),
 FOREIGN KEY (assignment_id,member_id,trainer_id) REFERENCES trainer_assignments(id,member_id,trainer_id),
 FOREIGN KEY (slot_id,trainer_id,starts_at,ends_at) REFERENCES trainer_slots(id,trainer_id,starts_at,ends_at),
 FOREIGN KEY (pt_pass_id,member_id) REFERENCES pt_passes(id,member_id),
 CHECK (ends_at-starts_at=interval '1 hour'),
 CHECK (charge_due_at=ends_at),
 CHECK ((status='CANCELLED' AND cancelled_at IS NOT NULL AND cancellation_kind IS NOT NULL)
  OR (status<>'CANCELLED' AND cancelled_at IS NULL AND cancellation_kind IS NULL)),
 EXCLUDE USING gist (trainer_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status<>'CANCELLED'),
 EXCLUDE USING gist (member_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status<>'CANCELLED')
);
CREATE TABLE pt_booking_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id bigint NOT NULL REFERENCES pt_bookings,
 base_version integer NOT NULL CHECK (base_version>0),
 old_starts_at timestamptz NOT NULL,
 old_ends_at timestamptz NOT NULL,
 proposed_slot_id bigint NOT NULL REFERENCES trainer_slots,
 proposed_assignment_id bigint NOT NULL REFERENCES trainer_assignments,
 requested_by bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason))>0),
 status text NOT NULL CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 member_decided_by bigint REFERENCES accounts,
 member_decided_at timestamptz,
 applied_at timestamptz,
 CHECK (expires_at>requested_at),
 CHECK (status<>'ACCEPTED' OR (member_decided_by IS NOT NULL AND member_decided_at IS NOT NULL AND applied_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_booking_change ON pt_booking_changes(booking_id) WHERE status='PENDING';
CREATE TABLE pt_booking_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id bigint NOT NULL REFERENCES pt_bookings,
 event_type text NOT NULL,
 actor_account_id bigint REFERENCES accounts,
 operation_key text NOT NULL UNIQUE,
 reason text,
 before_values jsonb,
 after_values jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pt_charge_exceptions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id bigint NOT NULL REFERENCES pt_bookings,
 action text NOT NULL CHECK (action IN ('WAIVE','RESTORE')),
 operator_account_id bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason))>0),
 operation_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (booking_id,action)
);
CREATE TABLE pt_holds (
 booking_id bigint PRIMARY KEY,
 member_id bigint NOT NULL,
 pt_pass_id bigint NOT NULL,
 status text NOT NULL CHECK (status IN ('HELD','RELEASED','CONSUMED')),
 held_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 FOREIGN KEY (booking_id,member_id,pt_pass_id) REFERENCES pt_bookings(id,member_id,pt_pass_id),
 CHECK ((status='HELD' AND resolved_at IS NULL) OR (status<>'HELD' AND resolved_at IS NOT NULL))
);
CREATE TABLE pt_credit_entries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL,
 pt_pass_id bigint NOT NULL,
 booking_id bigint,
 kind text NOT NULL CHECK (kind IN ('GRANT','CONSUME','RESTORE','ADJUST')),
 delta integer NOT NULL CHECK (delta<>0),
 balance_before integer NOT NULL CHECK (balance_before>=0),
 balance_after integer NOT NULL CHECK (balance_after>=0),
 reversal_of_id bigint UNIQUE,
 charge_exception_id bigint UNIQUE REFERENCES pt_charge_exceptions,
 actor_account_id bigint REFERENCES accounts,
 operation_key text NOT NULL UNIQUE,
 reason text NOT NULL CHECK (length(trim(reason))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,member_id,pt_pass_id),
 FOREIGN KEY (pt_pass_id,member_id) REFERENCES pt_passes(id,member_id),
 FOREIGN KEY (booking_id,member_id,pt_pass_id) REFERENCES pt_bookings(id,member_id,pt_pass_id),
 FOREIGN KEY (reversal_of_id,member_id,pt_pass_id) REFERENCES pt_credit_entries(id,member_id,pt_pass_id),
 CHECK (balance_after=balance_before+delta),
 CHECK (kind<>'GRANT' OR delta>0),
 CHECK (kind<>'CONSUME' OR (delta=-1 AND booking_id IS NOT NULL)),
 CHECK (kind<>'RESTORE' OR (delta=1 AND reversal_of_id IS NOT NULL AND charge_exception_id IS NOT NULL)),
 CHECK (kind<>'ADJUST' OR booking_id IS NULL)
);
CREATE UNIQUE INDEX one_booking_consumption ON pt_credit_entries(booking_id) WHERE kind='CONSUME';

CREATE TABLE checkin_devices (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL,
 credential_hash bytea NOT NULL UNIQUE,
 status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
 registered_by bigint NOT NULL REFERENCES accounts,
 revoked_at timestamptz,
 last_seen_at timestamptz,
 CHECK (status<>'REVOKED' OR revoked_at IS NOT NULL)
);
CREATE TABLE member_qr_credentials (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 session_id bigint NOT NULL REFERENCES account_sessions,
 token_hash bytea NOT NULL UNIQUE,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 revoked_at timestamptz,
 CHECK (expires_at=issued_at+interval '60 seconds')
);
CREATE TABLE occupancy_windows (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('VALID','VOID')),
 UNIQUE(id,member_id),
 CHECK (ends_at-starts_at=interval '2 hours'),
 EXCLUDE USING gist (member_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status='VALID')
);
-- 날짜 출석과 2시간 구간을 분리: 같은 구간에 자정 전후 두 날짜 방문을 연결할 수 있다.
CREATE TABLE visits (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 occupancy_window_id bigint NOT NULL,
 device_id bigint REFERENCES checkin_devices,
 checked_in_at timestamptz NOT NULL,
 attendance_date date NOT NULL,
 admission_kind text NOT NULL CHECK (admission_kind IN ('FACILITY','PT_ONLY','MANUAL_EXCEPTION')),
 membership_id bigint,
 pt_booking_id bigint,
 reward_eligible boolean NOT NULL,
 status text NOT NULL CHECK (status IN ('VALID','VOID')),
 source text NOT NULL CHECK (source IN ('QR','MANUAL')),
 recorded_by bigint REFERENCES accounts,
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (occupancy_window_id,member_id) REFERENCES occupancy_windows(id,member_id),
 FOREIGN KEY (membership_id,member_id) REFERENCES memberships(id,member_id),
 FOREIGN KEY (pt_booking_id,member_id) REFERENCES pt_bookings(id,member_id),
 CHECK (source<>'QR' OR device_id IS NOT NULL),
 CHECK (source<>'MANUAL' OR (recorded_by IS NOT NULL AND reason IS NOT NULL AND length(trim(reason))>0)),
 CHECK (admission_kind<>'FACILITY' OR membership_id IS NOT NULL),
 CHECK (NOT reward_eligible OR membership_id IS NOT NULL),
 CHECK (admission_kind<>'PT_ONLY' OR (pt_booking_id IS NOT NULL AND NOT reward_eligible))
);
CREATE UNIQUE INDEX one_visit_per_window_date ON visits(member_id,occupancy_window_id,attendance_date) WHERE status='VALID';
CREATE TABLE checkin_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id bigint NOT NULL REFERENCES checkin_devices,
 request_key text NOT NULL,
 payload_fingerprint bytea NOT NULL,
 qr_credential_id bigint REFERENCES member_qr_credentials,
 result_code text NOT NULL CHECK (result_code IN ('PROCESSING','SUCCESS','DUPLICATE','REJECTED')),
 visit_id bigint REFERENCES visits,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 UNIQUE(device_id,request_key),
 CHECK (result_code NOT IN ('SUCCESS','DUPLICATE') OR visit_id IS NOT NULL),
 CHECK (result_code='PROCESSING' OR processed_at IS NOT NULL)
);
CREATE UNIQUE INDEX one_qr_success ON checkin_requests(qr_credential_id)
 WHERE result_code IN ('SUCCESS','DUPLICATE');
CREATE TABLE visit_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 visit_id bigint NOT NULL REFERENCES visits,
 actor_account_id bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason))>0),
 before_values jsonb NOT NULL,
 after_values jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE streak_states (
 member_id bigint PRIMARY KEY REFERENCES members,
 count_days smallint NOT NULL DEFAULT 0 CHECK (count_days BETWEEN 0 AND 9),
 last_evaluated_on date,
 last_attended_on date,
 segment_no integer NOT NULL DEFAULT 1 CHECK (segment_no>0),
 version integer NOT NULL DEFAULT 1 CHECK (version>0)
);
CREATE TABLE streak_evaluations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 business_date date NOT NULL,
 revision integer NOT NULL CHECK (revision>0),
 verdict text NOT NULL CHECK (verdict IN ('ATTEND','ABSENT','CLOSED_SKIP','PAUSE_SKIP','INACTIVE_SKIP','EXPIRY_RESET','REVIEW_REQUIRED')),
 count_before smallint NOT NULL CHECK (count_before BETWEEN 0 AND 9),
 count_after smallint NOT NULL CHECK (count_after BETWEEN 0 AND 9),
 policy_version_id bigint NOT NULL REFERENCES policy_versions,
 evidence jsonb NOT NULL,
 operation_key text NOT NULL UNIQUE,
 evaluated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(member_id,business_date,revision),
 UNIQUE(id,member_id),
 CHECK (verdict<>'PAUSE_SKIP' OR count_before=count_after),
 CHECK (verdict<>'CLOSED_SKIP' OR count_before=count_after),
 CHECK (verdict NOT IN ('ABSENT','EXPIRY_RESET') OR count_after=0)
);
CREATE TABLE reward_awards (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL,
 membership_id bigint NOT NULL,
 evaluation_id bigint NOT NULL UNIQUE,
 -- 정정 후에도 같은 10일분에 같은 키를 재사용한다. 재판정으로 중복 지급하지 않는다.
 entitlement_key text NOT NULL UNIQUE,
 reward_days smallint NOT NULL DEFAULT 1 CHECK (reward_days=1),
 status text NOT NULL CHECK (status IN ('APPLIED','REVIEW_REQUIRED','REVERSED','CLOSED_USED')),
 awarded_at timestamptz NOT NULL,
 reviewed_by bigint REFERENCES accounts,
 review_reason text,
 UNIQUE(id,membership_id),
 FOREIGN KEY (evaluation_id,member_id) REFERENCES streak_evaluations(id,member_id),
 FOREIGN KEY (membership_id,member_id) REFERENCES memberships(id,member_id)
);
CREATE TABLE reward_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 affected_from date NOT NULL,
 award_id bigint REFERENCES reward_awards,
 proposed_action text NOT NULL CHECK (proposed_action IN ('ADD','REVOKE','KEEP','CLOSE_USED')),
 status text NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','APPLIED')),
 reason text NOT NULL CHECK (length(trim(reason))>0),
 reviewed_by bigint REFERENCES accounts,
 reviewed_at timestamptz,
 operation_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE membership_adjustments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 membership_id bigint NOT NULL REFERENCES memberships,
 member_id bigint NOT NULL,
 kind text NOT NULL CHECK (kind IN ('REWARD','PAUSE','EARLY_RETURN','RENEWAL_SHIFT','MANUAL','REVERSAL')),
 before_starts_on date NOT NULL,
 after_starts_on date NOT NULL,
 before_expires_on date NOT NULL,
 after_expires_on date NOT NULL,
 pause_request_id bigint,
 reward_award_id bigint,
 reversal_of_id bigint UNIQUE REFERENCES membership_adjustments,
 actor_account_id bigint REFERENCES accounts,
 policy_version_id bigint NOT NULL REFERENCES policy_versions,
 operation_key text NOT NULL UNIQUE,
 reason text NOT NULL CHECK (length(trim(reason))>0),
 applied_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (membership_id,member_id) REFERENCES memberships(id,member_id),
 FOREIGN KEY (pause_request_id,member_id) REFERENCES pause_requests(id,member_id),
 FOREIGN KEY (reward_award_id,membership_id) REFERENCES reward_awards(id,membership_id),
 CHECK (before_expires_on>=before_starts_on AND after_expires_on>=after_starts_on),
 CHECK (kind<>'REWARD' OR (reward_award_id IS NOT NULL AND after_expires_on=before_expires_on+1 AND after_starts_on=before_starts_on)),
 CHECK (kind NOT IN ('PAUSE','EARLY_RETURN') OR pause_request_id IS NOT NULL),
 CHECK (kind<>'REVERSAL' OR reversal_of_id IS NOT NULL)
);
CREATE UNIQUE INDEX one_reward_extension ON membership_adjustments(reward_award_id) WHERE kind='REWARD';
CREATE TABLE pt_pass_adjustments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL,
 pt_pass_id bigint NOT NULL,
 pause_request_id bigint,
 kind text NOT NULL CHECK (kind IN ('PAUSE','EARLY_RETURN','MANUAL','REVERSAL')),
 before_expires_on date NOT NULL,
 after_expires_on date NOT NULL,
 reversal_of_id bigint UNIQUE REFERENCES pt_pass_adjustments,
 actor_account_id bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason))>0),
 operation_key text NOT NULL UNIQUE,
 applied_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (pt_pass_id,member_id) REFERENCES pt_passes(id,member_id),
 FOREIGN KEY (pause_request_id,member_id) REFERENCES pause_requests(id,member_id),
 CHECK (kind NOT IN ('PAUSE','EARLY_RETURN') OR pause_request_id IS NOT NULL),
 CHECK (kind<>'REVERSAL' OR reversal_of_id IS NOT NULL)
);

-- 일지 본문과 이력은 암호화한다. 민감정보 파기 시 동일 일지 키를 폐기해 이력/백업까지 읽을 수 없게 한다.
CREATE TABLE pt_journals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id bigint NOT NULL UNIQUE,
 member_id bigint NOT NULL,
 author_trainer_id bigint NOT NULL REFERENCES trainers,
 body_ciphertext bytea,
 body_char_count integer,
 encryption_key_ref text,
 status text NOT NULL CHECK (status IN ('VISIBLE','RESTRICTED','PURGED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (booking_id,member_id) REFERENCES pt_bookings(id,member_id),
 CHECK ((status='PURGED' AND body_ciphertext IS NULL AND body_char_count IS NULL AND encryption_key_ref IS NULL)
  OR (status<>'PURGED' AND body_ciphertext IS NOT NULL AND body_char_count BETWEEN 1 AND 5000
   AND body_char_count IS NOT NULL AND encryption_key_ref IS NOT NULL))
);
CREATE TABLE pt_journal_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 journal_id bigint NOT NULL REFERENCES pt_journals,
 version integer NOT NULL CHECK (version>0),
 body_ciphertext bytea,
 body_char_count integer,
 editor_account_id bigint NOT NULL REFERENCES accounts,
 reason_code text NOT NULL,
 redacted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(journal_id,version),
 CHECK ((redacted_at IS NULL AND body_ciphertext IS NOT NULL AND body_char_count IS NOT NULL AND body_char_count BETWEEN 1 AND 5000)
  OR (redacted_at IS NOT NULL AND body_ciphertext IS NULL AND body_char_count IS NULL))
);
CREATE TABLE content_incidents (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 journal_id bigint NOT NULL REFERENCES pt_journals,
 reported_by bigint REFERENCES accounts,
 category text NOT NULL CHECK (category IN ('HEALTH_DATA','OTHER_PERSONAL_DATA','OTHER')),
 status text NOT NULL CHECK (status IN ('OPEN','RESTRICTED','REDACTED','CLOSED')),
 handled_by bigint REFERENCES accounts,
 reported_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE posts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 type text NOT NULL CHECK (type IN ('NOTICE','TIP')),
 title text NOT NULL CHECK (length(trim(title))>0),
 body text NOT NULL,
 status text NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','UNPUBLISHED')),
 pinned boolean NOT NULL DEFAULT false,
 author_account_id bigint NOT NULL REFERENCES accounts,
 published_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT pinned OR type='NOTICE'),
 CHECK (status<>'PUBLISHED' OR published_at IS NOT NULL)
);
CREATE TABLE post_images (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 post_id bigint NOT NULL REFERENCES posts,
 position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
 object_key text NOT NULL UNIQUE,
 mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
 size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
 verified_at timestamptz NOT NULL,
 UNIQUE(post_id,position)
);
CREATE TABLE post_video_links (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 post_id bigint NOT NULL REFERENCES posts,
 https_url text NOT NULL CHECK (https_url ~ '^https://[^[:space:]]+$')
);
CREATE TABLE post_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 post_id bigint NOT NULL REFERENCES posts,
 version integer NOT NULL,
 snapshot jsonb NOT NULL,
 editor_account_id bigint NOT NULL REFERENCES accounts,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(post_id,version)
);

CREATE TABLE notification_types (
 code text PRIMARY KEY,
 push_title text NOT NULL,
 push_body text NOT NULL
);
INSERT INTO notification_types VALUES
 ('FACILITY_EXPIRY','이용권 알림','이용권 알림이 있습니다'),
 ('PT_EXPIRY','이용권 알림','이용권 알림이 있습니다'),
 ('PT_BOOKED','예약 알림','예약 알림이 있습니다'),
 ('PT_CHANGED','예약 알림','예약 변경 알림이 있습니다'),
 ('PT_CANCELLED','예약 알림','예약 취소 알림이 있습니다'),
 ('PT_REMINDER','예약 알림','예정된 예약이 있습니다'),
 ('REWARD','보상 알림','출석 보상 알림이 있습니다'),
 ('PAUSE_RESULT','휴회 알림','휴회 처리 결과가 있습니다'),
 ('CHANGE_PROPOSAL','일정 알림','일정 변경 제안이 있습니다'),
 ('CHANGE_RESPONSE','일정 알림','일정 변경 결과가 있습니다'),
 ('TRAINER_CHANGED','담당 알림','담당 변경 알림이 있습니다'),
 ('LESSON_UNRECORDED','수업 알림','수업 결과 확인이 필요합니다');
CREATE TABLE notification_preferences (
 account_id bigint NOT NULL REFERENCES accounts,
 type_code text NOT NULL REFERENCES notification_types,
 push_enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,type_code)
);
CREATE TABLE push_devices (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES accounts,
 platform text NOT NULL CHECK (platform IN ('ANDROID','IOS')),
 token_hash bytea NOT NULL UNIQUE,
 token_ciphertext bytea NOT NULL,
 key_ref text NOT NULL,
 revoked_at timestamptz,
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
-- 예정 이벤트는 아직 알림함에 보이지 않는다. 확정/도래 후 notifications로 물질화한다.
CREATE TABLE notification_jobs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 recipient_account_id bigint NOT NULL REFERENCES accounts,
 type_code text NOT NULL REFERENCES notification_types,
 membership_id bigint REFERENCES memberships,
 pt_pass_id bigint REFERENCES pt_passes,
 booking_id bigint REFERENCES pt_bookings,
 pause_request_id bigint REFERENCES pause_requests,
 reward_award_id bigint REFERENCES reward_awards,
 booking_change_id bigint REFERENCES pt_booking_changes,
 source_version integer NOT NULL CHECK (source_version>0),
 dedupe_key text NOT NULL UNIQUE,
 scheduled_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('PENDING','MATERIALIZED','CANCELLED','EXPIRED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id bigint UNIQUE REFERENCES notification_jobs,
 recipient_account_id bigint NOT NULL REFERENCES accounts,
 type_code text NOT NULL REFERENCES notification_types,
 dedupe_key text NOT NULL UNIQUE,
 body_ciphertext bytea NOT NULL,
 key_ref text NOT NULL,
 visible_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 purge_after timestamptz NOT NULL,
 CHECK (purge_after<=visible_at+interval '90 days' AND purge_after>visible_at)
);
CREATE TABLE push_deliveries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 notification_id bigint NOT NULL REFERENCES notifications,
 push_device_id bigint NOT NULL REFERENCES push_devices,
 status text NOT NULL CHECK (status IN ('PENDING','SENDING','SENT','FAILED','CANCELLED','EXPIRED')),
 first_scheduled_at timestamptz NOT NULL,
 next_attempt_at timestamptz NOT NULL,
 stop_at timestamptz NOT NULL,
 attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 4),
 lease_until timestamptz,
 sent_at timestamptz,
 UNIQUE(notification_id,push_device_id),
 CHECK (stop_at<=first_scheduled_at+interval '30 minutes' AND stop_at>first_scheduled_at),
 CHECK (status<>'SENT' OR sent_at IS NOT NULL)
);
CREATE TABLE notification_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 delivery_id bigint NOT NULL REFERENCES push_deliveries,
 attempt_no smallint NOT NULL CHECK (attempt_no BETWEEN 1 AND 4),
 attempted_at timestamptz NOT NULL DEFAULT now(),
 result text NOT NULL CHECK (result IN ('ACCEPTED','FAILED','UNKNOWN','TOKEN_INVALID')),
 provider_message_id text,
 error_code text,
 UNIQUE(delivery_id,attempt_no)
);

-- 업무 로그에 개인정보 본문을 복사하지 않는다. 분리보존은 개별 근거와 기한을 가진다.
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_account_id bigint REFERENCES accounts,
 actor_type text NOT NULL CHECK (actor_type IN ('ACCOUNT','SYSTEM','DEVICE')),
 target_type text NOT NULL,
 target_id text NOT NULL,
 action text NOT NULL,
 reason_code text NOT NULL,
 safe_metadata jsonb NOT NULL DEFAULT '{}',
 occurred_at timestamptz NOT NULL DEFAULT now(),
 purge_after timestamptz NOT NULL,
 CHECK (purge_after>occurred_at)
);
CREATE TABLE gym_private.access_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_ref text NOT NULL,
 action_code text NOT NULL,
 resource_type text NOT NULL,
 subject_ref text,
 encrypted_context bytea,
 key_ref text,
 occurred_at timestamptz NOT NULL,
 retention_years smallint NOT NULL DEFAULT 1 CHECK (retention_years IN (1,2)),
 purge_after timestamptz NOT NULL,
 CHECK (purge_after>=occurred_at+make_interval(years=>retention_years))
);
CREATE TABLE gym_private.permission_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_ref text NOT NULL,
 subject_ref text NOT NULL,
 role_code text NOT NULL,
 action text NOT NULL CHECK (action IN ('GRANT','CHANGE','REVOKE')),
 occurred_at timestamptz NOT NULL,
 purge_after timestamptz NOT NULL,
 CHECK (purge_after>=occurred_at+interval '3 years')
);
CREATE TABLE gym_private.retention_rules (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 record_category text NOT NULL,
 legal_basis text NOT NULL,
 applicability_evidence_ref text NOT NULL,
 duration_months integer NOT NULL CHECK (duration_months>0),
 effective_from date NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 approved_by_ref text NOT NULL,
 CHECK (length(trim(applicability_evidence_ref))>0)
);
CREATE TABLE gym_private.retained_records (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 rule_id bigint NOT NULL REFERENCES gym_private.retention_rules,
 subject_ref text NOT NULL,
 purpose text NOT NULL,
 retention_starts_at timestamptz NOT NULL,
 retain_until timestamptz NOT NULL,
 payload_ciphertext bytea,
 key_ref text,
 status text NOT NULL CHECK (status IN ('RETAINED','DESTROYED')),
 destroyed_at timestamptz,
 CHECK (retain_until>retention_starts_at),
 CHECK ((status='RETAINED' AND payload_ciphertext IS NOT NULL AND key_ref IS NOT NULL)
  OR (status='DESTROYED' AND payload_ciphertext IS NULL AND key_ref IS NULL AND destroyed_at IS NOT NULL))
);
CREATE TABLE gym_private.deletion_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 subject_ref text NOT NULL,
 trigger_type text NOT NULL CHECK (trigger_type IN ('WITHDRAWAL','PURPOSE_END','SENSITIVE_CONTENT','RETENTION_END')),
 target_scope text NOT NULL,
 status text NOT NULL CHECK (status IN ('REQUESTED','BLOCKED_ACCESS','PURGING','COMPLETED','EXCEPTION')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 target_complete_at timestamptz NOT NULL,
 completed_at timestamptz,
 exception_reason_code text,
 responsible_ref text,
 exception_end_condition text,
 CHECK (status<>'EXCEPTION' OR (exception_reason_code IS NOT NULL AND responsible_ref IS NOT NULL AND exception_end_condition IS NOT NULL))
);
CREATE TABLE gym_private.deletion_manifest (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id bigint NOT NULL REFERENCES gym_private.deletion_requests,
 resource_type text NOT NULL,
 opaque_resource_ref text NOT NULL,
 kms_key_ref text,
 access_blocked_at timestamptz,
 key_destroyed_at timestamptz,
 live_deleted_at timestamptz,
 backup_rotation_due_at timestamptz,
 backup_purged_at timestamptz,
 UNIQUE(request_id,resource_type,opaque_resource_ref)
);
CREATE TABLE job_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_type text NOT NULL CHECK (job_type IN ('MIDNIGHT_STREAK','PT_SETTLEMENT','NOTIFICATIONS','PURGE','RESTORE_RECONCILIATION','CONGESTION')),
 operation_key text NOT NULL UNIQUE,
 status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 last_success_at timestamptz,
 error_code text
);

CREATE FUNCTION derive_visit_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.checked_in_at>clock_timestamp() THEN RAISE EXCEPTION 'Future attendance is not allowed'; END IF;
 NEW.attendance_date := (NEW.checked_in_at AT TIME ZONE 'Asia/Seoul')::date;
 RETURN NEW;
END;
$$;
CREATE TRIGGER visit_date BEFORE INSERT OR UPDATE OF checked_in_at ON visits
 FOR EACH ROW EXECUTE FUNCTION derive_visit_date();

CREATE FUNCTION guard_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE finish timestamptz;
BEGIN
 SELECT ends_at INTO STRICT finish FROM gym.pt_bookings WHERE id=NEW.booking_id;
 IF NEW.created_at<finish OR clock_timestamp()<finish THEN RAISE EXCEPTION 'Journal requires a finished lesson'; END IF;
 IF TG_OP='UPDATE' AND (NEW.author_trainer_id<>OLD.author_trainer_id OR NEW.booking_id<>OLD.booking_id OR NEW.member_id<>OLD.member_id) THEN
  RAISE EXCEPTION 'Journal author and booking cannot be reassigned';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER journal_guard BEFORE INSERT OR UPDATE ON pt_journals
 FOR EACH ROW EXECUTE FUNCTION guard_journal();

-- DB 소유자와 별개인 파기 작업 역할만 만료/탈퇴 대상 이력을 정정·삭제할 수 있다.
-- 파기 작업 역할에 부여할 EXECUTE/테이블 권한은 실제 배포 역할에 맞춰 별도 구성한다.
-- 존재하지 않는 역할을 조회하면 오류가 나므로 카탈로그에서 검증 후 확인한다.
CREATE FUNCTION protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purge_role oid;
BEGIN
 SELECT oid INTO purge_role FROM pg_roles WHERE rolname='gym_purger';
 IF purge_role IS NOT NULL AND pg_has_role(purge_role,'MEMBER') THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'History is append-only; use a correction entry or authorized privacy purge';
END;
$$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['visit_revisions','pt_booking_events','pt_credit_entries','pt_charge_exceptions',
 'streak_evaluations','membership_adjustments','pt_pass_adjustments','pt_journal_revisions','post_revisions','audit_events'] LOOP
  EXECUTE format('CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON gym.%I FOR EACH ROW EXECUTE FUNCTION gym.protect_history()',t);
 END LOOP;
END;
$$;

CREATE INDEX visits_month ON visits(member_id,attendance_date) WHERE status='VALID';
CREATE INDEX occupancy_expiry ON occupancy_windows(ends_at,member_id) WHERE status='VALID';
CREATE INDEX pt_pass_selection ON pt_passes(member_id,current_expires_on,id) WHERE status='REGISTERED';
CREATE INDEX booking_member_time ON pt_bookings(member_id,starts_at);
CREATE INDEX booking_settlement_due ON pt_bookings(charge_due_at,id);
CREATE INDEX credit_pass_time ON pt_credit_entries(pt_pass_id,created_at);
CREATE INDEX evaluations_member_date ON streak_evaluations(member_id,business_date,revision DESC);
CREATE INDEX notification_job_due ON notification_jobs(scheduled_at,id) WHERE status='PENDING';
CREATE INDEX push_due ON push_deliveries(next_attempt_at,id) WHERE status IN ('PENDING','FAILED');
CREATE INDEX notifications_inbox ON notifications(recipient_account_id,visible_at DESC);
CREATE INDEX notifications_purge ON notifications(purge_after);
CREATE INDEX post_title_search ON posts USING gin(title gin_trgm_ops);
CREATE INDEX published_posts ON posts(type,pinned DESC,published_at DESC) WHERE status='PUBLISHED';
CREATE INDEX sessions_account ON account_sessions(account_id) WHERE revoked_at IS NULL;
CREATE INDEX access_log_purge ON gym_private.access_logs(purge_after);
CREATE INDEX retained_record_purge ON gym_private.retained_records(retain_until) WHERE status='RETAINED';

CREATE VIEW current_congestion AS
 SELECT count(DISTINCT member_id) AS estimated_members,statement_timestamp() AS calculated_at
 FROM occupancy_windows WHERE status='VALID'
 AND starts_at<=statement_timestamp() AND statement_timestamp()<ends_at;
CREATE VIEW member_attendance_days AS
 SELECT member_id,attendance_date,bool_or(reward_eligible) AS reward_eligible
 FROM visits WHERE status='VALID' GROUP BY member_id,attendance_date;
CREATE VIEW pt_pass_balances AS
 SELECT id,member_id,starts_on,current_expires_on,balance,held_count,balance-held_count AS available_count,status
 FROM pt_passes;
CREATE VIEW current_streak_evaluations AS
 SELECT DISTINCT ON (member_id,business_date) * FROM streak_evaluations
 ORDER BY member_id,business_date,revision DESC;

COMMENT ON TABLE occupancy_windows IS '입장 후 2시간 추정 구간. 실제 퇴장·운동시간이 아니다.';
COMMENT ON TABLE visits IS '새 날짜 출석과 재입장 기록. 혼잡도 구간과 독립.';
COMMENT ON TABLE pt_passes IS '시설 회원권과 독립된 PT 계약별 유효기간·잔액·확보 요약.';
COMMENT ON TABLE streak_evaluations IS '휴회·휴무는 카운트 보존. 재판정은 revision 증가.';
COMMENT ON SCHEMA gym_private IS '분리보존·접속기록·파기 대장. 일반 서비스 계정 접근 금지.';
REVOKE ALL ON SCHEMA gym,gym_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA gym,gym_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gym,gym_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA gym,gym_private FROM PUBLIC;
COMMIT;

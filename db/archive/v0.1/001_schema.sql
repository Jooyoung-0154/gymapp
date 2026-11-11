-- PostgreSQL 15+ / 신규 전용 스키마. 운영 정책은 자동 승인하지 않는다.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA gym;
SET LOCAL search_path = gym, public;

CREATE TABLE accounts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 auth_subject text NOT NULL UNIQUE,
 display_name text NOT NULL,
 status text NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_roles (
 account_id bigint REFERENCES accounts ON DELETE RESTRICT,
 role text CHECK (role IN ('MEMBER','OPERATOR','TRAINER')),
 PRIMARY KEY (account_id, role)
);
CREATE TABLE gym_settings (
 id smallint PRIMARY KEY CHECK (id = 1),
 name text NOT NULL,
 timezone text NOT NULL,
 congestion_capacity integer CHECK (congestion_capacity > 0),
 congestion_thresholds jsonb,
 stale_after_seconds integer CHECK (stale_after_seconds > 0),
 updated_by bigint REFERENCES accounts,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE members (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint UNIQUE REFERENCES accounts,
 display_name text NOT NULL,
 status text NOT NULL CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
 registered_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trainers (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint UNIQUE REFERENCES accounts,
 display_name text NOT NULL,
 status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE business_policy_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 effective_from timestamptz NOT NULL,
 effective_until timestamptz,
 status text NOT NULL CHECK (status IN ('DRAFT','APPROVED')),
 policy_values jsonb NOT NULL CHECK (jsonb_typeof(policy_values) = 'object'),
 approved_by bigint REFERENCES accounts,
 approved_at timestamptz,
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 EXCLUDE USING gist (tstzrange(effective_from,effective_until,'[)') WITH &&)
  WHERE (status = 'APPROVED')
);
CREATE TABLE operating_calendar (
 business_date date PRIMARY KEY,
 day_type text NOT NULL CHECK (day_type IN ('OPEN','CLOSED')),
 opens_at timestamptz,
 closes_at timestamptz,
 reason text,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 changed_by bigint NOT NULL REFERENCES accounts,
 CHECK ((day_type = 'OPEN' AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
     OR (day_type = 'CLOSED' AND opens_at IS NULL AND closes_at IS NULL))
);
CREATE TABLE checkin_devices (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL,
 credential_ref text NOT NULL UNIQUE,
 status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
 revoked_at timestamptz,
 last_seen_at timestamptz,
 CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)
);
CREATE TABLE member_qr_credentials (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 token_hash text NOT NULL UNIQUE,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 CHECK (expires_at IS NULL OR expires_at > issued_at)
);
CREATE TABLE visits (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 device_id bigint REFERENCES checkin_devices,
 checked_in_at timestamptz NOT NULL,
 attendance_date date NOT NULL,
 congestion_until timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('VALID','VOID')),
 source text NOT NULL CHECK (source IN ('QR','MANUAL')),
 recorded_by bigint REFERENCES accounts,
 correction_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (congestion_until - checked_in_at = interval '2 hours'),
 CHECK (source <> 'QR' OR device_id IS NOT NULL),
 CHECK (source <> 'MANUAL' OR (recorded_by IS NOT NULL AND length(trim(correction_reason)) > 0 AND correction_reason IS NOT NULL)),
 EXCLUDE USING gist (member_id WITH =, tstzrange(checked_in_at,congestion_until,'[)') WITH &&)
  WHERE (status = 'VALID')
);
CREATE TABLE checkin_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id bigint NOT NULL REFERENCES checkin_devices,
 request_key text NOT NULL,
 payload_fingerprint text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 result_code text NOT NULL CHECK (result_code IN ('PROCESSING','SUCCESS','DUPLICATE','REJECTED')),
 visit_id bigint REFERENCES visits,
 processed_at timestamptz,
 UNIQUE (device_id, request_key),
 CHECK (result_code NOT IN ('SUCCESS','DUPLICATE') OR visit_id IS NOT NULL),
 CHECK (result_code = 'PROCESSING' OR processed_at IS NOT NULL)
);
CREATE TABLE visit_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 visit_id bigint NOT NULL REFERENCES visits,
 actor_account_id bigint NOT NULL REFERENCES accounts,
 changed_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 before_values jsonb NOT NULL,
 after_values jsonb NOT NULL
);
CREATE TABLE memberships (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 starts_on date NOT NULL,
 original_expires_on date NOT NULL,
 current_expires_on date NOT NULL,
 status text NOT NULL CHECK (status IN ('REGISTERED','SUSPENDED','CANCELLED')),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 CHECK (original_expires_on >= starts_on),
 CHECK (current_expires_on >= starts_on),
 UNIQUE (id, member_id)
);
CREATE TABLE pause_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 membership_id bigint NOT NULL REFERENCES memberships,
 requested_from date NOT NULL,
 requested_until date NOT NULL,
 approved_from date,
 approved_until date,
 status text NOT NULL CHECK (status IN ('REQUESTED','APPROVED','REJECTED','CANCELLED','ACTIVE','ENDED')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by bigint REFERENCES accounts,
 decided_at timestamptz,
 decision_reason text,
 started_at timestamptz,
 ended_at timestamptz,
 policy_version_id bigint REFERENCES business_policy_versions,
 CHECK (requested_until >= requested_from),
 CHECK ((approved_from IS NULL AND approved_until IS NULL)
     OR (approved_from IS NOT NULL AND approved_until IS NOT NULL AND approved_until >= approved_from)),
 CHECK (status NOT IN ('APPROVED','ACTIVE','ENDED') OR
  (approved_from IS NOT NULL AND approved_until IS NOT NULL AND decided_by IS NOT NULL
   AND decided_at IS NOT NULL AND policy_version_id IS NOT NULL))
);
-- 휴회 종료일 포함 정책은 미정: 겹침 검사는 승인된 정책으로 서비스 트랜잭션에서 수행.
CREATE TABLE trainer_assignments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 trainer_id bigint NOT NULL REFERENCES trainers,
 effective_from timestamptz NOT NULL,
 effective_until timestamptz,
 changed_by bigint NOT NULL REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 UNIQUE (id,member_id,trainer_id),
 EXCLUDE USING gist (member_id WITH =, tstzrange(effective_from,effective_until,'[)') WITH &&)
);
CREATE TABLE trainer_availability (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 trainer_id bigint NOT NULL REFERENCES trainers,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 kind text NOT NULL CHECK (kind IN ('AVAILABLE','BLOCKED')),
 reason text,
 created_by bigint NOT NULL REFERENCES accounts,
 CHECK (ends_at > starts_at)
);
CREATE TABLE pt_bookings (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 trainer_id bigint NOT NULL REFERENCES trainers,
 assignment_id bigint NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('REQUESTED','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW','REJECTED')),
 -- 승인 대기 시간 점유 여부는 승인 정책을 보고 서버가 명시한다.
 occupies_slot boolean NOT NULL,
 policy_version_id bigint NOT NULL REFERENCES business_policy_versions,
 booked_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz,
 cancellation_kind text CHECK (cancellation_kind IN ('ON_TIME','LATE','OPERATOR')),
 cancelled_by bigint REFERENCES accounts,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 UNIQUE (id,member_id),
 FOREIGN KEY (assignment_id,member_id,trainer_id)
  REFERENCES trainer_assignments(id,member_id,trainer_id),
 CHECK (ends_at - starts_at = interval '1 hour'),
 CHECK (status <> 'CONFIRMED' OR occupies_slot),
 CHECK (status NOT IN ('CANCELLED','REJECTED') OR NOT occupies_slot),
 CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_kind IS NOT NULL)),
 EXCLUDE USING gist (trainer_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
  WHERE (occupies_slot)
);
CREATE TABLE pt_booking_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id bigint NOT NULL REFERENCES pt_bookings,
 event_type text NOT NULL,
 before_values jsonb,
 after_values jsonb NOT NULL,
 actor_account_id bigint REFERENCES accounts,
 reason text,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pt_lessons (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id bigint NOT NULL UNIQUE REFERENCES pt_bookings,
 outcome text NOT NULL CHECK (outcome IN ('COMPLETED','NO_SHOW')),
 processed_by bigint NOT NULL REFERENCES accounts,
 processed_at timestamptz NOT NULL DEFAULT now(),
 note text
);
CREATE TABLE pt_accounts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL UNIQUE REFERENCES members,
 balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
 held_count integer NOT NULL DEFAULT 0 CHECK (held_count >= 0 AND held_count <= balance),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 UNIQUE (id,member_id)
);
CREATE TABLE pt_credit_entries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 pt_account_id bigint NOT NULL,
 member_id bigint NOT NULL,
 booking_id bigint,
 kind text NOT NULL CHECK (kind IN ('GRANT','CONSUME','RESTORE','ADJUST')),
 delta integer NOT NULL CHECK (delta <> 0),
 balance_before integer NOT NULL CHECK (balance_before >= 0),
 balance_after integer NOT NULL CHECK (balance_after >= 0),
 reversal_of_id bigint UNIQUE REFERENCES pt_credit_entries,
 operation_key text NOT NULL UNIQUE,
 actor_account_id bigint REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (pt_account_id,member_id) REFERENCES pt_accounts(id,member_id),
 FOREIGN KEY (booking_id,member_id) REFERENCES pt_bookings(id,member_id),
 CHECK (balance_after = balance_before + delta),
 CHECK (kind <> 'GRANT' OR delta > 0),
 CHECK (kind <> 'CONSUME' OR (delta = -1 AND booking_id IS NOT NULL)),
 CHECK (kind <> 'RESTORE' OR (delta = 1 AND reversal_of_id IS NOT NULL))
);
CREATE UNIQUE INDEX pt_one_base_consumption ON pt_credit_entries(booking_id) WHERE kind = 'CONSUME';
CREATE TABLE pt_holds (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id bigint NOT NULL UNIQUE,
 pt_account_id bigint NOT NULL,
 member_id bigint NOT NULL,
 quantity integer NOT NULL DEFAULT 1 CHECK (quantity = 1),
 status text NOT NULL CHECK (status IN ('HELD','RELEASED','CONSUMED')),
 held_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 FOREIGN KEY (booking_id,member_id) REFERENCES pt_bookings(id,member_id),
 FOREIGN KEY (pt_account_id,member_id) REFERENCES pt_accounts(id,member_id),
 CHECK ((status = 'HELD' AND resolved_at IS NULL) OR (status <> 'HELD' AND resolved_at IS NOT NULL))
);
CREATE TABLE reward_policies (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 version_no integer NOT NULL UNIQUE CHECK (version_no > 0),
 effective_from date NOT NULL,
 effective_until date,
 required_days integer NOT NULL CHECK (required_days = 10),
 reward_days integer NOT NULL CHECK (reward_days = 1),
 status text NOT NULL CHECK (status IN ('DRAFT','APPROVED')),
 business_policy_version_id bigint NOT NULL REFERENCES business_policy_versions,
 CHECK (effective_until IS NULL OR effective_until > effective_from),
 EXCLUDE USING gist (daterange(effective_from,effective_until,'[)') WITH &&) WHERE (status = 'APPROVED')
);
CREATE TABLE reward_cycles (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 policy_id bigint NOT NULL REFERENCES reward_policies,
 cycle_no integer NOT NULL CHECK (cycle_no > 0),
 starts_on date NOT NULL,
 completed_on date,
 status text NOT NULL CHECK (status IN ('IN_PROGRESS','QUALIFIED','CLOSED','REVIEW_REQUIRED')),
 counted_days integer NOT NULL CHECK (counted_days BETWEEN 0 AND 10),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 UNIQUE (member_id,policy_id,cycle_no),
 UNIQUE (id,member_id,policy_id),
 CHECK (completed_on IS NULL OR completed_on >= starts_on)
);
CREATE TABLE streak_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 policy_id bigint NOT NULL REFERENCES reward_policies,
 cycle_id bigint,
 business_date date,
 event_type text NOT NULL CHECK (event_type IN ('ATTEND','ABSENCE_RESET','PAUSE_RESET','COMPLETE','CORRECTION')),
 count_before integer NOT NULL CHECK (count_before BETWEEN 0 AND 10),
 count_after integer NOT NULL CHECK (count_after BETWEEN 0 AND 10),
 visit_id bigint REFERENCES visits,
 pause_request_id bigint REFERENCES pause_requests,
 calendar_revision integer,
 operation_key text NOT NULL UNIQUE,
 policy_version_id bigint NOT NULL REFERENCES business_policy_versions,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (cycle_id,member_id,policy_id) REFERENCES reward_cycles(id,member_id,policy_id),
 CHECK (event_type <> 'ATTEND' OR (business_date IS NOT NULL AND visit_id IS NOT NULL)),
 CHECK (event_type <> 'PAUSE_RESET' OR pause_request_id IS NOT NULL)
);
CREATE UNIQUE INDEX streak_one_attendance_day ON streak_events(member_id,policy_id,business_date) WHERE event_type = 'ATTEND';
CREATE TABLE reward_grants (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 cycle_id bigint NOT NULL UNIQUE,
 member_id bigint NOT NULL,
 policy_id bigint NOT NULL,
 membership_id bigint,
 status text NOT NULL CHECK (status IN ('PENDING','APPLIED','REVIEW_REQUIRED','REVERSED')),
 granted_days integer NOT NULL CHECK (granted_days = 1),
 qualified_at timestamptz NOT NULL,
 applied_at timestamptz,
 reviewed_by bigint REFERENCES accounts,
 reason text,
 UNIQUE (id,membership_id),
 FOREIGN KEY (cycle_id,member_id,policy_id) REFERENCES reward_cycles(id,member_id,policy_id),
 FOREIGN KEY (membership_id,member_id) REFERENCES memberships(id,member_id),
 CHECK (status <> 'APPLIED' OR (membership_id IS NOT NULL AND applied_at IS NOT NULL))
);
CREATE TABLE membership_adjustments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 membership_id bigint NOT NULL REFERENCES memberships,
 kind text NOT NULL CHECK (kind IN ('PAUSE','REWARD','MANUAL','REVERSAL')),
 delta_days integer NOT NULL CHECK (delta_days <> 0),
 before_expires_on date NOT NULL,
 after_expires_on date NOT NULL,
 pause_request_id bigint REFERENCES pause_requests,
 reward_grant_id bigint,
 reversal_of_id bigint UNIQUE REFERENCES membership_adjustments,
 operation_key text NOT NULL UNIQUE,
 policy_version_id bigint NOT NULL REFERENCES business_policy_versions,
 actor_account_id bigint REFERENCES accounts,
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 applied_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (reward_grant_id,membership_id) REFERENCES reward_grants(id,membership_id),
 CHECK (after_expires_on = before_expires_on + delta_days),
 CHECK (kind <> 'PAUSE' OR (pause_request_id IS NOT NULL AND delta_days > 0)),
 CHECK (kind <> 'REWARD' OR (reward_grant_id IS NOT NULL AND delta_days = 1)),
 CHECK (kind <> 'REVERSAL' OR reversal_of_id IS NOT NULL)
);
CREATE UNIQUE INDEX one_pause_extension ON membership_adjustments(pause_request_id) WHERE kind = 'PAUSE';
CREATE UNIQUE INDEX one_reward_extension ON membership_adjustments(reward_grant_id) WHERE kind = 'REWARD';
CREATE TABLE posts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 type text NOT NULL CHECK (type IN ('NOTICE','TIP')),
 title text NOT NULL CHECK (length(trim(title)) > 0),
 body text NOT NULL,
 status text NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','UNPUBLISHED')),
 author_account_id bigint NOT NULL REFERENCES accounts,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
);
CREATE TABLE notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id bigint NOT NULL REFERENCES members,
 membership_id bigint,
 booking_id bigint,
 event_type text NOT NULL CHECK (event_type IN ('MEMBERSHIP_EXPIRY','PT_REMINDER','PT_CHANGED','PT_CANCELLED')),
 channel text CHECK (channel IN ('IN_APP','PUSH','SMS','EMAIL')),
 scheduled_at timestamptz,
 status text NOT NULL CHECK (status IN ('UNCONFIGURED','PENDING','SENDING','SENT','FAILED','CANCELLED')),
 dedupe_key text NOT NULL UNIQUE,
 source_version integer NOT NULL CHECK (source_version > 0),
 sent_at timestamptz,
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 FOREIGN KEY (membership_id,member_id) REFERENCES memberships(id,member_id),
 FOREIGN KEY (booking_id,member_id) REFERENCES pt_bookings(id,member_id),
 CHECK (num_nonnulls(membership_id,booking_id) = 1),
 CHECK ((event_type = 'MEMBERSHIP_EXPIRY' AND membership_id IS NOT NULL) OR
        (event_type <> 'MEMBERSHIP_EXPIRY' AND booking_id IS NOT NULL)),
 CHECK (status NOT IN ('PENDING','SENDING','SENT') OR (channel IS NOT NULL AND scheduled_at IS NOT NULL)),
 CHECK (status <> 'SENT' OR sent_at IS NOT NULL)
);
CREATE TABLE notification_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 notification_id bigint NOT NULL REFERENCES notifications,
 attempt_no integer NOT NULL CHECK (attempt_no > 0),
 attempted_at timestamptz NOT NULL DEFAULT now(),
 result text NOT NULL CHECK (result IN ('ACCEPTED','FAILED','UNKNOWN')),
 provider_message_id text,
 error_code text,
 UNIQUE (notification_id,attempt_no)
);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_account_id bigint REFERENCES accounts,
 actor_type text NOT NULL CHECK (actor_type IN ('ACCOUNT','SYSTEM','DEVICE')),
 target_type text NOT NULL,
 target_id text NOT NULL,
 action text NOT NULL,
 reason text,
 before_values jsonb,
 after_values jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 request_id text
);

-- 원장 수정/삭제를 막는다. 정정은 반대 조정 행으로 추가한다.
CREATE FUNCTION deny_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Append-only history: % cannot be updated or deleted', TG_TABLE_NAME;
END;
$$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['visit_revisions','pt_booking_events','pt_credit_entries',
  'streak_events','membership_adjustments','notification_attempts','audit_logs'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON gym.%I FOR EACH ROW EXECUTE FUNCTION gym.deny_history_mutation()',t);
 END LOOP;
END;
$$;

-- 입장일은 설정된 헬스장 시간대에서 산출한다. 미설정 시 기록하지 않는다.
CREATE FUNCTION derive_visit_dates() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tz text;
BEGIN
 SELECT timezone INTO tz FROM gym.gym_settings WHERE id = 1;
 IF tz IS NULL THEN RAISE EXCEPTION 'gym_settings timezone must be configured'; END IF;
 NEW.attendance_date := (NEW.checked_in_at AT TIME ZONE tz)::date;
 NEW.congestion_until := NEW.checked_in_at + interval '120 minutes';
 RETURN NEW;
END;
$$;
CREATE TRIGGER visit_dates BEFORE INSERT OR UPDATE ON visits
 FOR EACH ROW EXECUTE FUNCTION derive_visit_dates();

CREATE INDEX visits_month ON visits(member_id,attendance_date) WHERE status = 'VALID';
CREATE INDEX visits_congestion ON visits(congestion_until,member_id) WHERE status = 'VALID';
CREATE INDEX memberships_member ON memberships(member_id,status);
CREATE INDEX pt_bookings_member ON pt_bookings(member_id,starts_at DESC);
CREATE INDEX pt_bookings_trainer ON pt_bookings(trainer_id,starts_at);
CREATE INDEX availability_trainer ON trainer_availability(trainer_id,starts_at);
CREATE INDEX pt_ledger_account ON pt_credit_entries(pt_account_id,created_at);
CREATE INDEX streak_member_date ON streak_events(member_id,business_date);
CREATE INDEX notification_due ON notifications(status,scheduled_at);
CREATE INDEX posts_list ON posts(type,published_at DESC) WHERE status = 'PUBLISHED';

-- 집계 뷰는 앱에 직접 공개하지 않는다. 개인 출석은 본인 권한을 별도로 확인한다.
CREATE VIEW current_congestion AS
 SELECT count(DISTINCT member_id) AS estimated_members,
 statement_timestamp() AS calculated_at
 FROM visits WHERE status = 'VALID'
 AND checked_in_at <= statement_timestamp()
 AND congestion_until > statement_timestamp();
CREATE VIEW member_attendance_days AS
 SELECT DISTINCT member_id,attendance_date FROM visits WHERE status = 'VALID';
CREATE VIEW pt_balances AS
 SELECT id,member_id,balance,held_count,balance-held_count AS available_count FROM pt_accounts;

-- 소유자 외 권한 부여는 인증 설계 확정 후 별도 마이그레이션으로 수행한다.
REVOKE ALL ON SCHEMA gym FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA gym FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gym FROM PUBLIC;
COMMIT;

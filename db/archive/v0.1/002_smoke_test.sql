-- 001 적용 후 개발 DB에서 실행. 모든 테스트 데이터는 마지막에 롤백한다.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = gym, public;
DO $$
DECLARE a bigint; m bigint; t bigint; p bigint; assignment bigint;
        n integer; booking bigint; caught boolean;
BEGIN
 INSERT INTO accounts(auth_subject,display_name,status)
 VALUES ('smoke-' || txid_current(), '검증 운영자','ACTIVE') RETURNING id INTO a;
 INSERT INTO gym_settings(id,name,timezone) VALUES (1,'검증 헬스장','Asia/Seoul')
 ON CONFLICT (id) DO NOTHING;
 INSERT INTO members(display_name,status) VALUES ('검증 회원','ACTIVE') RETURNING id INTO m;
 INSERT INTO trainers(display_name,status) VALUES ('검증 트레이너','ACTIVE') RETURNING id INTO t;
 INSERT INTO business_policy_versions(effective_from,status,policy_values)
 VALUES ('2030-01-01+09','DRAFT','{}') RETURNING id INTO p;
 INSERT INTO trainer_assignments(member_id,trainer_id,effective_from,changed_by,reason)
 VALUES (m,t,'2030-01-01+09',a,'테스트') RETURNING id INTO assignment;

 INSERT INTO visits(member_id,checked_in_at,status,source,recorded_by,correction_reason)
 VALUES (m,'2030-01-01 10:00+09','VALID','MANUAL',a,'테스트');
 caught := false;
 BEGIN
  INSERT INTO visits(member_id,checked_in_at,status,source,recorded_by,correction_reason)
  VALUES (m,'2030-01-01 11:00+09','VALID','MANUAL',a,'중복 테스트');
 EXCEPTION WHEN exclusion_violation THEN caught := true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: overlapping visit accepted'; END IF;
 SELECT count(*) INTO n FROM visits WHERE member_id=m AND status='VALID'
  AND checked_in_at <= '2030-01-01 12:00+09'::timestamptz
  AND congestion_until > '2030-01-01 12:00+09'::timestamptz;
 IF n <> 0 THEN RAISE EXCEPTION 'FAIL: exact two-hour boundary'; END IF;
 INSERT INTO visits(member_id,checked_in_at,status,source,recorded_by,correction_reason)
 VALUES (m,'2030-01-01 12:00+09','VALID','MANUAL',a,'구간 경계 테스트');

 INSERT INTO pt_bookings(member_id,trainer_id,assignment_id,starts_at,ends_at,status,occupies_slot,policy_version_id)
 VALUES (m,t,assignment,'2030-01-01 18:00+09','2030-01-01 19:00+09','CONFIRMED',true,p)
 RETURNING id INTO booking;
 caught := false;
 BEGIN
  INSERT INTO pt_bookings(member_id,trainer_id,assignment_id,starts_at,ends_at,status,occupies_slot,policy_version_id)
  VALUES (m,t,assignment,'2030-01-01 18:30+09','2030-01-01 19:30+09','CONFIRMED',true,p);
 EXCEPTION WHEN exclusion_violation THEN caught := true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: overlapping PT accepted'; END IF;
 INSERT INTO pt_bookings(member_id,trainer_id,assignment_id,starts_at,ends_at,status,occupies_slot,policy_version_id)
 VALUES (m,t,assignment,'2030-01-01 19:00+09','2030-01-01 20:00+09','CONFIRMED',true,p);
 caught := false;
 BEGIN
  INSERT INTO pt_accounts(member_id,balance,held_count) VALUES(m,1,2);
 EXCEPTION WHEN check_violation THEN caught := true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: over-hold accepted'; END IF;
 INSERT INTO pt_booking_events(booking_id,event_type,after_values) VALUES (booking,'TEST','{}');
 caught := false;
 BEGIN
  UPDATE pt_booking_events SET event_type='MUTATED' WHERE booking_id=booking;
 EXCEPTION WHEN raise_exception THEN caught := true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: history mutation accepted'; END IF;
 RAISE NOTICE 'PASS: visit overlap/boundary, PT overlap/adjacency, hold bounds, immutable history';
END;
$$;
ROLLBACK;

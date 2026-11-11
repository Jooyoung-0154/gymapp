-- 신규 v1.0 스키마 적용 후 개발 DB에서만 실행. 실제 데이터 변경은 ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = gym,public;
DO $$
DECLARE a bigint; a2 bigint; m bigint; m2 bigint; t bigint; t2 bigint;
 p bigint; pass bigint; assign bigint; assign2 bigint; slot bigint; overlap_slot bigint; other_slot bigint;
 b bigint; w bigint; n integer; contract bigint; journal bigint; caught boolean;
BEGIN
 INSERT INTO accounts(phone_lookup_hmac,phone_ciphertext,display_name_ciphertext,pii_key_ref,status)
 VALUES (convert_to('fixture-a-'||txid_current(),'UTF8'),'\x01','\x02','test-only','PENDING') RETURNING id INTO a;
 INSERT INTO accounts(phone_lookup_hmac,phone_ciphertext,display_name_ciphertext,pii_key_ref,status)
 VALUES (convert_to('fixture-b-'||txid_current(),'UTF8'),'\x03','\x04','test-only','PENDING') RETURNING id INTO a2;
 INSERT INTO members(account_id,status,approved_by,approved_at) VALUES(a,'ACTIVE',a,now()) RETURNING id INTO m;
 INSERT INTO members(account_id,status,approved_by,approved_at) VALUES(a2,'ACTIVE',a,now()) RETURNING id INTO m2;
 INSERT INTO trainers(account_id,status) VALUES(a,'ACTIVE') RETURNING id INTO t;
 INSERT INTO trainers(account_id,status) VALUES(a2,'ACTIVE') RETURNING id INTO t2;
 INSERT INTO policy_versions(version_name,effective_from,requirements_version,values_snapshot,changed_by,reason)
 VALUES('fixture-'||txid_current(),'2000-01-01+09','1.0','{}',a,'개발 DB 제약 검증') RETURNING id INTO p;
 INSERT INTO memberships(member_id,original_starts_on,original_expires_on,starts_on,current_expires_on,status,registered_by,policy_version_id)
 VALUES(m,'2020-01-01','2020-01-31','2020-01-01','2020-01-31','REGISTERED',a,p) RETURNING id INTO contract;
 caught:=false;
 BEGIN
  INSERT INTO memberships(member_id,original_starts_on,original_expires_on,starts_on,current_expires_on,status,registered_by,policy_version_id)
  VALUES(m,'2020-01-31','2020-02-28','2020-01-31','2020-02-28','REGISTERED',a,p);
 EXCEPTION WHEN exclusion_violation THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: inclusive membership overlap'; END IF;

 INSERT INTO occupancy_windows(member_id,starts_at,ends_at,status)
 VALUES(m,'2020-01-01 23:30+09','2020-01-02 01:30+09','VALID') RETURNING id INTO w;
 INSERT INTO visits(member_id,occupancy_window_id,checked_in_at,admission_kind,membership_id,reward_eligible,status,source,recorded_by,reason)
 VALUES(m,w,'2020-01-01 23:30+09','FACILITY',contract,true,'VALID','MANUAL',a,'장애 복구');
 INSERT INTO visits(member_id,occupancy_window_id,checked_in_at,admission_kind,membership_id,reward_eligible,status,source,recorded_by,reason)
 VALUES(m,w,'2020-01-02 00:05+09','FACILITY',contract,true,'VALID','MANUAL',a,'자정 재스캔');
 SELECT count(*) INTO n FROM member_attendance_days WHERE member_id=m;
 IF n<>2 THEN RAISE EXCEPTION 'FAIL: midnight rescan attendance'; END IF;
 SELECT count(*) INTO n FROM occupancy_windows WHERE member_id=m AND status='VALID'
 AND starts_at<='2020-01-02 01:30+09'::timestamptz AND ends_at>'2020-01-02 01:30+09'::timestamptz;
 IF n<>0 THEN RAISE EXCEPTION 'FAIL: exact two hour boundary'; END IF;
 caught:=false;
 BEGIN
  INSERT INTO occupancy_windows(member_id,starts_at,ends_at,status)
  VALUES(m,'2020-01-02 00:05+09','2020-01-02 02:05+09','VALID');
 EXCEPTION WHEN exclusion_violation THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: overlapping occupancy'; END IF;
 INSERT INTO occupancy_windows(member_id,starts_at,ends_at,status)
 VALUES(m,'2020-01-02 01:30+09','2020-01-02 03:30+09','VALID');

 INSERT INTO trainer_assignments(member_id,trainer_id,effective_from,changed_by,reason)
 VALUES(m,t,'2020-01-01+09',a,'배정') RETURNING id INTO assign;
 INSERT INTO trainer_assignments(member_id,trainer_id,effective_from,effective_until,changed_by,reason)
 VALUES(m,t2,'2019-01-01+09','2020-01-01+09',a,'이전 배정') RETURNING id INTO assign2;
 INSERT INTO pt_passes(member_id,starts_on,original_expires_on,current_expires_on,status,registered_by,policy_version_id)
 VALUES(m,'2020-01-01','2020-01-31','2020-01-31','REGISTERED',a,p) RETURNING id INTO pass;
 INSERT INTO trainer_slots(trainer_id,starts_at,ends_at,status,created_by)
 VALUES(t,'2020-01-02 18:00+09','2020-01-02 19:00+09','PUBLISHED',a) RETURNING id INTO slot;
 INSERT INTO trainer_slots(trainer_id,starts_at,ends_at,status,created_by)
 VALUES(t,'2020-01-02 18:30+09','2020-01-02 19:30+09','PUBLISHED',a) RETURNING id INTO overlap_slot;
 INSERT INTO trainer_slots(trainer_id,starts_at,ends_at,status,created_by)
 VALUES(t2,'2020-01-02 18:30+09','2020-01-02 19:30+09','PUBLISHED',a) RETURNING id INTO other_slot;
 INSERT INTO pt_bookings(member_id,trainer_id,assignment_id,slot_id,pt_pass_id,starts_at,ends_at,status,charge_due_at,policy_version_id)
 VALUES(m,t,assign,slot,pass,'2020-01-02 18:00+09','2020-01-02 19:00+09','CONFIRMED','2020-01-02 19:00+09',p) RETURNING id INTO b;
 caught:=false;
 BEGIN
  INSERT INTO pt_bookings(member_id,trainer_id,assignment_id,slot_id,pt_pass_id,starts_at,ends_at,status,charge_due_at,policy_version_id)
  VALUES(m,t,assign,overlap_slot,pass,'2020-01-02 18:30+09','2020-01-02 19:30+09','CONFIRMED','2020-01-02 19:30+09',p);
 EXCEPTION WHEN exclusion_violation THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: trainer overlap'; END IF;
 caught:=false;
 BEGIN
  INSERT INTO pt_bookings(member_id,trainer_id,assignment_id,slot_id,pt_pass_id,starts_at,ends_at,status,charge_due_at,policy_version_id)
  VALUES(m,t2,assign2,other_slot,pass,'2020-01-02 18:30+09','2020-01-02 19:30+09','CONFIRMED','2020-01-02 19:30+09',p);
 EXCEPTION WHEN exclusion_violation THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: member overlap'; END IF;
 caught:=false;
 BEGIN
  UPDATE pt_passes SET held_count=1 WHERE id=pass;
 EXCEPTION WHEN check_violation THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: over-hold'; END IF;
 caught:=false;
 BEGIN
  INSERT INTO streak_evaluations(member_id,business_date,revision,verdict,count_before,count_after,policy_version_id,evidence,operation_key)
  VALUES(m,'2020-01-03',1,'PAUSE_SKIP',7,0,p,'{}','fixture-pause-'||txid_current());
 EXCEPTION WHEN check_violation THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: pause reset accepted'; END IF;
 INSERT INTO streak_evaluations(member_id,business_date,revision,verdict,count_before,count_after,policy_version_id,evidence,operation_key)
 VALUES(m,'2020-01-03',1,'PAUSE_SKIP',7,7,p,'{}','fixture-pause-'||txid_current());

 INSERT INTO pt_journals(booking_id,member_id,author_trainer_id,body_ciphertext,body_char_count,encryption_key_ref,status)
 VALUES(b,m,t,'\x01',5,'test-journal-key','VISIBLE') RETURNING id INTO journal;
 caught:=false;
 BEGIN
  UPDATE pt_journals SET author_trainer_id=t2 WHERE id=journal;
 EXCEPTION WHEN raise_exception THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: journal author reassignment'; END IF;
 RAISE NOTICE 'PASS: membership boundary, midnight attendance, occupancy, PT overlaps, hold bounds, pause preservation, journal author';
END;
$$;
ROLLBACK;

// [목적] QR 발급과 등록 스캐너의 입장 처리를 담당합니다. 회원 잠금 안에서 QR 소비·방문·혼잡도 구간을 함께 확정합니다.
package kr.gym;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
class CheckinService {
    private final JdbcTemplate db;
    private final SecurityTools crypto;
    private final FacilityService facility;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    CheckinService(JdbcTemplate db,SecurityTools crypto,FacilityService facility) { this(db,crypto,facility,Clock.systemUTC()); }
    CheckinService(JdbcTemplate db,SecurityTools crypto,FacilityService facility,Clock clock) { this.db=db;this.crypto=crypto;this.facility=facility;this.clock=clock; }
    record Admission(String membershipId,String bookingId) {}
    private static void role(AuthService.Actor actor,String role) {
        if(actor==null || !actor.roles().contains(role)) throw new ApiError(403,"ACCESS_DENIED","이 기능을 사용할 권한이 없습니다.");
    }
    // [기능] 계정·회원 행을 함께 잠가 승인·정지·입장 요청이 같은 회원 상태를 기준으로 처리되도록 합니다.
    private Map<String,Object> member(String accountId) {
        var rows=db.queryForList("SELECT m.id member_id,a.id account_id,a.display_name_ciphertext,a.phone_ciphertext FROM gym.accounts a JOIN gym.members m ON m.account_id=a.id WHERE a.id=?::bigint AND a.status='ACTIVE' AND m.status='ACTIVE' FOR UPDATE OF a,m",accountId);
        if(rows.isEmpty()) throw new ApiError(403,"MEMBER_NOT_ACTIVE","승인된 회원만 입장할 수 있습니다.");
        return rows.getFirst();
    }
    private Admission admission(String memberId,Instant now) {
        LocalDate today=CheckinRules.today(now);
        if(!db.queryForList("SELECT id FROM gym.pause_requests WHERE member_id=?::bigint AND status IN ('APPROVED','ACTIVE','ENDED') AND actual_from<=?::date AND actual_until>=?::date",memberId,today.toString(),today.toString()).isEmpty()) throw new ApiError(409,"MEMBERSHIP_PAUSED","현재 휴회 기간으로 입장할 수 없습니다.");
        var passes=db.queryForList("SELECT id FROM gym.memberships WHERE member_id=?::bigint AND status='REGISTERED' AND starts_on<=?::date AND current_expires_on>=?::date",memberId,today.toString(),today.toString());
        if(!passes.isEmpty()) return new Admission(passes.getFirst().get("id").toString(),null);
        var bookings=db.queryForList("SELECT b.id FROM gym.pt_bookings b JOIN gym.pt_passes p ON p.id=b.pt_pass_id WHERE b.member_id=?::bigint AND b.status='CONFIRMED' AND b.starts_at<=? AND b.ends_at>? AND p.status='REGISTERED' AND p.starts_on<=?::date AND p.current_expires_on>=?::date ORDER BY b.starts_at LIMIT 1",memberId,Timestamp.from(now.plusSeconds(1800)),Timestamp.from(now),today.toString(),today.toString());
        if(!bookings.isEmpty()) return new Admission(null,bookings.getFirst().get("id").toString());
        throw new ApiError(409,"NO_VALID_MEMBERSHIP","유효한 시설 이용권이나 입장 가능한 PT 예약이 없습니다.");
    }
    AuthService.Reply issue(AuthService.Actor actor) {
        role(actor,"MEMBER");
        Instant now=clock.instant();
        var member=member(actor.id());
        facility.requireOpen(now);
        admission(member.get("member_id").toString(),now);
        String token="gymqr:"+crypto.randomToken();
        Long id=db.queryForObject("INSERT INTO gym.member_qr_credentials(member_id,session_id,token_hash,issued_at,expires_at) VALUES(?::bigint,?::bigint,?,?,?) RETURNING id",Long.class,member.get("member_id").toString(),actor.sessionId(),crypto.fingerprint("qr:"+token),Timestamp.from(now),Timestamp.from(now.plusSeconds(60)));
        return AuthService.Reply.ok(Map.of("credentialId",id.toString(),"token",token,"serverTime",now.toString(),"expiresAt",now.plusSeconds(60).toString(),"refreshAfterSeconds",30));
    }
    AuthService.Reply status(AuthService.Actor actor,String credentialId) {
        role(actor,"MEMBER");AuthService.id(credentialId);
        var rows=db.queryForList("SELECT q.used_at,q.revoked_at,q.expires_at FROM gym.member_qr_credentials q JOIN gym.members m ON m.id=q.member_id WHERE q.id=?::bigint AND q.session_id=?::bigint AND m.account_id=?::bigint",credentialId,actor.sessionId(),actor.id());
        if(rows.isEmpty()) throw new ApiError(404,"QR_NOT_FOUND","발급된 QR을 찾지 못했습니다.");
        var row=rows.getFirst();
        return AuthService.Reply.ok(Map.of("used",row.get("used_at")!=null,"expired",!instant(row.get("expires_at")).isAfter(clock.instant()),"revoked",row.get("revoked_at")!=null));
    }
    // [기능] 운영자 세션별 논리 스캐너를 등록합니다. 다른 세션·해제 기기는 입장 요청에 사용할 수 없습니다.
    AuthService.Reply registerDevice(AuthService.Actor actor) {
        role(actor,"OPERATOR");
        db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))","scanner-session:"+actor.sessionId());
        byte[] hash=crypto.fingerprint("scanner-session:"+actor.sessionId());
        var rows=db.queryForList("SELECT id,status FROM gym.checkin_devices WHERE credential_hash=? FOR UPDATE",hash);
        if(!rows.isEmpty()) {
            if(!"ACTIVE".equals(rows.getFirst().get("status"))) throw new ApiError(403,"DEVICE_REVOKED","해제된 입장 기기입니다.");
            return AuthService.Reply.ok(Map.of("deviceId",rows.getFirst().get("id").toString()));
        }
        Long id=db.queryForObject("INSERT INTO gym.checkin_devices(name,credential_hash,status,registered_by,last_seen_at) VALUES('운영자 QR 스캐너',?,'ACTIVE',?::bigint,now()) RETURNING id",Long.class,hash,actor.id());
        return AuthService.Reply.ok(Map.of("deviceId",id.toString()));
    }
    AuthService.Reply consume(AuthService.Actor actor,Map<String,Object> body,String requestKey) {
        role(actor,"OPERATOR");
        String deviceId=AuthService.id(AuthService.text(body,"deviceId",19));
        String token=AuthService.text(body,"qrToken",100).strip();
        if(!token.matches("gymqr:[A-Za-z0-9_-]{43}")) throw ApiError.invalid("올바른 입장 QR을 읽어 주세요.");
        var devices=db.queryForList("SELECT id FROM gym.checkin_devices WHERE id=?::bigint AND status='ACTIVE' AND registered_by=?::bigint AND credential_hash=?",deviceId,actor.id(),crypto.fingerprint("scanner-session:"+actor.sessionId()));
        if(devices.isEmpty()) throw new ApiError(403,"DEVICE_NOT_REGISTERED","이 로그인 세션에 등록된 스캐너가 아닙니다. 스캐너를 다시 시작해 주세요.");
        byte[] hash=crypto.fingerprint("qr:"+token);
        var credentials=db.queryForList("SELECT q.id,a.id account_id FROM gym.member_qr_credentials q JOIN gym.members m ON m.id=q.member_id JOIN gym.accounts a ON a.id=m.account_id WHERE q.token_hash=?",hash);
        if(credentials.isEmpty()) throw new ApiError(409,"QR_INVALID","유효한 입장 QR이 아닙니다.");
        var member=member(credentials.getFirst().get("account_id").toString());
        String memberId=member.get("member_id").toString();
        // [목적] 동일 회원의 다른 QR도 회원 잠금으로 직렬화해 방문·혼잡도를 중복 생성하지 않습니다.
        var rows=db.queryForList("SELECT q.id,q.used_at,q.revoked_at,q.expires_at,s.privilege FROM gym.member_qr_credentials q JOIN gym.account_sessions s ON s.id=q.session_id JOIN gym.accounts a ON a.id=s.account_id WHERE q.token_hash=? AND s.account_id=?::bigint AND s.revoked_at IS NULL AND s.security_version=a.security_version AND s.expires_at>? AND s.last_seen_at>?::timestamptz - CASE WHEN s.privilege='OPERATOR' THEN interval '30 minutes' ELSE interval '7 days' END FOR UPDATE OF q,s",hash,member.get("account_id").toString(),Timestamp.from(clock.instant()),Timestamp.from(clock.instant()));
        if(rows.isEmpty()) throw new ApiError(409,"QR_SESSION_ENDED","회원의 로그인이 종료되었습니다. 다시 로그인해 QR을 발급해 주세요.");
        Instant now=clock.instant();var qr=rows.getFirst();
        if(!CheckinRules.usable(instant(qr.get("expires_at")),instant(qr.get("used_at")),instant(qr.get("revoked_at")),now)) throw new ApiError(409,"QR_EXPIRED_OR_USED","만료되었거나 이미 사용한 QR입니다. 새 QR을 읽어 주세요.");
        facility.requireOpen(now);
        Admission admission=admission(memberId,now);
        LocalDate date=CheckinRules.today(now);
        var windows=db.queryForList("SELECT id FROM gym.occupancy_windows WHERE member_id=?::bigint AND status='VALID' AND starts_at<=? AND ends_at>?",memberId,Timestamp.from(now),Timestamp.from(now));
        Long windowId=windows.isEmpty()?db.queryForObject("INSERT INTO gym.occupancy_windows(member_id,starts_at,ends_at,status) VALUES(?::bigint,?,?,'VALID') RETURNING id",Long.class,memberId,Timestamp.from(now),Timestamp.from(now.plusSeconds(7200))):((Number)windows.getFirst().get("id")).longValue();
        var visits=db.queryForList("SELECT id,checked_in_at FROM gym.visits WHERE member_id=?::bigint AND occupancy_window_id=? AND attendance_date=?::date AND status='VALID'",memberId,windowId,date.toString());
        boolean duplicate=!visits.isEmpty();
        Long visitId=duplicate?((Number)visits.getFirst().get("id")).longValue():db.queryForObject("INSERT INTO gym.visits(member_id,occupancy_window_id,device_id,checked_in_at,attendance_date,admission_kind,membership_id,pt_booking_id,reward_eligible,status,source) VALUES(?::bigint,?,?::bigint,?,?::date,?,?::bigint,?::bigint,?,'VALID','QR') RETURNING id",Long.class,memberId,windowId,deviceId,Timestamp.from(now),date.toString(),admission.membershipId()!=null?"FACILITY":"PT_ONLY",admission.membershipId(),admission.bookingId(),admission.membershipId()!=null);
        db.update("UPDATE gym.member_qr_credentials SET used_at=? WHERE id=?",Timestamp.from(now),qr.get("id"));
        db.update("INSERT INTO gym.checkin_requests(device_id,request_key,payload_fingerprint,qr_credential_id,result_code,visit_id,received_at,processed_at) VALUES(?::bigint,?,?,?, ?,?,?,?)",deviceId,requestKey,hash,qr.get("id"),duplicate?"DUPLICATE":"SUCCESS",visitId,Timestamp.from(now),Timestamp.from(now));
        db.update("UPDATE gym.checkin_devices SET last_seen_at=? WHERE id=?::bigint",Timestamp.from(now),deviceId);
        return AuthService.Reply.ok(Map.of("accepted",true,"duplicate",duplicate,"memberName",crypto.decrypt((byte[])member.get("display_name_ciphertext")),"attendanceDate",date.toString(),"checkedInAt",now.toString(),"visitId",visitId.toString(),"admissionKind",admission.membershipId()!=null?"FACILITY":"PT_ONLY"));
    }
    private static Instant instant(Object value) { return value==null?null:((Timestamp)value).toInstant(); }
}

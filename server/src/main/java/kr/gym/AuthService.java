// [목적] AuthService.java 파일: 계정 로그인·운영자 추가 인증·회원 승인·일회용 코드·세션을 DB로 처리합니다. 변경 요청은 operation의 트랜잭션 안에서 실행됩니다.
package kr.gym;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AuthService {
    public record Actor(String id,String sessionId,List<String> roles) {}
    public record Reply(int status,Map<String,Object> data,String sessionToken) {
        static Reply ok(Map<String,Object> data) { return new Reply(200,data,null); }
    }
    private final JdbcTemplate db;
    private final SecurityTools crypto;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;
    private final String dummyHash;
    public AuthService(JdbcTemplate db,SecurityTools crypto,TransactionTemplate transactions,ObjectMapper json) {
        this.db=db;this.crypto=crypto;this.transactions=transactions;this.json=json;
        dummyHash=crypto.hashPassword(crypto.randomToken());
    }
    // [목적] operation 메서드: 같은 범위·경로·요청 키를 잠가 중복 실행을 방지합니다. 본문이 같으면 암호화해 저장한 결과를 재사용합니다.
    public Reply operation(String scope,String path,String key,Map<String,Object> body,Supplier<Reply> action) {
        if(key==null || !key.matches("[A-Za-z0-9_-]{20,100}")) throw new ApiError(400,"REQUEST_KEY_REQUIRED","요청 식별자가 필요합니다. 화면을 새로 열어 주세요.");
        byte[] hash=crypto.fingerprint(encode(new TreeMap<>(body)));
        return transactions.execute(status->{
            lock("operation:"+scope+":"+path+":"+key);
            var existing=db.queryForList("SELECT body_hash,response_ciphertext FROM gym.auth_operations WHERE scope=? AND path=? AND request_key=?",scope,path,key);
            if(!existing.isEmpty()) {
                var row=existing.getFirst();
                if(!MessageDigest.isEqual(hash,(byte[])row.get("body_hash"))) throw new ApiError(409,"IDEMPOTENCY_MISMATCH","이전 요청과 내용이 다릅니다. 다시 확인해 주세요.");
                try { return json.readValue(crypto.decrypt((byte[])row.get("response_ciphertext")),Reply.class); }
                catch(Exception e){throw new IllegalStateException("Stored result cannot be read",e);}
            }
            Reply reply;
            try { reply=action.get(); }
            catch(ApiError e) { reply=new Reply(e.status,Map.of("errorCode",e.code,"errorMessage",e.getMessage()),null); }
            db.update("INSERT INTO gym.auth_operations(scope,path,request_key,body_hash,response_ciphertext) VALUES(?,?,?,?,?)",scope,path,key,hash,crypto.encrypt(encode(reply)));
            return reply;
        });
    }
    // [기능] encode 메서드: 응답 또는 입력 객체를 JSON 문자열로 직렬화합니다.
    private String encode(Object value) { try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);} }
    // [기능] lock 메서드: 트랜잭션 종료까지 같은 키의 처리를 직렬화하는 PostgreSQL 잠금을 획득합니다.
    private void lock(String key) { db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",key); }
    // [기능] publicScope 메서드: 비로그인 요청의 출처와 식별값을 HMAC으로 묶어 중복 요청 처리 범위를 만듭니다.
    public String publicScope(String source,Map<String,Object> body) {
        String identity=Objects.toString(body.getOrDefault("challengeId",body.getOrDefault("phone","anonymous")));
        return "public:"+crypto.fingerprintHex(source+":"+identity);
    }
    // [기능] text 메서드: 필수 문자열의 타입·공백 여부·최대 길이를 검사합니다.
    static String text(Map<String,Object> body,String key,int max) {
        Object value=body.get(key);
        if(!(value instanceof String str) || str.isBlank() || str.length()>max) throw ApiError.invalid("입력한 내용을 확인해 주세요: "+key);
        return str;
    }
    // [기능] id 메서드: 대상 ID가 허용된 양의 정수 문자열인지 확인합니다.
    static String id(String value) { if(!value.matches("[1-9][0-9]{0,18}")) throw new ApiError(404,"NOT_FOUND","대상을 찾을 수 없습니다.");return value; }
    // [기능] live 메서드: 저장된 만료 시각이 현재보다 미래인지 검사합니다.
    static boolean live(Object timestamp) { return timestamp!=null && ((Timestamp)timestamp).toInstant().isAfter(Instant.now()); }
    // [기능] account 메서드: 계정을 조회하며 행 잠금을 걸어 같은 계정의 동시 변경을 제어합니다.
    private Map<String,Object> account(String id) {
        var rows=db.queryForList("SELECT * FROM gym.accounts WHERE id=?::bigint FOR UPDATE",id(id));
        if(rows.isEmpty()) throw new ApiError(404,"NOT_FOUND","대상을 찾을 수 없습니다.");return rows.getFirst();
    }
    // [기능] login 메서드: 전화번호·비밀번호·계정 상태와 실패 횟수를 검사합니다. 운영자는 추가 인증 도전을, 일반 회원은 세션을 발급받습니다.
    public Reply login(Map<String,Object> body,String source) {
        String phone;
        try {phone=SecurityTools.phone(text(body,"phone",40));}catch(ApiError e){throw ApiError.login();}
        String password=text(body,"password",256);
        byte[] fingerprint=crypto.fingerprint("phone:"+phone),sourceHash=crypto.fingerprint("source:"+source);
        lock("login:"+crypto.fingerprintHex(phone));
        var rows=db.queryForList("SELECT * FROM gym.accounts WHERE phone_lookup_hmac=? FOR UPDATE",fingerprint);
        var row=rows.isEmpty()?null:rows.getFirst();
        Integer attempts=db.queryForObject("SELECT count(*) FROM gym.login_attempts WHERE login_fingerprint=? AND NOT succeeded AND attempted_at>now()-interval '15 minutes'",Integer.class,fingerprint);
        Integer sources=db.queryForObject("SELECT count(*) FROM gym.login_attempts WHERE source_fingerprint=? AND attempted_at>now()-interval '15 minutes'",Integer.class,sourceHash);
        if(attempts>=5 || sources>=100 || (row!=null && live(row.get("locked_until")))) throw new ApiError(429,"LOGIN_LIMITED","잠시 후 다시 시도해 주세요.");
        boolean valid=crypto.matches(password,row!=null && row.get("password_hash")!=null?(String)row.get("password_hash"):dummyHash);
        if(row!=null && valid && "PENDING".equals(row.get("status"))) {
            recordAttempt(row.get("id").toString(),fingerprint,sourceHash,true);
            return Reply.ok(Map.of("approvalPending",true));
        }
        if(row==null || !valid || !"ACTIVE".equals(row.get("status"))) {
            failed(row,fingerprint,sourceHash);throw ApiError.login();
        }
        String accountId=row.get("id").toString();
        List<String> roles=roles(accountId);
        if(roles.contains("MEMBER") && !roles.contains("OPERATOR")) {
            Boolean active=db.queryForObject("SELECT EXISTS(SELECT 1 FROM gym.members WHERE account_id=?::bigint AND status='ACTIVE')",Boolean.class,accountId);
            if(!active) {failed(row,fingerprint,sourceHash);throw ApiError.login();}
        }
        recordAttempt(accountId,fingerprint,sourceHash,true);
        return session(row,roles.contains("OPERATOR"));
    }
    // [기능] roles 메서드: 계정에 부여된 역할 목록을 조회합니다.
    private List<String> roles(String accountId) { return db.queryForList("SELECT role FROM gym.account_roles WHERE account_id=?::bigint ORDER BY role",String.class,accountId); }
    // [기능] recordAttempt 메서드: 로그인 시도 결과와 검색용 지문을 기록합니다.
    private void recordAttempt(String accountId,byte[] fingerprint,byte[] source,boolean success) {
        db.update("INSERT INTO gym.login_attempts(account_id,login_fingerprint,source_fingerprint,succeeded,purge_after) VALUES(?::bigint,?,?,?,now()+interval '1 day')",accountId,fingerprint,source,success);
    }
    // [기능] failed 메서드: 실패 시도를 기록하고 최근 실패가 기준에 도달하면 계정을 일시 잠급니다.
    private void failed(Map<String,Object> account,byte[] fingerprint,byte[] source) {
        String accountId=account==null?null:account.get("id").toString();
        recordAttempt(accountId,fingerprint,source,false);
        if(account!=null) {
            Integer count=db.queryForObject("SELECT count(*) FROM gym.login_attempts WHERE login_fingerprint=? AND NOT succeeded AND attempted_at>now()-interval '15 minutes'",Integer.class,fingerprint);
            if(count>=5) db.update("UPDATE gym.accounts SET locked_until=now()+interval '15 minutes' WHERE id=?::bigint",accountId);
        }
    }
    // [기능] verifyMfa 메서드: 운영자 인증 도전의 만료·사용 여부와 계정 상태를 확인하고 TOTP 성공 시 세션을 발급합니다.
    public Reply verifyMfa(Map<String,Object> body,String source) {
        String challenge=text(body,"challengeId",100),code=text(body,"totp",20);
        var rows=db.queryForList("SELECT * FROM gym.auth_challenges WHERE id_hash=? FOR UPDATE",crypto.fingerprint("challenge:"+challenge));
        if(rows.isEmpty()) throw ApiError.login();var challengeRow=rows.getFirst();
        if(challengeRow.get("used_at")!=null || !live(challengeRow.get("expires_at")) || ((Number)challengeRow.get("attempts")).intValue()>=5) throw ApiError.login();
        var account=account(challengeRow.get("account_id").toString());
        if(!"ACTIVE".equals(account.get("status")) || live(account.get("locked_until")) || !account.get("security_version").equals(challengeRow.get("security_version")) || !roles(account.get("id").toString()).contains("OPERATOR")) throw ApiError.login();
        if(!acceptTotp(account.get("id").toString(),code)) {
            db.update("UPDATE gym.auth_challenges SET attempts=attempts+1 WHERE id_hash=?",crypto.fingerprint("challenge:"+challenge));
            failed(account,(byte[])account.get("phone_lookup_hmac"),crypto.fingerprint("source:"+source));throw ApiError.login();
        }
        db.update("UPDATE gym.auth_challenges SET used_at=now() WHERE id_hash=?",crypto.fingerprint("challenge:"+challenge));
        return session(account,true);
    }
    // [목적] acceptTotp 메서드: 등록된 비밀키로 TOTP를 검증하고 마지막 사용 구간을 갱신해 같은 번호의 재사용을 막습니다.
    private boolean acceptTotp(String accountId,String code) {
        var rows=db.queryForList("SELECT * FROM gym.mfa_enrollments WHERE account_id=?::bigint AND confirmed_at IS NOT NULL AND revoked_at IS NULL FOR UPDATE",accountId);
        if(rows.isEmpty())return false;var row=rows.getFirst();
        long last=row.get("last_accepted_time_step")==null?-1:((Number)row.get("last_accepted_time_step")).longValue();
        long step=SecurityTools.verifyTotp(crypto.decrypt((byte[])row.get("secret_ciphertext")),code,Instant.now(),last);
        if(step<0)return false;
        db.update("UPDATE gym.mfa_enrollments SET last_accepted_time_step=? WHERE id=?",step,row.get("id"));return true;
    }
    // [기능] session 메서드: 무작위 세션 토큰을 발급합니다. DB에는 토큰의 HMAC을 저장하고 권한별 만료 시간을 적용합니다.
    private Reply session(Map<String,Object> account,boolean operator) {
        String token=crypto.randomToken();String privilege=operator?"OPERATOR":"STANDARD";
        db.update("INSERT INTO gym.account_sessions(account_id,token_hash,privilege,security_version,last_seen_at,expires_at,mfa_verified_at,reauthenticated_at) VALUES(?,?,?, ?,now(),now()+CASE WHEN ? THEN interval '12 hours' ELSE interval '30 days' END,NULL,CASE WHEN ? THEN now() ELSE NULL END)",account.get("id"),crypto.fingerprint("session:"+token),privilege,account.get("security_version"),operator,operator);
        return new Reply(200,Map.of("mfaRequired",false),token);
    }
    // [목적] authenticate 메서드: 쿠키 토큰의 지문으로 유효 세션과 계정 상태를 조회하고 마지막 접근 시각을 갱신합니다.
    public Actor authenticate(String token) {
        if(token==null || token.length()>100)return null;
        var rows=db.queryForList("SELECT s.id session_id,s.account_id,s.privilege FROM gym.account_sessions s JOIN gym.accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND a.status='ACTIVE' AND s.security_version=a.security_version AND s.expires_at>now() AND s.last_seen_at>now()-CASE WHEN s.privilege='OPERATOR' THEN interval '30 minutes' ELSE interval '7 days' END",crypto.fingerprint("session:"+token));
        if(rows.isEmpty())return null;var row=rows.getFirst();
        String id=row.get("account_id").toString();List<String> roles=new ArrayList<>(roles(id));
        if(!"OPERATOR".equals(row.get("privilege")))roles.remove("OPERATOR");
        db.update("UPDATE gym.account_sessions SET last_seen_at=now() WHERE id=?",row.get("session_id"));
        return new Actor(id,row.get("session_id").toString(),roles);
    }
    // [기능] me 메서드: 인증된 계정의 이름·전화번호를 복호화해 계정 정보 응답을 만듭니다.
    public Reply me(Actor actor) {
        var row=db.queryForMap("SELECT id,phone_ciphertext,display_name_ciphertext,status FROM gym.accounts WHERE id=?::bigint",actor.id);
        return Reply.ok(Map.of("accountId",actor.id,"name",crypto.decrypt((byte[])row.get("display_name_ciphertext")),"phone",crypto.decrypt((byte[])row.get("phone_ciphertext")),"roles",actor.roles,"status",row.get("status"),"nicknameRequired",crypto.decrypt((byte[])row.get("display_name_ciphertext")).isBlank()));
    }
    // [기능] members 메서드: 최신 회원 최대 100명을 조회해 운영자 목록에 필요한 정보로 변환합니다.
    public Reply membership(Actor actor) {
        var rows=db.queryForList("SELECT p.id,p.starts_on,p.current_expires_on FROM gym.memberships p JOIN gym.members m ON m.id=p.member_id WHERE m.account_id=?::bigint AND p.status='REGISTERED' ORDER BY CASE WHEN p.starts_on<=?::date AND p.current_expires_on>=?::date THEN 0 WHEN p.starts_on>?::date THEN 1 ELSE 2 END,CASE WHEN p.starts_on>?::date THEN p.starts_on END ASC,p.starts_on DESC LIMIT 1",actor.id(),LocalDate.now(ZoneId.of("Asia/Seoul")).toString(),LocalDate.now(ZoneId.of("Asia/Seoul")).toString(),LocalDate.now(ZoneId.of("Asia/Seoul")).toString(),LocalDate.now(ZoneId.of("Asia/Seoul")).toString());
        if(rows.isEmpty()) return Reply.ok(Map.of("registered",false));
        var row=rows.getFirst();
        LocalDate start=LocalDate.parse(row.get("starts_on").toString()), end=LocalDate.parse(row.get("current_expires_on").toString()), today=LocalDate.now(ZoneId.of("Asia/Seoul"));
        return Reply.ok(Map.of("registered",true,"startsOn",start.toString(),"expiresOn",end.toString(),"remainingDays",Math.max(0,java.time.temporal.ChronoUnit.DAYS.between(today.isBefore(start)?start:today,end)+1),"status",today.isBefore(start)?"SCHEDULED":today.isAfter(end)?"EXPIRED":"ACTIVE"));
    }
    // [기능] registerMembership은 승인된 회원의 시설 이용권을 등록합니다. 회원 잠금과 기간 중복 검사로 중복 계약을 막습니다.
    public Reply registerMembership(Actor actor,String accountId,Map<String,Object> body) {
        if(actor==null || !actor.roles().contains("OPERATOR")) throw new ApiError(403,"FORBIDDEN","운영자만 등록할 수 있습니다.");
        id(accountId);
        LocalDate start,end;
        try { start=LocalDate.parse(text(body,"startsOn",10));end=LocalDate.parse(text(body,"expiresOn",10)); }
        catch(java.time.format.DateTimeParseException e) { throw ApiError.invalid("날짜는 YYYY-MM-DD 형식으로 입력해 주세요."); }
        if(start.getYear()<1900 || end.getYear()>2100 || end.isBefore(start)) throw ApiError.invalid("이용 시작일과 만료일을 확인해 주세요.");
        var members=db.queryForList("SELECT m.id FROM gym.members m JOIN gym.accounts a ON a.id=m.account_id WHERE a.id=?::bigint AND a.status='ACTIVE' AND m.status='ACTIVE' FOR UPDATE OF m",accountId);
        if(members.isEmpty()) throw new ApiError(409,"MEMBER_NOT_ACTIVE","승인된 회원에게만 이용권을 등록할 수 있습니다.");
        String memberId=members.getFirst().get("id").toString();
        if(!db.queryForList("SELECT id FROM gym.memberships WHERE member_id=?::bigint AND status='REGISTERED' AND starts_on<=?::date AND current_expires_on>=?::date",memberId,end.toString(),start.toString()).isEmpty()) throw new ApiError(409,"MEMBERSHIP_OVERLAP","기존 이용권과 기간이 겹칩니다.");
        lock("membership-policy");
        var policies=db.queryForList("SELECT id FROM gym.policy_versions WHERE effective_from<=now() AND (effective_until IS NULL OR effective_until>now())");
        if(policies.isEmpty()) {
            db.update("INSERT INTO gym.policy_versions(version_name,effective_from,requirements_version,values_snapshot,changed_by,reason) VALUES(?,now(),?,?::jsonb,?::bigint,?)", "facility-"+UUID.randomUUID(),"facility-membership-1","{\"membershipDatesInclusive\":true}",actor.id(),"시설 이용권 등록 기본 정책");
            policies=db.queryForList("SELECT id FROM gym.policy_versions WHERE effective_from<=now() AND (effective_until IS NULL OR effective_until>now())");
        }
        var membershipId=db.queryForObject("INSERT INTO gym.memberships(member_id,original_starts_on,original_expires_on,starts_on,current_expires_on,status,registered_by,policy_version_id) VALUES(?::bigint,?::date,?::date,?::date,?::date,'REGISTERED',?::bigint,?::bigint) RETURNING id",Long.class,memberId,start.toString(),end.toString(),start.toString(),end.toString(),actor.id(),policies.getFirst().get("id"));
        audit(actor,"MEMBERSHIP",membershipId.toString(),"REGISTER","MEMBERSHIP_REGISTERED");
        return new Reply(201,Map.of("membershipId",membershipId.toString()),null);
    }
    public Reply members(Actor actor) {
        var rows=db.queryForList("SELECT a.id account_id,m.id member_id,a.phone_ciphertext,a.display_name_ciphertext,a.status account_status,m.status,a.security_version FROM gym.accounts a JOIN gym.members m ON m.account_id=a.id ORDER BY m.id DESC LIMIT 100");
        return Reply.ok(Map.of("items",rows.stream().map(this::memberView).toList()));
    }
    // [기능] memberView 메서드: DB 행을 화면 응답으로 바꾸고 표시할 개인정보를 복호화합니다.
    private Map<String,Object> memberView(Map<String,Object> row) {
        return Map.of("accountId",row.get("account_id").toString(),"memberId",row.get("member_id").toString(),"name",crypto.decrypt((byte[])row.get("display_name_ciphertext")),"phone",crypto.decrypt((byte[])row.get("phone_ciphertext")),"status",row.get("status"),"accountStatus",row.get("account_status"),"version",row.get("security_version"));
    }
    // [기능] requestRegistration: 회원이 전화번호와 비밀번호만으로 승인 대기 계정을 만듭니다.
    public Reply requestRegistration(Map<String,Object> body) {
        String phone=SecurityTools.phone(text(body,"phone",40)),password=text(body,"password",256);
        SecurityTools.validatePassword(password);
        byte[] hash=crypto.fingerprint("phone:"+phone);lock("phone:"+crypto.fingerprintHex(phone));
        if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT FROM gym.accounts WHERE phone_lookup_hmac=?)",Boolean.class,hash)))throw new ApiError(409,"PHONE_EXISTS","이미 등록된 휴대전화번호입니다. 로그인해 주세요.");
        Long accountId=db.queryForObject("INSERT INTO gym.accounts(phone_lookup_hmac,phone_ciphertext,display_name_ciphertext,pii_key_ref,password_hash,status,password_changed_at) VALUES(?,?,?,'local-dev',?,'PENDING',now()) RETURNING id",Long.class,hash,crypto.encrypt(phone),crypto.encrypt(""),crypto.hashPassword(password));
        db.update("INSERT INTO gym.members(account_id,status) VALUES(?,'PENDING')",accountId);
        db.update("INSERT INTO gym.account_roles(account_id,role,granted_by) VALUES(?,'MEMBER',?)",accountId,accountId);
        audit(new Actor(accountId.toString(),"",List.of()),"ACCOUNT",accountId.toString(),"REGISTER","SELF_REGISTRATION_REQUESTED");
        return new Reply(201,Map.of("approvalPending",true),null);
    }
    // [기능] setNickname: 승인된 회원이 첫 접속 시 표시할 닉네임을 정합니다.
    public Reply setNickname(Actor actor,Map<String,Object> body) {
        if(!actor.roles().contains("MEMBER"))throw new ApiError(403,"ACCESS_DENIED","회원 계정으로 이용해 주세요.");
        var row=account(actor.id());
        if(!crypto.decrypt((byte[])row.get("display_name_ciphertext")).isBlank())throw new ApiError(409,"NICKNAME_ALREADY_SET","이미 닉네임을 설정했습니다.");
        String nickname=text(body,"nickname",20).strip();
        if(nickname.length()<2 || nickname.codePoints().anyMatch(Character::isISOControl))throw ApiError.invalid("닉네임은 제어문자 없이 2~20자로 입력해 주세요.");
        db.update("UPDATE gym.accounts SET display_name_ciphertext=?,updated_at=now() WHERE id=?::bigint",crypto.encrypt(nickname),actor.id());
        return me(actor);
    }
    // [기능] register 메서드: 전화번호 중복과 본인 확인 조건을 검사한 후 대기 상태의 계정·회원·역할과 감사 기록을 만듭니다.
    public Reply register(Actor actor,Map<String,Object> body) {
        String name=text(body,"name",80).strip(),phone=SecurityTools.phone(text(body,"phone",40));
        if(!Boolean.TRUE.equals(body.get("age14Verified")))throw ApiError.invalid("만 14세 이상 본인 확인이 필요합니다.");
        byte[] hash=crypto.fingerprint("phone:"+phone);lock("phone:"+crypto.fingerprintHex(phone));
        if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT FROM gym.accounts WHERE phone_lookup_hmac=?)",Boolean.class,hash)))throw new ApiError(409,"PHONE_EXISTS","이미 등록된 휴대전화번호입니다.");
        Long accountId=db.queryForObject("INSERT INTO gym.accounts(phone_lookup_hmac,phone_ciphertext,display_name_ciphertext,pii_key_ref,status,registered_by,age_14_verified_at,age_14_verified_by) VALUES(?,?,?,'local-dev','PENDING',?::bigint,now(),?::bigint) RETURNING id",Long.class,hash,crypto.encrypt(phone),crypto.encrypt(name),actor.id,actor.id);
        Long memberId=db.queryForObject("INSERT INTO gym.members(account_id,status) VALUES(?,'PENDING') RETURNING id",Long.class,accountId);
        db.update("INSERT INTO gym.account_roles(account_id,role,granted_by) VALUES(?,'MEMBER',?::bigint)",accountId,actor.id);
        audit(actor,"ACCOUNT",accountId.toString(),"REGISTER","MEMBER_REGISTERED");
        return new Reply(201,Map.of("accountId",accountId.toString(),"memberId",memberId.toString(),"name",name,"phone",phone,"status","PENDING","accountStatus","PENDING","version",1),null);
    }
    // [목적] changeStatus 메서드: 예상 버전으로 동시 수정을 검사하고 회원 상태를 변경합니다. 보안 버전 증가와 세션 폐기로 이전 로그인을 무효화합니다.
    public Reply changeStatus(Actor actor,String accountId,Map<String,Object> body) {
        var row=account(accountId);String state=text(body,"status",20);
        String reason="ACTIVE".equals(state)?"운영자 회원 승인":text(body,"reason",1000);
        if(!List.of("ACTIVE","SUSPENDED").contains(state))throw ApiError.invalid("승인 또는 정지를 선택해 주세요.");
        if(!(body.get("expectedVersion") instanceof Number version) || version.intValue()!=((Number)row.get("security_version")).intValue())throw new ApiError(409,"VERSION_CONFLICT","정보가 변경됐습니다. 새로 조회해 주세요.");
        if(!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM gym.members WHERE account_id=?::bigint)",Boolean.class,accountId)))throw new ApiError(404,"NOT_FOUND","회원 계정을 찾을 수 없습니다.");
        if(roles(accountId).contains("OPERATOR"))throw ApiError.invalid("운영자 계정은 회원 상태 변경으로 처리할 수 없습니다.");
        if("WITHDRAWN".equals(row.get("status")))throw ApiError.invalid("탈퇴한 계정입니다.");
        db.update("UPDATE gym.members SET status=?,approved_by=CASE WHEN ?='ACTIVE' THEN ?::bigint ELSE approved_by END,approved_at=CASE WHEN ?='ACTIVE' THEN now() ELSE approved_at END WHERE account_id=?::bigint",state,state,actor.id,state,accountId);
        String accountState="SUSPENDED".equals(state)?state:(row.get("password_hash")==null?"PENDING":"ACTIVE");
        db.update("UPDATE gym.accounts SET status=?,security_version=security_version+1,updated_at=now() WHERE id=?::bigint",accountState,accountId);
        db.update("UPDATE gym.account_sessions SET revoked_at=now() WHERE account_id=?::bigint AND revoked_at IS NULL",accountId);
        auditWithReason(actor,accountId,"STATUS_CHANGE","ADMIN_STATUS_CHANGED",reason);
        return Reply.ok(Map.of("accountId",accountId,"status",state,"version",((Number)row.get("security_version")).intValue()+1));
    }
    // [기능] issueCode 메서드: 승인 회원과 운영자 재인증을 확인해 활성화 또는 재설정 코드를 발급합니다. 같은 목적의 이전 코드는 폐기합니다.
    public Reply issueCode(Actor actor,String accountId,Map<String,Object> body) {
        var row=account(accountId);text(body,"reason",1000);
        if(!Boolean.TRUE.equals(body.get("identityVerified")))throw ApiError.invalid("본인 확인 후 발급해 주세요.");
        String purpose=text(body,"purpose",20);
        if(!List.of("ACTIVATE","RESET").contains(purpose))throw ApiError.invalid("발급 목적을 확인해 주세요.");
        boolean approved=Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM gym.members WHERE account_id=?::bigint AND status='ACTIVE')",Boolean.class,accountId));
        if(!approved || List.of("SUSPENDED","WITHDRAWN").contains(row.get("status")))throw ApiError.invalid("승인된 회원에게 발급할 수 있습니다.");
        if("ACTIVATE".equals(purpose) && row.get("password_hash")!=null)throw ApiError.invalid("이미 활성화된 계정입니다. 재설정 코드를 사용해 주세요.");
        int claimed=db.update("UPDATE gym.account_sessions SET reauthenticated_at=NULL WHERE id=?::bigint AND reauthenticated_at>now()-interval '5 minutes' AND revoked_at IS NULL",actor.sessionId);
        if(claimed!=1)throw new ApiError(403,"REAUTH_REQUIRED","코드 발급 전에 추가 본인 인증을 해 주세요.");
        String dbPurpose="ACTIVATE".equals(purpose)?"ACTIVATION":"PASSWORD_RESET",code=crypto.randomToken();
        db.update("UPDATE gym.auth_codes SET revoked_at=now() WHERE account_id=?::bigint AND purpose=? AND consumed_at IS NULL AND revoked_at IS NULL",accountId,dbPurpose);
        var issued=db.queryForMap("INSERT INTO gym.auth_codes(account_id,purpose,code_hash,issued_by,expires_at) VALUES(?::bigint,?,?,?::bigint,now()+CASE WHEN ?='ACTIVATION' THEN interval '24 hours' ELSE interval '15 minutes' END) RETURNING id,expires_at",accountId,dbPurpose,crypto.fingerprint("code:"+code),actor.id,dbPurpose);
        auditWithReason(actor,accountId,"CODE_ISSUED","IDENTITY_VERIFIED",text(body,"reason",1000));
        return Reply.ok(Map.of("challengeId",issued.get("id").toString(),"code",code,"expiresAt",((Timestamp)issued.get("expires_at")).toInstant().toString()));
    }
    // [기능] consumeCode 메서드: 일회용 코드와 만료·실패 횟수를 검증한 뒤 비밀번호를 설정하고 기존 세션을 종료합니다.
    public Reply consumeCode(Map<String,Object> body) {
        String challenge=id(text(body,"challengeId",19)),code=text(body,"code",100),password=text(body,"newPassword",256);SecurityTools.validatePassword(password);
        var rows=db.queryForList("SELECT account_id FROM gym.auth_codes WHERE id=?::bigint",challenge);
        if(rows.isEmpty())throw codeError();var account=account(rows.getFirst().get("account_id").toString());
        var row=db.queryForMap("SELECT * FROM gym.auth_codes WHERE id=?::bigint FOR UPDATE",challenge);
        if(row.get("consumed_at")!=null || row.get("revoked_at")!=null || !live(row.get("expires_at")) || ((Number)row.get("failed_attempts")).intValue()>=5)throw codeError();
        if(!MessageDigest.isEqual((byte[])row.get("code_hash"),crypto.fingerprint("code:"+code))) {
            db.update("UPDATE gym.auth_codes SET failed_attempts=failed_attempts+1,revoked_at=CASE WHEN failed_attempts>=4 THEN now() ELSE revoked_at END WHERE id=?::bigint",challenge);throw codeError();
        }
        if(!List.of("PENDING","ACTIVE").contains(account.get("status")))throw codeError();
        String accountId=account.get("id").toString();
        if(!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT FROM gym.members WHERE account_id=?::bigint AND status='ACTIVE')",Boolean.class,accountId)))throw codeError();
        db.update("UPDATE gym.accounts SET password_hash=?,status='ACTIVE',password_changed_at=now(),security_version=security_version+1,locked_until=NULL,updated_at=now() WHERE id=?::bigint",crypto.hashPassword(password),accountId);
        db.update("UPDATE gym.auth_codes SET consumed_at=now() WHERE id=?::bigint",challenge);
        db.update("UPDATE gym.account_sessions SET revoked_at=now() WHERE account_id=?::bigint AND revoked_at IS NULL",accountId);
        audit(new Actor(accountId,"",List.of()),"ACCOUNT",accountId,"CODE_CONSUMED","PASSWORD_SET");
        return Reply.ok(Map.of("activated",true));
    }
    // [기능] codeError 메서드: 일회용 코드 실패를 공통 안내 문구로 반환합니다.
    private ApiError codeError(){return new ApiError(422,"CODE_INVALID","코드가 올바르지 않거나 사용할 수 없습니다. 데스크에 재발급을 요청해 주세요.");}
    // [기능] reauthenticate 메서드: 운영자의 비밀번호와 TOTP를 다시 확인해 민감 작업용 최근 인증 시각을 갱신합니다.
    public Reply reauthenticate(Actor actor,Map<String,Object> body) {
        var account=account(actor.id);
        if(live(account.get("locked_until")))throw new ApiError(429,"LOGIN_LIMITED","잠시 후 다시 시도해 주세요.");
        if(!crypto.matches(text(body,"password",256),(String)account.get("password_hash")) || !acceptTotp(actor.id,text(body,"totp",20))) {
            failed(account,(byte[])account.get("phone_lookup_hmac"),crypto.fingerprint("source:reauth"));throw ApiError.login();
        }
        if(live(account.get("locked_until")))throw new ApiError(429,"LOGIN_LIMITED","잠시 후 다시 시도해 주세요.");
        db.update("UPDATE gym.account_sessions SET reauthenticated_at=now() WHERE id=?::bigint",actor.sessionId);
        return Reply.ok(Map.of("reauthenticated",true));
    }
    // [기능] logout 메서드: 현재 세션을 DB에서 폐기하고 브라우저 쿠키 삭제를 지시하는 응답을 반환합니다.
    public Reply logout(Actor actor) {
        db.update("UPDATE gym.account_sessions SET revoked_at=now() WHERE id=?::bigint",actor.sessionId);
        return new Reply(200,Map.of("loggedOut",true),"");
    }
    // [기능] audit 메서드: 누가 어떤 대상을 처리했는지 개인정보 본문 없이 감사 이벤트로 기록합니다.
    private void audit(Actor actor,String target,String targetId,String action,String reason) {
        db.update("INSERT INTO gym.audit_events(actor_account_id,actor_type,target_type,target_id,action,reason_code,purge_after) VALUES(?::bigint,'ACCOUNT',?,?,?,?,now()+interval '1 year')",actor.id,target,targetId,action,reason);
    }
    // [기능] auditWithReason 메서드: 감사 이벤트를 남기고 상세 처리 사유는 별도로 암호화해 저장합니다.
    private void auditWithReason(Actor actor,String accountId,String action,String reasonCode,String reason) {
        Long auditId=db.queryForObject("INSERT INTO gym.audit_events(actor_account_id,actor_type,target_type,target_id,action,reason_code,purge_after) VALUES(?::bigint,'ACCOUNT','ACCOUNT',?,?,?,now()+interval '1 year') RETURNING id",Long.class,actor.id,accountId,action,reasonCode);
        db.update("INSERT INTO gym.auth_action_reasons(audit_id,reason_ciphertext) VALUES(?,?)",auditId,crypto.encrypt(reason));
    }
}

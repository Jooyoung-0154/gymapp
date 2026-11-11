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
    private String encode(Object value) { try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);} }
    private void lock(String key) { db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",key); }
    public String publicScope(String source,Map<String,Object> body) {
        String identity=Objects.toString(body.getOrDefault("challengeId",body.getOrDefault("phone","anonymous")));
        return "public:"+crypto.fingerprintHex(source+":"+identity);
    }
    static String text(Map<String,Object> body,String key,int max) {
        Object value=body.get(key);
        if(!(value instanceof String str) || str.isBlank() || str.length()>max) throw ApiError.invalid("입력한 내용을 확인해 주세요: "+key);
        return str;
    }
    static String id(String value) { if(!value.matches("[1-9][0-9]{0,18}")) throw new ApiError(404,"NOT_FOUND","대상을 찾을 수 없습니다.");return value; }
    static boolean live(Object timestamp) { return timestamp!=null && ((Timestamp)timestamp).toInstant().isAfter(Instant.now()); }
    private Map<String,Object> account(String id) {
        var rows=db.queryForList("SELECT * FROM gym.accounts WHERE id=?::bigint FOR UPDATE",id(id));
        if(rows.isEmpty()) throw new ApiError(404,"NOT_FOUND","대상을 찾을 수 없습니다.");return rows.getFirst();
    }
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
        if(roles.contains("OPERATOR")) {
            String challenge=crypto.randomToken();
            db.update("INSERT INTO gym.auth_challenges(id_hash,account_id,security_version,expires_at) VALUES(?,?::bigint,?,now()+interval '5 minutes')",crypto.fingerprint("challenge:"+challenge),accountId,row.get("security_version"));
            return Reply.ok(Map.of("mfaRequired",true,"challengeId",challenge));
        }
        return session(row,false);
    }
    private List<String> roles(String accountId) { return db.queryForList("SELECT role FROM gym.account_roles WHERE account_id=?::bigint ORDER BY role",String.class,accountId); }
    private void recordAttempt(String accountId,byte[] fingerprint,byte[] source,boolean success) {
        db.update("INSERT INTO gym.login_attempts(account_id,login_fingerprint,source_fingerprint,succeeded,purge_after) VALUES(?::bigint,?,?,?,now()+interval '1 day')",accountId,fingerprint,source,success);
    }
    private void failed(Map<String,Object> account,byte[] fingerprint,byte[] source) {
        String accountId=account==null?null:account.get("id").toString();
        recordAttempt(accountId,fingerprint,source,false);
        if(account!=null) {
            Integer count=db.queryForObject("SELECT count(*) FROM gym.login_attempts WHERE login_fingerprint=? AND NOT succeeded AND attempted_at>now()-interval '15 minutes'",Integer.class,fingerprint);
            if(count>=5) db.update("UPDATE gym.accounts SET locked_until=now()+interval '15 minutes' WHERE id=?::bigint",accountId);
        }
    }
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
    private boolean acceptTotp(String accountId,String code) {
        var rows=db.queryForList("SELECT * FROM gym.mfa_enrollments WHERE account_id=?::bigint AND confirmed_at IS NOT NULL AND revoked_at IS NULL FOR UPDATE",accountId);
        if(rows.isEmpty())return false;var row=rows.getFirst();
        long last=row.get("last_accepted_time_step")==null?-1:((Number)row.get("last_accepted_time_step")).longValue();
        long step=SecurityTools.verifyTotp(crypto.decrypt((byte[])row.get("secret_ciphertext")),code,Instant.now(),last);
        if(step<0)return false;
        db.update("UPDATE gym.mfa_enrollments SET last_accepted_time_step=? WHERE id=?",step,row.get("id"));return true;
    }
    private Reply session(Map<String,Object> account,boolean operator) {
        String token=crypto.randomToken();String privilege=operator?"OPERATOR":"STANDARD";
        db.update("INSERT INTO gym.account_sessions(account_id,token_hash,privilege,security_version,last_seen_at,expires_at,mfa_verified_at,reauthenticated_at) VALUES(?,?,?, ?,now(),now()+CASE WHEN ? THEN interval '12 hours' ELSE interval '30 days' END,CASE WHEN ? THEN now() ELSE NULL END,CASE WHEN ? THEN now() ELSE NULL END)",account.get("id"),crypto.fingerprint("session:"+token),privilege,account.get("security_version"),operator,operator,operator);
        return new Reply(200,Map.of("mfaRequired",false),token);
    }
    public Actor authenticate(String token) {
        if(token==null || token.length()>100)return null;
        var rows=db.queryForList("SELECT s.id session_id,s.account_id,s.privilege FROM gym.account_sessions s JOIN gym.accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND a.status='ACTIVE' AND s.security_version=a.security_version AND s.expires_at>now() AND s.last_seen_at>now()-CASE WHEN s.privilege='OPERATOR' THEN interval '30 minutes' ELSE interval '7 days' END AND (s.privilege<>'OPERATOR' OR (s.mfa_verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM gym.mfa_enrollments m WHERE m.account_id=a.id AND m.revoked_at IS NULL AND m.confirmed_at IS NOT NULL)))",crypto.fingerprint("session:"+token));
        if(rows.isEmpty())return null;var row=rows.getFirst();
        String id=row.get("account_id").toString();List<String> roles=new ArrayList<>(roles(id));
        if(!"OPERATOR".equals(row.get("privilege")))roles.remove("OPERATOR");
        db.update("UPDATE gym.account_sessions SET last_seen_at=now() WHERE id=?",row.get("session_id"));
        return new Actor(id,row.get("session_id").toString(),roles);
    }
    public Reply me(Actor actor) {
        var row=db.queryForMap("SELECT id,phone_ciphertext,display_name_ciphertext,status FROM gym.accounts WHERE id=?::bigint",actor.id);
        return Reply.ok(Map.of("accountId",actor.id,"name",crypto.decrypt((byte[])row.get("display_name_ciphertext")),"phone",crypto.decrypt((byte[])row.get("phone_ciphertext")),"roles",actor.roles,"status",row.get("status")));
    }
    public Reply members(Actor actor) {
        var rows=db.queryForList("SELECT a.id account_id,m.id member_id,a.phone_ciphertext,a.display_name_ciphertext,a.status account_status,m.status,a.security_version FROM gym.accounts a JOIN gym.members m ON m.account_id=a.id ORDER BY m.id DESC LIMIT 100");
        return Reply.ok(Map.of("items",rows.stream().map(this::memberView).toList()));
    }
    private Map<String,Object> memberView(Map<String,Object> row) {
        return Map.of("accountId",row.get("account_id").toString(),"memberId",row.get("member_id").toString(),"name",crypto.decrypt((byte[])row.get("display_name_ciphertext")),"phone",crypto.decrypt((byte[])row.get("phone_ciphertext")),"status",row.get("status"),"accountStatus",row.get("account_status"),"version",row.get("security_version"));
    }
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
    public Reply changeStatus(Actor actor,String accountId,Map<String,Object> body) {
        var row=account(accountId);String reason=text(body,"reason",1000),state=text(body,"status",20);
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
    private ApiError codeError(){return new ApiError(422,"CODE_INVALID","코드가 올바르지 않거나 사용할 수 없습니다. 데스크에 재발급을 요청해 주세요.");}
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
    public Reply logout(Actor actor) {
        db.update("UPDATE gym.account_sessions SET revoked_at=now() WHERE id=?::bigint",actor.sessionId);
        return new Reply(200,Map.of("loggedOut",true),"");
    }
    private void audit(Actor actor,String target,String targetId,String action,String reason) {
        db.update("INSERT INTO gym.audit_events(actor_account_id,actor_type,target_type,target_id,action,reason_code,purge_after) VALUES(?::bigint,'ACCOUNT',?,?,?,?,now()+interval '1 year')",actor.id,target,targetId,action,reason);
    }
    private void auditWithReason(Actor actor,String accountId,String action,String reasonCode,String reason) {
        Long auditId=db.queryForObject("INSERT INTO gym.audit_events(actor_account_id,actor_type,target_type,target_id,action,reason_code,purge_after) VALUES(?::bigint,'ACCOUNT','ACCOUNT',?,?,?,now()+interval '1 year') RETURNING id",Long.class,actor.id,accountId,action,reasonCode);
        db.update("INSERT INTO gym.auth_action_reasons(audit_id,reason_ciphertext) VALUES(?,?)",auditId,crypto.encrypt(reason));
    }
}

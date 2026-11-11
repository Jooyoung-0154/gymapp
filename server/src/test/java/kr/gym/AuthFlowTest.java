package kr.gym;

import com.fasterxml.jackson.databind.*;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

@SpringBootTest(properties={"gym.bootstrap=false"})
@AutoConfigureMockMvc
class AuthFlowTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired SecurityTools crypto;
    @Autowired ObjectMapper json;
    String phone,secret,password="TestOnly!Password123"; String operatorId;
    @BeforeEach void operatorFixture() {
        phone="010"+String.format("%08d",new java.security.SecureRandom().nextInt(100000000));
        secret=Base64.getEncoder().encodeToString(UUID.randomUUID().toString().getBytes());
        operatorId=db.queryForObject("INSERT INTO gym.accounts(phone_lookup_hmac,phone_ciphertext,display_name_ciphertext,pii_key_ref,password_hash,status) VALUES(?,?,?,'local-dev',?,'ACTIVE') RETURNING id",Long.class,
            crypto.fingerprint("phone:"+phone),crypto.encrypt(phone),crypto.encrypt("TEST 운영자"),crypto.hashPassword(password)).toString();
        db.update("INSERT INTO gym.account_roles(account_id,role,granted_by) VALUES(?::bigint,'OPERATOR',?::bigint)",operatorId,operatorId);
        db.update("INSERT INTO gym.mfa_enrollments(account_id,secret_ciphertext,key_ref,confirmed_at) VALUES(?::bigint,?,'local-dev',now())",operatorId,crypto.encrypt(secret));
    }
    MvcResult postJson(String path,Map<String,Object> body,Cookie cookie,String key) throws Exception {
        var request=post("/api/v1"+path).with(csrf()).contentType("application/json").header("Idempotency-Key",key).content(json.writeValueAsBytes(body));
        if(cookie!=null) request.cookie(cookie);
        return mvc.perform(request).andReturn();
    }
    MvcResult postJson(String path,Map<String,Object> body,Cookie cookie) throws Exception { return postJson(path,body,cookie,UUID.randomUUID().toString()); }
    JsonNode data(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).path("data"); }
    Cookie session(MvcResult result) {
        String header=result.getResponse().getHeaders("Set-Cookie").stream().filter(h->h.startsWith("GYM_SESSION=")).findFirst().orElseThrow();
        return new Cookie("GYM_SESSION",header.split(";",2)[0].substring("GYM_SESSION=".length()));
    }
    Cookie operator() throws Exception {
        var login=postJson("/auth/login",Map.of("phone",phone,"password",password),null);
        assertThat(login.getResponse().getStatus()).isEqualTo(200);
        var mfa=postJson("/auth/mfa/verify",Map.of("challengeId",data(login).path("challengeId").asText(),"totp",SecurityTools.totp(secret,Instant.now())),null);
        assertThat(mfa.getResponse().getStatus()).isEqualTo(200);
        return session(mfa);
    }
    JsonNode register(Cookie admin,String memberPhone) throws Exception {
        var result=postJson("/admin/members",Map.of("name","TEST 회원","phone",memberPhone,"age14Verified",true),admin);
        assertThat(result.getResponse().getStatus()).isEqualTo(201); return data(result);
    }
    JsonNode approve(Cookie admin,JsonNode member) throws Exception {
        var result=postJson("/admin/accounts/"+member.path("accountId").asText()+"/status",Map.of("status","ACTIVE","reason","시험 승인","expectedVersion",member.path("version").asInt()),admin);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);return data(result);
    }
    JsonNode code(Cookie admin,JsonNode member) throws Exception {
        var result=postJson("/admin/accounts/"+member.path("accountId").asText()+"/codes",Map.of("purpose","ACTIVATE","identityVerified",true,"reason","시험 본인확인"),admin);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);return data(result);
    }
    @Test void registrationActivationLoginMeAndLogout() throws Exception {
        Cookie admin=operator(); JsonNode member=register(admin,"010"+String.format("%08d",new Random().nextInt(100000000)));
        approve(admin,member); JsonNode issued=code(admin,member);
        var activation=postJson("/auth/code/consume",Map.of("challengeId",issued.path("challengeId").asText(),"code",issued.path("code").asText(),"newPassword",password),null);
        assertThat(activation.getResponse().getStatus()).isEqualTo(200);
        var replay=postJson("/auth/code/consume",Map.of("challengeId",issued.path("challengeId").asText(),"code",issued.path("code").asText(),"newPassword",password),null);
        assertThat(replay.getResponse().getStatus()).isEqualTo(422);
        var login=postJson("/auth/login",Map.of("phone",member.path("phone").asText(),"password",password),null);
        assertThat(login.getResponse().getStatus()).isEqualTo(200);Cookie user=session(login);
        var me=mvc.perform(get("/api/v1/me").cookie(user)).andReturn();
        assertThat(data(me).path("name").asText()).isEqualTo("TEST 회원");
        assertThat(mvc.perform(get("/api/v1/admin/members").cookie(user)).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(postJson("/auth/logout",Map.of(),user).getResponse().getStatus()).isEqualTo(200);
        assertThat(mvc.perform(get("/api/v1/me").cookie(user)).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
    @Test void mutationRequiresCsrfAndOperatorMfa() throws Exception {
        assertThat(mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{}")).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(postJson("/admin/members",Map.of(),null).getResponse().getStatus()).isEqualTo(401);
        var login=postJson("/auth/login",Map.of("phone",phone,"password",password),null);
        assertThat(data(login).path("mfaRequired").asBoolean()).isTrue();
        assertThat(login.getResponse().getHeaders("Set-Cookie")).noneMatch(h->h.startsWith("GYM_SESSION="));
        var failed=postJson("/auth/mfa/verify",Map.of("challengeId",data(login).path("challengeId").asText(),"totp","invalid"),null);
        assertThat(failed.getResponse().getStatus()).isEqualTo(401);
    }
    @Test void duplicatePhoneAndIdempotencyAreEnforced() throws Exception {
        Cookie admin=operator();String memberPhone="010"+String.format("%08d",new Random().nextInt(100000000)),key=UUID.randomUUID().toString();
        var body=Map.<String,Object>of("name","TEST 재전송","phone",memberPhone,"age14Verified",true);
        var first=postJson("/admin/members",body,admin,key);var retry=postJson("/admin/members",body,admin,key);
        assertThat(first.getResponse().getStatus()).isEqualTo(201);
        assertThat(data(first)).isEqualTo(data(retry));
        assertThat(postJson("/admin/members",Map.of("name","TEST 변경","phone",memberPhone,"age14Verified",true),admin,key).getResponse().getStatus()).isEqualTo(409);
        assertThat(postJson("/admin/members",body,admin).getResponse().getStatus()).isEqualTo(409);
    }
    @Test void fiveWrongCodesArePersistedAndExpiredCodesFail() throws Exception {
        Cookie admin=operator();JsonNode member=register(admin,"010"+String.format("%08d",new Random().nextInt(100000000)));approve(admin,member);JsonNode issued=code(admin,member);
        for(int i=0;i<5;i++) assertThat(postJson("/auth/code/consume",Map.of("challengeId",issued.path("challengeId").asText(),"code","wrong","newPassword",password),null).getResponse().getStatus()).isEqualTo(422);
        assertThat(db.queryForObject("SELECT failed_attempts FROM gym.auth_codes WHERE id=?::bigint",Integer.class,issued.path("challengeId").asText())).isEqualTo(5);
        assertThat(postJson("/auth/code/consume",Map.of("challengeId",issued.path("challengeId").asText(),"code",issued.path("code").asText(),"newPassword",password),null).getResponse().getStatus()).isEqualTo(422);
        // Preserve the exact-lifetime check while moving the fixture into the past.
        db.update("UPDATE gym.auth_codes SET failed_attempts=0,revoked_at=null,issued_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE id=?::bigint",issued.path("challengeId").asText());
        assertThat(postJson("/auth/code/consume",Map.of("challengeId",issued.path("challengeId").asText(),"code",issued.path("code").asText(),"newPassword",password),null).getResponse().getStatus()).isEqualTo(422);
    }
    @Test void loginFailureLimitAndDatabasePermissions() throws Exception {
        for(int i=0;i<5;i++) assertThat(postJson("/auth/login",Map.of("phone",phone,"password","wrongPassword"),null).getResponse().getStatus()).isEqualTo(401);
        assertThat(postJson("/auth/login",Map.of("phone",phone,"password",password),null).getResponse().getStatus()).isEqualTo(429);
        assertThat(db.queryForObject("SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname=current_user",Boolean.class)).isFalse();
        assertThat(db.queryForObject("SELECT has_schema_privilege(current_user,'gym_private','USAGE')",Boolean.class)).isFalse();
        assertThat(db.queryForObject("SELECT has_table_privilege(current_user,'gym.audit_events','DELETE')",Boolean.class)).isFalse();
    }
    @Test void suspensionAndIdleExpiryRevokeAccess() throws Exception {
        Cookie admin=operator();JsonNode member=register(admin,"010"+String.format("%08d",new Random().nextInt(100000000)));JsonNode approved=approve(admin,member);JsonNode issued=code(admin,member);
        postJson("/auth/code/consume",Map.of("challengeId",issued.path("challengeId").asText(),"code",issued.path("code").asText(),"newPassword",password),null);
        Cookie user=session(postJson("/auth/login",Map.of("phone",member.path("phone").asText(),"password",password),null));
        int version=db.queryForObject("SELECT security_version FROM gym.accounts WHERE id=?::bigint",Integer.class,member.path("accountId").asText());
        assertThat(postJson("/admin/accounts/"+member.path("accountId").asText()+"/status",Map.of("status","SUSPENDED","reason","시험 정지","expectedVersion",version),admin).getResponse().getStatus()).isEqualTo(200);
        assertThat(mvc.perform(get("/api/v1/me").cookie(user)).andReturn().getResponse().getStatus()).isEqualTo(401);
        db.update("UPDATE gym.account_sessions SET created_at=now()-interval '2 hours',last_seen_at=now()-interval '1 hour',expires_at=now()+interval '10 hours' WHERE account_id=?::bigint",operatorId);
        assertThat(mvc.perform(get("/api/v1/me").cookie(admin)).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
    @Test void mfaChallengeCannotBeReusedAndExpires() throws Exception {
        var login=postJson("/auth/login",Map.of("phone",phone,"password",password),null);String challenge=data(login).path("challengeId").asText();
        var body=Map.<String,Object>of("challengeId",challenge,"totp",SecurityTools.totp(secret,Instant.now()));
        assertThat(postJson("/auth/mfa/verify",body,null).getResponse().getStatus()).isEqualTo(200);
        assertThat(postJson("/auth/mfa/verify",body,null).getResponse().getStatus()).isEqualTo(401);
        var next=postJson("/auth/login",Map.of("phone",phone,"password",password),null);String nextId=data(next).path("challengeId").asText();
        db.update("UPDATE gym.auth_challenges SET expires_at=now()-interval '1 second' WHERE id_hash=?",crypto.fingerprint("challenge:"+nextId));
        assertThat(postJson("/auth/mfa/verify",Map.of("challengeId",nextId,"totp",SecurityTools.totp(secret,Instant.now())),null).getResponse().getStatus()).isEqualTo(401);
    }
    @Test void concurrentRegistrationAndActivationOnlyCommitOnce() throws Exception {
        Cookie admin=operator();String memberPhone="010"+String.format("%08d",new Random().nextInt(100000000));
        var body=Map.<String,Object>of("name","TEST 동시 등록","phone",memberPhone,"age14Verified",true);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var barrier=new java.util.concurrent.CyclicBarrier(2);
            var first=executor.submit(()->{barrier.await();return postJson("/admin/members",body,admin);});
            var second=executor.submit(()->{barrier.await();return postJson("/admin/members",body,admin);});
            var a=first.get();var b=second.get();
            assertThat(List.of(a.getResponse().getStatus(),b.getResponse().getStatus())).containsExactlyInAnyOrder(201,409);
            JsonNode member=data(a.getResponse().getStatus()==201?a:b);approve(admin,member);JsonNode issued=code(admin,member);
            var activation=Map.<String,Object>of("challengeId",issued.path("challengeId").asText(),"code",issued.path("code").asText(),"newPassword",password);
            var x=executor.submit(()->{barrier.await();return postJson("/auth/code/consume",activation,null).getResponse().getStatus();});
            var y=executor.submit(()->{barrier.await();return postJson("/auth/code/consume",activation,null).getResponse().getStatus();});
            assertThat(List.of(x.get(),y.get())).containsExactlyInAnyOrder(200,422);
        }
    }
}

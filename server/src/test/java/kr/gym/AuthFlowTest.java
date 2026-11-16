// [목적] AuthFlowTest.java 파일: 인증과 회원 관리 흐름을 검증하는 테스트입니다. 세부 조건은 각 테스트의 입력과 기대 결과를 함께 읽어 확인합니다.
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
        assertThat(data(login).path("mfaRequired").asBoolean()).isFalse();
        return session(login);
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
    // [목적] 실제 DB를 사용해 회원 가입·승인·닉네임·이용권 등록·본인 조회와 기간 중복 거부를 검증합니다.
    @Test void facilityMembershipRegistrationAndOwnership() throws Exception {
        Cookie admin=operator();
        String memberPhone="010"+String.format("%08d",new Random().nextInt(100000000));
        var loginBody=Map.<String,Object>of("phone",memberPhone,"password",password);
        assertThat(postJson("/auth/register",loginBody,null).getResponse().getStatus()).isEqualTo(201);
        var items=data(mvc.perform(get("/api/v1/admin/members").cookie(admin)).andReturn()).path("items");
        JsonNode member=null;
        for(var item:items) if(item.path("phone").asText().equals(memberPhone)) member=item;
        assertThat(member).isNotNull();
        String accountId=member.path("accountId").asText();
        var dates=Map.<String,Object>of("startsOn","2026-12-01","expiresOn","2026-12-31");
        String path="/admin/accounts/"+accountId+"/membership";
        assertThat(postJson(path,dates,admin).getResponse().getStatus()).isEqualTo(409);
        approve(admin,member);
        Cookie user=session(postJson("/auth/login",loginBody,null));
        assertThat(postJson("/me/nickname",Map.of("nickname","이용권검증회원"),user).getResponse().getStatus()).isEqualTo(200);
        assertThat(data(mvc.perform(get("/api/v1/me/membership").cookie(user)).andReturn()).path("registered").asBoolean()).isFalse();
        assertThat(postJson(path,dates,user).getResponse().getStatus()).isEqualTo(403);
        assertThat(postJson(path,dates,null).getResponse().getStatus()).isEqualTo(401);
        assertThat(postJson(path,Map.of("startsOn","2026-12-31","expiresOn","2026-12-01"),admin).getResponse().getStatus()).isEqualTo(422);
        String key=UUID.randomUUID().toString();
        var created=postJson(path,dates,admin,key);
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        assertThat(data(postJson(path,dates,admin,key))).isEqualTo(data(created));
        assertThat(postJson(path,dates,admin).getResponse().getStatus()).isEqualTo(409);
        var mine=mvc.perform(get("/api/v1/me/membership").param("accountId",operatorId).cookie(user)).andReturn();
        assertThat(mine.getResponse().getStatus()).isEqualTo(200);
        assertThat(data(mine).path("registered").asBoolean()).isTrue();
        assertThat(data(mine).path("startsOn").asText()).isEqualTo("2026-12-01");
        assertThat(data(mine).path("expiresOn").asText()).isEqualTo("2026-12-31");
        assertThat(data(mvc.perform(get("/api/v1/me/membership").cookie(admin)).andReturn()).path("registered").asBoolean()).isFalse();
        String otherPhone="010"+String.format("%08d",new Random().nextInt(100000000));
        var other=register(admin,otherPhone); approve(admin,other);
        var issued=code(admin,other);
        assertThat(postJson("/auth/code/consume",Map.of("challengeId",issued.path("challengeId").asText(),"code",issued.path("code").asText(),"newPassword",password),null).getResponse().getStatus()).isEqualTo(200);
        Cookie second=session(postJson("/auth/login",Map.of("phone",otherPhone,"password",password),null));
        assertThat(data(mvc.perform(get("/api/v1/me/membership").param("accountId",accountId).cookie(second)).andReturn()).path("registered").asBoolean()).isFalse();
    }
    @Test void selfRegistrationApprovalAndNickname() throws Exception {
        String memberPhone="010"+String.format("%08d",new Random().nextInt(100000000));
        var body=Map.<String,Object>of("phone",memberPhone,"password",password);
        var registration=postJson("/auth/register",body,null);
        assertThat(registration.getResponse().getStatus()).isEqualTo(201);
        assertThat(data(registration).path("approvalPending").asBoolean()).isTrue();
        assertThat(postJson("/auth/register",body,null).getResponse().getStatus()).isEqualTo(409);
        var pending=postJson("/auth/login",body,null);
        assertThat(data(pending).path("approvalPending").asBoolean()).isTrue();
        assertThat(pending.getResponse().getHeaders("Set-Cookie")).noneMatch(h->h.startsWith("GYM_SESSION="));
        assertThat(postJson("/me/nickname",Map.of("nickname","새회원"),null).getResponse().getStatus()).isEqualTo(401);
        Cookie admin=operator();
        var members=mvc.perform(get("/api/v1/admin/members").cookie(admin)).andReturn();
        JsonNode member=null;
        for(var item:data(members).path("items"))if(item.path("phone").asText().equals(memberPhone))member=item;
        assertThat(member).isNotNull();
        var approved=postJson("/admin/accounts/"+member.path("accountId").asText()+"/status",Map.of("status","ACTIVE","expectedVersion",member.path("version").asInt()),admin);
        assertThat(approved.getResponse().getStatus()).isEqualTo(200);
        Cookie login=session(postJson("/auth/login",body,null));
        var me=data(mvc.perform(get("/api/v1/me").cookie(login)).andReturn());
        assertThat(me.path("nicknameRequired").asBoolean()).isTrue();
        assertThat(postJson("/me/nickname",Map.of("nickname","a"),login).getResponse().getStatus()).isEqualTo(422);
        var saved=postJson("/me/nickname",Map.of("nickname","운동회원"),login);
        assertThat(saved.getResponse().getStatus()).isEqualTo(200);
        assertThat(data(saved).path("nicknameRequired").asBoolean()).isFalse();
        assertThat(data(saved).path("name").asText()).isEqualTo("운동회원");
        assertThat(postJson("/me/nickname",Map.of("nickname","다른이름"),login).getResponse().getStatus()).isEqualTo(409);
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
    @Test void mutationRequiresCsrfAndOperatorPasswordLogin() throws Exception {
        assertThat(mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{}")).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(postJson("/admin/members",Map.of(),null).getResponse().getStatus()).isEqualTo(401);
        db.update("DELETE FROM gym.mfa_enrollments WHERE account_id=?::bigint",operatorId);
        Cookie admin=operator();
        assertThat(mvc.perform(get("/api/v1/admin/members").cookie(admin)).andReturn().getResponse().getStatus()).isEqualTo(200);
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



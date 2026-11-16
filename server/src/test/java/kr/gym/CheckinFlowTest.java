package kr.gym;

import com.fasterxml.jackson.databind.*;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

// [목적] 실제 DB에서 QR 발급→입장→출석 조회를 검증합니다. 운영 설정과 테스트 계정은 각 테스트 종료 후 모두 롤백합니다.
@SpringBootTest(properties={"gym.bootstrap=false"})
@AutoConfigureMockMvc
@Transactional
class CheckinFlowTest {
    @Autowired MockMvc mvc; @Autowired JdbcTemplate db; @Autowired SecurityTools crypto; @Autowired ObjectMapper json;
    @Autowired AuthService auth; @Autowired FacilityService facility;
    Cookie admin,user;String deviceId,accountId;final String password="TestOnly!Password123";
    MvcResult postJson(String path,Object body,Cookie cookie,String key) throws Exception {
        var request=post("/api/v1"+path).with(csrf()).contentType("application/json").header("Idempotency-Key",key).content(json.writeValueAsBytes(body));
        if(cookie!=null)request.cookie(cookie);return mvc.perform(request).andReturn();
    }
    MvcResult postJson(String path,Object body,Cookie cookie) throws Exception { return postJson(path,body,cookie,UUID.randomUUID().toString()); }
    JsonNode data(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).path("data"); }
    Cookie cookie(MvcResult result) { String header=result.getResponse().getHeaders("Set-Cookie").stream().filter(h->h.startsWith("GYM_SESSION=")).findFirst().orElseThrow();return new Cookie("GYM_SESSION",header.split(";",2)[0].substring(12)); }
    String phone() { return "010"+String.format("%08d",new java.security.SecureRandom().nextInt(100000000)); }
    @BeforeEach void fixture() throws Exception {
        String operatorPhone=phone();
        Long operatorId=db.queryForObject("INSERT INTO gym.accounts(phone_lookup_hmac,phone_ciphertext,display_name_ciphertext,pii_key_ref,password_hash,status) VALUES(?,?,?,'local-dev',?,'ACTIVE') RETURNING id",Long.class,crypto.fingerprint("phone:"+operatorPhone),crypto.encrypt(operatorPhone),crypto.encrypt("TEST QR 운영자"),crypto.hashPassword(password));
        db.update("INSERT INTO gym.account_roles(account_id,role,granted_by) VALUES(?,'OPERATOR',?)",operatorId,operatorId);
        admin=cookie(postJson("/auth/login",Map.of("phone",operatorPhone,"password",password),null));
        var hours=new ArrayList<Map<String,Object>>();for(int day=1;day<=7;day++)hours.add(Map.of("weekday",day,"closed",false,"opensAt","00:00","closesAt","00:00","overnight",true));
        assertThat(postJson("/admin/facility-settings",Map.of("name","TEST 시설","normalFrom",10,"crowdedFrom",20,"hours",hours),admin).getResponse().getStatus()).isEqualTo(200);
        String memberPhone=phone();postJson("/auth/register",Map.of("phone",memberPhone,"password",password),null);
        accountId=db.queryForObject("SELECT id FROM gym.accounts WHERE phone_lookup_hmac=?",Long.class,crypto.fingerprint("phone:"+memberPhone)).toString();
        assertThat(postJson("/admin/accounts/"+accountId+"/status",Map.of("status","ACTIVE","expectedVersion",1),admin).getResponse().getStatus()).isEqualTo(200);
        user=cookie(postJson("/auth/login",Map.of("phone",memberPhone,"password",password),null));
        postJson("/me/nickname",Map.of("nickname","TEST QR 회원"),user);
        LocalDate today=LocalDate.now(CheckinRules.SEOUL);
        assertThat(postJson("/admin/accounts/"+accountId+"/membership",Map.of("startsOn",today.minusDays(2).toString(),"expiresOn",today.toString()),admin).getResponse().getStatus()).isEqualTo(201);
        deviceId=data(postJson("/admin/checkin-devices",Map.of(),admin)).path("deviceId").asText();
    }
    @Test void singleUseAndReplayAndDuplicateVisit() throws Exception {
        JsonNode qr=data(postJson("/me/qr",Map.of(),user));
        var body=Map.of("deviceId",deviceId,"qrToken",qr.path("token").asText());String key=UUID.randomUUID().toString();
        var accepted=postJson("/admin/checkins",body,admin,key);
        assertThat(accepted.getResponse().getStatus()).isEqualTo(200);
        assertThat(data(accepted).path("accepted").asBoolean()).isTrue();
        assertThat(data(postJson("/admin/checkins",body,admin,key))).isEqualTo(data(accepted));
        assertThat(postJson("/admin/checkins",body,admin).getResponse().getStatus()).isEqualTo(409);
        assertThat(data(mvc.perform(get("/api/v1/me/qr/"+qr.path("credentialId").asText()).cookie(user)).andReturn()).path("used").asBoolean()).isTrue();
        JsonNode next=data(postJson("/me/qr",Map.of(),user));
        var duplicate=postJson("/admin/checkins",Map.of("deviceId",deviceId,"qrToken",next.path("token").asText()),admin);
        assertThat(data(duplicate).path("duplicate").asBoolean()).isTrue();
        var month=YearMonth.now(CheckinRules.SEOUL).toString();
        assertThat(data(mvc.perform(get("/api/v1/me/attendance").param("month",month).cookie(user)).andReturn()).path("attendanceCount").asInt()).isEqualTo(1);
        assertThat(postJson("/admin/checkins",body,user).getResponse().getStatus()).isEqualTo(403);
    }
    @Test void loggedOutOrExpiredTokenIsRejected() throws Exception {
        JsonNode qr=data(postJson("/me/qr",Map.of(),user));
        db.update("UPDATE gym.member_qr_credentials SET issued_at=now()-interval '120 seconds',expires_at=now()-interval '60 seconds' WHERE id=?::bigint",qr.path("credentialId").asText());
        assertThat(postJson("/admin/checkins",Map.of("deviceId",deviceId,"qrToken",qr.path("token").asText()),admin).getResponse().getStatus()).isEqualTo(409);
        qr=data(postJson("/me/qr",Map.of(),user));
        postJson("/auth/logout",Map.of(),user);
        assertThat(postJson("/admin/checkins",Map.of("deviceId",deviceId,"qrToken",qr.path("token").asText()),admin).getResponse().getStatus()).isEqualTo(409);
    }
    @Test void membershipIsCheckedAgainAtScanTime() throws Exception {
        JsonNode qr=data(postJson("/me/qr",Map.of(),user));
        // [목적] 회원권 수정 권한을 늘리지 않고 서버 시계를 다음 날로 옮겨 만료를 재현합니다.
        Instant tomorrow=LocalDate.now(CheckinRules.SEOUL).plusDays(1).atStartOfDay(CheckinRules.SEOUL).toInstant().plusSeconds(1);
        db.update("UPDATE gym.member_qr_credentials SET issued_at=?,expires_at=? WHERE id=?::bigint",java.sql.Timestamp.from(tomorrow),java.sql.Timestamp.from(tomorrow.plusSeconds(60)),qr.path("credentialId").asText());
        var future=new CheckinService(db,crypto,facility,Clock.fixed(tomorrow,ZoneOffset.UTC));
        var actor=auth.authenticate(admin.getValue());
        assertThatThrownBy(()->future.consume(actor,Map.of("deviceId",deviceId,"qrToken",qr.path("token").asText()),UUID.randomUUID().toString())).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.code).isEqualTo("NO_VALID_MEMBERSHIP"));
    }
}

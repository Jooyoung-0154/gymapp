// [목적] MobileWebSecurityTest.java 파일: 모바일 웹에서 필요한 교차 출처 요청과 인증 보안 동작을 검증하는 테스트입니다.
package kr.gym;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import java.util.*;
import jakarta.servlet.http.Cookie;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@WebMvcTest(ApiController.class)
@Import(WebSecurity.class)
@TestPropertySource(properties={"gym.cookie-secure=false","gym.cors.allowed-origins=http://localhost:8081,http://127.0.0.1:8081"})
class MobileWebSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean AuthService service;
    @MockitoBean AttendanceService attendance;
    @MockitoBean CheckinService checkin;
    @MockitoBean FacilityService facility;

    @Test void qrIssuanceRequiresMemberAndScannerRequiresOperator() throws Exception {
        assertThat(mvc.perform(get("/api/v1/occupancy")).andReturn().getResponse().getStatus()).isEqualTo(401);
        var member=new AuthService.Actor("17","7",List.of("MEMBER"));
        var operator=new AuthService.Actor("18","8",List.of("OPERATOR"));
        when(service.authenticate("qr-member")).thenReturn(member);
        when(service.authenticate("qr-operator")).thenReturn(operator);
        when(checkin.issue(member)).thenReturn(AuthService.Reply.ok(Map.of("credentialId","42")));
        when(checkin.registerDevice(operator)).thenReturn(AuthService.Reply.ok(Map.of("deviceId","9")));
        when(service.operation(anyString(),anyString(),anyString(),anyMap(),any())).thenAnswer(inv->((java.util.function.Supplier<?>)inv.getArgument(4)).get());
        var csrfResponse=mvc.perform(get("/api/v1/auth/csrf")).andReturn().getResponse();
        Cookie csrfCookie=csrfResponse.getCookie("XSRF-TOKEN");
        String token=new com.fasterxml.jackson.databind.ObjectMapper().readTree(csrfResponse.getContentAsString()).at("/data/token").asText();
        var issue=post("/api/v1/me/qr").header("X-XSRF-TOKEN",token).cookie(csrfCookie).header("Idempotency-Key","qr-issuance-security-test-001").contentType("application/json").content("{}");
        assertThat(mvc.perform(issue.cookie(new Cookie("GYM_SESSION","qr-member"))).andReturn().getResponse().getStatus()).isEqualTo(200);
        var forbiddenIssue=post("/api/v1/me/qr").header("X-XSRF-TOKEN",token).cookie(csrfCookie).contentType("application/json").content("{}").cookie(new Cookie("GYM_SESSION","qr-operator"));
        assertThat(mvc.perform(forbiddenIssue).andReturn().getResponse().getStatus()).isEqualTo(403);
        var scan=post("/api/v1/admin/checkins").header("X-XSRF-TOKEN",token).cookie(csrfCookie).contentType("application/json").content("{}").cookie(new Cookie("GYM_SESSION","qr-member"));
        assertThat(mvc.perform(scan).andReturn().getResponse().getStatus()).isEqualTo(403);
        verify(checkin,never()).consume(any(),anyMap(),anyString());
        var register=post("/api/v1/admin/checkin-devices").header("X-XSRF-TOKEN",token).cookie(csrfCookie).header("Idempotency-Key","qr-device-security-test-0001").contentType("application/json").content("{}").cookie(new Cookie("GYM_SESSION","qr-operator"));
        assertThat(mvc.perform(register).andReturn().getResponse().getStatus()).isEqualTo(200);
    }

    @Test void expoOriginReceivesCredentialedCorsHeaders() throws Exception {
        var response=mvc.perform(options("/api/v1/auth/login")
            .header("Origin","http://localhost:8081")
            .header("Access-Control-Request-Method","POST")
            .header("Access-Control-Request-Headers","content-type,x-xsrf-token,idempotency-key")).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getHeader("Access-Control-Allow-Origin")).isEqualTo("http://localhost:8081");
        assertThat(response.getHeader("Access-Control-Allow-Credentials")).isEqualTo("true");
    }
    @Test void unknownOriginIsRejected() throws Exception {
        var response=mvc.perform(options("/api/v1/auth/login")
            .header("Origin","https://untrusted.example")
            .header("Access-Control-Request-Method","POST")).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getHeader("Access-Control-Allow-Origin")).isNull();
    }
    @Test void allowedOriginDoesNotBypassAuthenticationOrCsrf() throws Exception {
        assertThat(mvc.perform(get("/api/v1/me").header("Origin","http://localhost:8081"))
            .andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post("/api/v1/auth/login").header("Origin","http://localhost:8081")
            .contentType("application/json").content("{}")).andReturn().getResponse().getStatus()).isEqualTo(403);
        var response=mvc.perform(get("/api/v1/auth/csrf").header("Origin","http://localhost:8081")).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("headerName","token");
        assertThat(response.getHeaders("Set-Cookie")).anyMatch(s->s.startsWith("XSRF-TOKEN="));
    }
    @Test void attendanceRequiresMemberAndUsesSessionPrincipal() throws Exception {
        assertThat(mvc.perform(get("/api/v1/me/attendance").param("month","2026-11"))
            .andReturn().getResponse().getStatus()).isEqualTo(401);
        var member=new AuthService.Actor("17","1",List.of("MEMBER"));
        when(service.authenticate("member-token")).thenReturn(member);
        when(attendance.monthly(member,"2026-11")).thenReturn(Map.of("attendanceCount",0,"attendanceDates",List.of()));
        var response=mvc.perform(get("/api/v1/me/attendance").param("month","2026-11")
            .param("memberId","another-member").cookie(new Cookie("GYM_SESSION","member-token"))).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        verify(attendance).monthly(member,"2026-11");
        when(service.authenticate("operator-token")).thenReturn(new AuthService.Actor("99","2",List.of("OPERATOR")));
        assertThat(mvc.perform(get("/api/v1/me/attendance").param("month","2026-11")
            .cookie(new Cookie("GYM_SESSION","operator-token"))).andReturn().getResponse().getStatus()).isEqualTo(403);
    }
    // [기능] 운영자 등록에서 실제 CSRF 쿠키·헤더 불일치는 업무 실행 전에 거절하고, 새 토큰은 허용합니다.
    @Test void registrationDistinguishesStaleCsrfFromInsufficientRole() throws Exception {
        var actor=new AuthService.Actor("17","1",List.of("OPERATOR"));
        when(service.authenticate("operator-csrf")).thenReturn(actor);
        var tokenResponse=mvc.perform(get("/api/v1/auth/csrf")).andReturn().getResponse();
        String token=new com.fasterxml.jackson.databind.ObjectMapper().readTree(tokenResponse.getContentAsString()).path("data").path("token").asText();
        Cookie csrfCookie=tokenResponse.getCookie("XSRF-TOKEN");
        var stale=mvc.perform(post("/api/v1/admin/members").cookie(csrfCookie,new Cookie("GYM_SESSION","operator-csrf"))
            .header("X-XSRF-TOKEN","stale-token").contentType("application/json").content("{}")).andReturn().getResponse();
        assertThat(stale.getStatus()).isEqualTo(403);
        assertThat(stale.getContentAsString()).contains("CSRF_INVALID");
        verify(service,never()).operation(anyString(),anyString(),anyString(),anyMap(),any());

        when(service.operation(eq("account:17"),eq("/admin/members"),anyString(),anyMap(),any()))
            .thenReturn(new AuthService.Reply(201,Map.of("accountId","42"),null));
        var accepted=mvc.perform(post("/api/v1/admin/members").cookie(csrfCookie,new Cookie("GYM_SESSION","operator-csrf"))
            .header("X-XSRF-TOKEN",token).header("Idempotency-Key","desk-registration-test-0001")
            .contentType("application/json").content("{}")).andReturn().getResponse();
        assertThat(accepted.getStatus()).isEqualTo(201);
        verify(service,times(1)).operation(eq("account:17"),eq("/admin/members"),anyString(),anyMap(),any());

        when(service.authenticate("member-csrf")).thenReturn(new AuthService.Actor("99","2",List.of("MEMBER")));
        var denied=mvc.perform(post("/api/v1/admin/members").cookie(csrfCookie,new Cookie("GYM_SESSION","member-csrf"))
            .header("X-XSRF-TOKEN",token).contentType("application/json").content("{}")).andReturn().getResponse();
        assertThat(denied.getStatus()).isEqualTo(403);
        assertThat(denied.getContentAsString()).contains("ACCESS_DENIED").doesNotContain("CSRF_INVALID");
    }
}

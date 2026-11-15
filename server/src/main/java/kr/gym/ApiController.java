// [목적] ApiController.java 파일: HTTP 요청을 인증 서비스로 전달하고 공통 JSON 응답과 세션 쿠키를 만듭니다. 접근 권한과 CSRF 검사는 WebSecurity에서 수행합니다.
package kr.gym;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
class ApiController {
    private final AuthService service;
    private final ObjectMapper json;
    private final boolean secure;
    private final AttendanceService attendance;
    ApiController(AuthService service,AttendanceService attendance,ObjectMapper json,@Value("${gym.cookie-secure}") boolean secure){this.service=service;this.attendance=attendance;this.json=json;this.secure=secure;}
    // [처리 흐름] /auth/csrf GET API 처리: 클라이언트가 변경 요청에 넣을 CSRF 토큰과 헤더 이름을 조회합니다.
    @GetMapping("/auth/csrf") ResponseEntity<?> csrf(CsrfToken token){return response(AuthService.Reply.ok(Map.of("token",token.getToken(),"headerName",token.getHeaderName())));}
    // [처리 흐름] /me GET API 처리: 보안 필터에서 검증된 계정의 내 정보를 조회합니다.
    @GetMapping("/me") ResponseEntity<?> me(Authentication auth){return response(service.me((AuthService.Actor)auth.getPrincipal()));}
    // [기능] 본인 출석 API는 세션 주체의 월별 출석 날짜·고유 일수를 반환합니다.
    @GetMapping("/me/attendance") ResponseEntity<?> attendance(Authentication auth,@RequestParam(defaultValue="") String month) {
        return response(AuthService.Reply.ok(attendance.monthly((AuthService.Actor)auth.getPrincipal(),month)));
    }
    // [처리 흐름] /admin/members GET API는 운영자 권한으로 회원 목록을 조회합니다.
    @GetMapping("/admin/members") ResponseEntity<?> members(Authentication auth){return response(service.members((AuthService.Actor)auth.getPrincipal()));}
    // [기능] ApiController.command 메서드: 변경 요청을 공통 진입점에서 읽고 업무 경로에 맞는 서비스 함수를 호출합니다.
    @PostMapping({"/auth/login","/auth/mfa/verify","/auth/code/consume","/auth/logout","/auth/reauthenticate","/admin/members","/admin/accounts/{id}/status","/admin/accounts/{id}/codes"})
    ResponseEntity<?> command(HttpServletRequest request,Authentication authentication,@PathVariable(required=false) String id) throws IOException {
        // [처리 흐름] ApiController.command의 bytes 본문 길이 검사: 본문은 8KB까지만 허용합니다. 한 바이트 더 읽어 한도 초과 여부를 판별합니다.
        byte[] bytes=request.getInputStream().readNBytes(8193);
        if(bytes.length>8192)throw new ApiError(413,"BODY_TOO_LARGE","요청 내용이 너무 큽니다.");
        Map<String,Object> body;
        try{body=json.readValue(bytes,new TypeReference<>(){});}catch(Exception e){throw new ApiError(400,"INVALID_JSON","입력한 내용을 확인해 주세요.");}
        if(body==null)throw new ApiError(400,"INVALID_JSON","입력한 내용을 확인해 주세요.");
        var actor=authentication!=null && authentication.getPrincipal() instanceof AuthService.Actor a?a:null;
        String path=request.getRequestURI().substring("/api/v1".length());
        String source=request.getRemoteAddr();
        String scope=actor==null?service.publicScope(source,body):"account:"+actor.id();
        String target=id;
        return response(service.operation(scope,path,request.getHeader("Idempotency-Key"),body,()->switch(path){
            case "/auth/login" -> service.login(body,source);
            case "/auth/mfa/verify" -> service.verifyMfa(body,source);
            case "/auth/code/consume" -> service.consumeCode(body);
            case "/auth/logout" -> service.logout(actor);
            case "/auth/reauthenticate" -> service.reauthenticate(actor,body);
            case "/admin/members" -> service.register(actor,body);
            default -> path.endsWith("/status")?service.changeStatus(actor,target,body):service.issueCode(actor,target,body);
        }));
    }
    // [기능] response 메서드: 성공·실패 JSON 형식을 통일하고 세션 발급·삭제 쿠키 및 캐시 금지 헤더를 설정합니다.
    private ResponseEntity<?> response(AuthService.Reply reply) {
        var headers=new HttpHeaders();headers.setCacheControl("no-store");
        if(reply.sessionToken()!=null)headers.add(HttpHeaders.SET_COOKIE,ResponseCookie.from("GYM_SESSION",reply.sessionToken()).httpOnly(true).secure(secure).sameSite("Strict").path("/").maxAge(reply.sessionToken().isEmpty()?Duration.ZERO:Duration.ofDays(30)).build().toString());
        var meta=Map.of("requestId",UUID.randomUUID().toString(),"serverTime",Instant.now().toString());
        Object payload=reply.status()>=400?Map.of("error",Map.of("code",reply.data().get("errorCode"),"message",reply.data().get("errorMessage"),"fields",List.of()),"meta",meta):Map.of("data",reply.data(),"meta",meta);
        if(reply.status()==429)headers.set("Retry-After","900");
        return new ResponseEntity<>(payload,headers,reply.status());
    }
    // [처리 흐름] ApiController의 예외 처리기 처리: 업무 예외를 사용자 안내가 포함된 공통 오류 응답으로 바꿉니다.
    @ExceptionHandler(ApiError.class) ResponseEntity<?> error(ApiError error){return response(new AuthService.Reply(error.status,Map.of("errorCode",error.code,"errorMessage",error.getMessage()),null));}
    // [처리 흐름] ApiController의 예외 처리기 처리: DB 오류의 내부 세부 정보를 노출하지 않고 일시적인 서비스 오류로 응답합니다.
    @ExceptionHandler(org.springframework.dao.DataAccessException.class) ResponseEntity<?> databaseError(Exception error){return response(new AuthService.Reply(503,Map.of("errorCode","SERVICE_UNAVAILABLE","errorMessage","처리하지 못했습니다. 잠시 후 다시 시도해 주세요."),null));}
}



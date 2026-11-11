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
    ApiController(AuthService service,ObjectMapper json,@Value("${gym.cookie-secure}") boolean secure){this.service=service;this.json=json;this.secure=secure;}
    @GetMapping("/auth/csrf") ResponseEntity<?> csrf(CsrfToken token){return response(AuthService.Reply.ok(Map.of("token",token.getToken(),"headerName",token.getHeaderName())));}
    @GetMapping("/me") ResponseEntity<?> me(Authentication auth){return response(service.me((AuthService.Actor)auth.getPrincipal()));}
    @GetMapping("/admin/members") ResponseEntity<?> members(Authentication auth){return response(service.members((AuthService.Actor)auth.getPrincipal()));}
    @PostMapping({"/auth/login","/auth/mfa/verify","/auth/code/consume","/auth/logout","/auth/reauthenticate","/admin/members","/admin/accounts/{id}/status","/admin/accounts/{id}/codes"})
    ResponseEntity<?> command(HttpServletRequest request,Authentication authentication,@PathVariable(required=false) String id) throws IOException {
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
    private ResponseEntity<?> response(AuthService.Reply reply) {
        var headers=new HttpHeaders();headers.setCacheControl("no-store");
        if(reply.sessionToken()!=null)headers.add(HttpHeaders.SET_COOKIE,ResponseCookie.from("GYM_SESSION",reply.sessionToken()).httpOnly(true).secure(secure).sameSite("Strict").path("/").maxAge(reply.sessionToken().isEmpty()?Duration.ZERO:Duration.ofDays(30)).build().toString());
        var meta=Map.of("requestId",UUID.randomUUID().toString(),"serverTime",Instant.now().toString());
        Object payload=reply.status()>=400?Map.of("error",Map.of("code",reply.data().get("errorCode"),"message",reply.data().get("errorMessage"),"fields",List.of()),"meta",meta):Map.of("data",reply.data(),"meta",meta);
        if(reply.status()==429)headers.set("Retry-After","900");
        return new ResponseEntity<>(payload,headers,reply.status());
    }
    @ExceptionHandler(ApiError.class) ResponseEntity<?> error(ApiError error){return response(new AuthService.Reply(error.status,Map.of("errorCode",error.code,"errorMessage",error.getMessage()),null));}
    @ExceptionHandler(org.springframework.dao.DataAccessException.class) ResponseEntity<?> databaseError(Exception error){return response(new AuthService.Reply(503,Map.of("errorCode","SERVICE_UNAVAILABLE","errorMessage","처리하지 못했습니다. 잠시 후 다시 시도해 주세요."),null));}
}

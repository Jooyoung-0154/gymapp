// [목적] WebSecurity.java 파일: API별 접근 권한, CORS, CSRF, 세션 쿠키 인증 필터와 보안 응답 헤더를 설정합니다.
package kr.gym;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.*;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.csrf.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.cors.*;

@Configuration
class WebSecurity {
    // [기능] WebSecurity.security 메서드: CORS 허용 출처를 설정하고 API 권한·CSRF·쿠키 인증 필터를 하나의 보안 체인으로 구성합니다.
    @Bean SecurityFilterChain security(HttpSecurity http,AuthService service,ObjectMapper json,@Value("${gym.cookie-secure}") boolean secure,@Value("${gym.cors.allowed-origins:}") String allowedOrigins) throws Exception {
        // [목적] WebSecurity.security의 csrf 토큰 저장소: CSRF 쿠키는 요청 위조 방지용입니다. 로그인 세션 쿠키와 별개로 취급합니다.
        var csrf=CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookieCustomizer(builder->builder.sameSite("Strict").secure(secure).path("/"));
        var cors = new CorsConfiguration();
        // [처리 흐름] cors.setAllowedOrigins 설정: 명시한 출처에만 쿠키 포함 교차 출처 요청을 허용합니다.
        cors.setAllowedOrigins(Arrays.stream(allowedOrigins.split(",")).map(String::trim).filter(s->!s.isEmpty()).toList());
        cors.setAllowedMethods(List.of("GET","POST","OPTIONS"));
        cors.setAllowedHeaders(List.of("Accept","Content-Type","X-XSRF-TOKEN","Idempotency-Key"));
        cors.setAllowCredentials(true);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/**",cors);
        http.cors(c->c.configurationSource(source))
            .sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(c->c.disable()).formLogin(c->c.disable()).httpBasic(c->c.disable()).logout(c->c.disable())
            .csrf(c->c.csrfTokenRepository(csrf).csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .authorizeHttpRequests(c->c
                .requestMatchers("/api/v1/admin/**","/api/v1/auth/reauthenticate").hasRole("OPERATOR")
                .requestMatchers("/api/v1/me/attendance","/api/v1/me/qr","/api/v1/me/qr/**").hasRole("MEMBER")
                .requestMatchers("/api/v1/occupancy").authenticated()
                .requestMatchers("/api/v1/me","/api/v1/me/membership","/api/v1/me/nickname","/api/v1/auth/logout").authenticated()
                .requestMatchers("/api/v1/auth/register","/api/v1/auth/login","/api/v1/auth/mfa/verify","/api/v1/auth/code/consume","/api/v1/auth/csrf").permitAll()
                .requestMatchers("/api/**").denyAll().anyRequest().permitAll())
            .exceptionHandling(c->c.authenticationEntryPoint((request,response,error)->failure(response,json,401,"UNAUTHENTICATED","다시 로그인해 주세요."))
                .accessDeniedHandler((request,response,error)->{
                    // [목적] CSRF 거절과 역할 부족을 분리해 잘못된 재로그인 안내를 피합니다.
                    if(error instanceof CsrfException) failure(response,json,403,"CSRF_INVALID","요청 인증이 변경됐어요. 다시 시도해 주세요.");
                    else failure(response,json,403,"ACCESS_DENIED","이 기능을 사용할 권한이 없습니다. 필요한 권한의 계정으로 로그인해 주세요.");
                }))
            .headers(c->c.contentSecurityPolicy(p->p.policyDirectives("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")))
            .addFilterBefore(new OncePerRequestFilter(){
                @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                    if(request.getContentLengthLong()>8192){failure(response,json,413,"BODY_TOO_LARGE","요청 내용이 너무 큽니다.");return;}
                    // [처리 흐름] 인증 필터의 GYM_SESSION 쿠키 조회: 요청 쿠키의 GYM_SESSION을 읽어 DB 세션을 검증합니다.
                    String token=null;
                    if(request.getCookies()!=null) for(Cookie cookie:request.getCookies())if(cookie.getName().equals("GYM_SESSION"))token=cookie.getValue();
                    AuthService.Actor actor;
                    try { actor=service.authenticate(token); }
                    catch(RuntimeException error){failure(response,json,503,"SERVICE_UNAVAILABLE","연결을 확인하고 다시 시도해 주세요.");return;}
                    if(actor!=null) {
                        var authentication=new UsernamePasswordAuthenticationToken(actor,null,actor.roles().stream().map(r->new SimpleGrantedAuthority("ROLE_"+r)).toList());
                        var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(authentication);SecurityContextHolder.setContext(context);
                    }
                    // [처리 흐름] 인증 필터의 chain.doFilter 및 finally 처리: 인증 정보를 다음 처리로 전달하고 완료 후 스레드의 인증 컨텍스트를 비웁니다.
                    try {chain.doFilter(request,response);}finally{SecurityContextHolder.clearContext();}
                }
            },AnonymousAuthenticationFilter.class);
        return http.build();
    }
    // [기능] failure 메서드: 보안 필터 단계에서 발생한 실패를 공통 JSON 오류 형식으로 응답합니다.
    static void failure(HttpServletResponse response,ObjectMapper json,int status,String code,String message) throws IOException {
        response.setStatus(status);response.setContentType("application/json;charset=UTF-8");response.setHeader("Cache-Control","no-store");
        json.writeValue(response.getOutputStream(),Map.of("error",Map.of("code",code,"message",message,"fields",List.of()),"meta",Map.of("requestId",UUID.randomUUID().toString(),"serverTime",java.time.Instant.now().toString())));
    }
}




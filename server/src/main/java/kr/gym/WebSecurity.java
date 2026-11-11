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

@Configuration
class WebSecurity {
    @Bean SecurityFilterChain security(HttpSecurity http,AuthService service,ObjectMapper json,@Value("${gym.cookie-secure}") boolean secure) throws Exception {
        var csrf=CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookieCustomizer(builder->builder.sameSite("Strict").secure(secure).path("/"));
        http.sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(c->c.disable()).formLogin(c->c.disable()).httpBasic(c->c.disable()).logout(c->c.disable())
            .csrf(c->c.csrfTokenRepository(csrf).csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .authorizeHttpRequests(c->c
                .requestMatchers("/api/v1/admin/**","/api/v1/auth/reauthenticate").hasRole("OPERATOR")
                .requestMatchers("/api/v1/me","/api/v1/auth/logout").authenticated()
                .requestMatchers("/api/v1/auth/login","/api/v1/auth/mfa/verify","/api/v1/auth/code/consume","/api/v1/auth/csrf").permitAll()
                .requestMatchers("/api/**").denyAll().anyRequest().permitAll())
            .exceptionHandling(c->c.authenticationEntryPoint((request,response,error)->failure(response,json,401,"UNAUTHENTICATED","다시 로그인해 주세요."))
                .accessDeniedHandler((request,response,error)->failure(response,json,403,"ACCESS_DENIED","권한이 없거나 요청 인증이 만료됐습니다. 화면을 새로 열어 주세요.")))
            .headers(c->c.contentSecurityPolicy(p->p.policyDirectives("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")))
            .addFilterBefore(new OncePerRequestFilter(){
                @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                    if(request.getContentLengthLong()>8192){failure(response,json,413,"BODY_TOO_LARGE","요청 내용이 너무 큽니다.");return;}
                    String token=null;
                    if(request.getCookies()!=null) for(Cookie cookie:request.getCookies())if(cookie.getName().equals("GYM_SESSION"))token=cookie.getValue();
                    AuthService.Actor actor;
                    try { actor=service.authenticate(token); }
                    catch(RuntimeException error){failure(response,json,503,"SERVICE_UNAVAILABLE","연결을 확인하고 다시 시도해 주세요.");return;}
                    if(actor!=null) {
                        var authentication=new UsernamePasswordAuthenticationToken(actor,null,actor.roles().stream().map(r->new SimpleGrantedAuthority("ROLE_"+r)).toList());
                        var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(authentication);SecurityContextHolder.setContext(context);
                    }
                    try {chain.doFilter(request,response);}finally{SecurityContextHolder.clearContext();}
                }
            },AnonymousAuthenticationFilter.class);
        return http.build();
    }
    static void failure(HttpServletResponse response,ObjectMapper json,int status,String code,String message) throws IOException {
        response.setStatus(status);response.setContentType("application/json;charset=UTF-8");response.setHeader("Cache-Control","no-store");
        json.writeValue(response.getOutputStream(),Map.of("error",Map.of("code",code,"message",message,"fields",List.of()),"meta",Map.of("requestId",UUID.randomUUID().toString(),"serverTime",java.time.Instant.now().toString())));
    }
}

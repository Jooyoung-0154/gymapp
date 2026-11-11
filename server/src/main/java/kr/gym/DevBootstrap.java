package kr.gym;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(name="gym.bootstrap",havingValue="true")
class DevBootstrap implements ApplicationRunner {
    private final JdbcTemplate db;private final SecurityTools crypto;private final ObjectMapper json;private final TransactionTemplate tx;
    private final Path file;private final boolean local;
    DevBootstrap(JdbcTemplate db,SecurityTools crypto,ObjectMapper json,TransactionTemplate tx,@Value("${gym.bootstrap-file}") String file,@Value("${gym.local}") boolean local){this.db=db;this.crypto=crypto;this.json=json;this.tx=tx;this.file=Path.of(file);this.local=local;}
    @Override public void run(ApplicationArguments arguments) throws Exception {
        if(!local)throw new IllegalStateException("Development bootstrap requires explicit local mode");
        Map<String,String> credentials;
        if(Files.exists(file))credentials=json.readValue(Files.readString(file),new com.fasterxml.jackson.core.type.TypeReference<>(){});
        else {
            String phone="01000000000",password=crypto.randomToken();byte[] bytes=new byte[20];new SecureRandom().nextBytes(bytes);String secret=Base64.getEncoder().encodeToString(bytes);
            if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT FROM gym.accounts WHERE phone_lookup_hmac=?)",Boolean.class,crypto.fingerprint("phone:"+phone))))throw new IllegalStateException("Bootstrap phone already exists; credentials must not be overwritten");
            tx.executeWithoutResult(status->{
                Long accountId=db.queryForObject("INSERT INTO gym.accounts(phone_lookup_hmac,phone_ciphertext,display_name_ciphertext,pii_key_ref,password_hash,status) VALUES(?,?,?,'local-dev',?,'ACTIVE') RETURNING id",Long.class,crypto.fingerprint("phone:"+phone),crypto.encrypt(phone),crypto.encrypt("개발 운영자"),crypto.hashPassword(password));
                db.update("INSERT INTO gym.account_roles(account_id,role,granted_by) VALUES(?,'OPERATOR',?)",accountId,accountId);
                db.update("INSERT INTO gym.mfa_enrollments(account_id,secret_ciphertext,key_ref,confirmed_at) VALUES(? ,?,'local-dev',now())",accountId,crypto.encrypt(secret));
                db.update("INSERT INTO gym.audit_events(actor_account_id,actor_type,target_type,target_id,action,reason_code,purge_after) VALUES(?,'SYSTEM','ACCOUNT',?,'DEV_BOOTSTRAP','LOCAL_SYNTHETIC_ACCOUNT',now()+interval '1 year')",accountId,accountId.toString());
            });
            credentials=Map.of("phone",phone,"password",password,"totpSecret",secret);
            Files.createDirectories(file.getParent());Files.writeString(file,json.writeValueAsString(credentials),StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
        }
        String template=new String(getClass().getResourceAsStream("/dev-guide.html").readAllBytes(),StandardCharsets.UTF_8);
        String data=json.writeValueAsString(credentials).replace("<","\\u003c");
        Files.writeString(file.resolveSibling("시작안내.html"),template.replace("__CREDENTIALS__",data),StandardCharsets.UTF_8);
        System.out.println("Local development operator guide saved under .validation/app. Credentials were not printed.");
    }
}

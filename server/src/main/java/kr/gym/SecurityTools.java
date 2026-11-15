// [목적] SecurityTools.java 파일: 비밀번호 해시·개인정보 암복호화·검색용 HMAC·일회용 인증번호 계산을 모은 보안 도구입니다.
package kr.gym;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class SecurityTools {
    private final byte[] encryptionKey, lookupKey;
    private final SecureRandom random = new SecureRandom();
    private final Pbkdf2PasswordEncoder passwords = Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    public SecurityTools(@Value("${gym.encryption-key}") String encryptionKey, @Value("${gym.lookup-key}") String lookupKey) {
        this.encryptionKey=Base64.getDecoder().decode(encryptionKey);
        this.lookupKey=Base64.getDecoder().decode(lookupKey);
        if(this.encryptionKey.length!=32 || this.lookupKey.length!=32) throw new IllegalArgumentException("32-byte keys required");
    }
    // [기능] randomToken 메서드: 보안 난수 32바이트를 URL에 사용할 수 있는 토큰 문자열로 만듭니다.
    public String randomToken() { byte[] bytes=new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    // [기능] fingerprint 메서드: 조회용 비밀키로 HMAC을 계산합니다. 복호화하는 암호문과 달리 동일 값 검색·비교에 사용합니다.
    public byte[] fingerprint(String value) { return hmac(lookupKey,value.getBytes(StandardCharsets.UTF_8),"HmacSHA256"); }
    // [기능] fingerprintHex 메서드: HMAC 바이트를 16진수 문자열로 표현합니다.
    public String fingerprintHex(String value) { return HexFormat.of().formatHex(fingerprint(value)); }
    // [기능] encrypt 메서드: 새 초기화 벡터를 사용해 문자열을 AES-GCM으로 암호화합니다.
    public byte[] encrypt(String value) {
        try {
            byte[] nonce=new byte[12]; random.nextBytes(nonce);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,nonce));
            byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(12+encrypted.length).put(nonce).put(encrypted).array();
        } catch(GeneralSecurityException e) { throw new IllegalStateException("Encryption failed",e); }
    }
    // [기능] decrypt 메서드: 저장된 초기화 벡터와 인증 태그를 사용해 암호문을 검증하고 복호화합니다.
    public String decrypt(byte[] value) {
        try {
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,Arrays.copyOf(value,12)));
            return new String(cipher.doFinal(Arrays.copyOfRange(value,12,value.length)),StandardCharsets.UTF_8);
        } catch(GeneralSecurityException e) { throw new IllegalStateException("Decryption failed",e); }
    }
    // [기능] hashPassword 메서드: 비밀번호 정책을 검사한 뒤 PBKDF2 단방향 해시를 생성합니다.
    public String hashPassword(String password) { validatePassword(password); return passwords.encode(password); }
    // [기능] matches 메서드: 입력 비밀번호가 저장된 해시와 일치하는지 검사합니다.
    public boolean matches(String password,String encoded) { return encoded!=null && passwords.matches(password,encoded); }
    // [기능] validatePassword 메서드: 서버가 허용하는 비밀번호 조건을 검사합니다.
    public static void validatePassword(String value) {
        int length=value.codePointCount(0,value.length());
        if(length<12 || length>128) throw ApiError.invalid("비밀번호는 12~128자로 입력해 주세요.");
    }
    // [기능] phone 메서드: 전화번호 입력을 정규화하고 허용 형식인지 검사합니다.
    public static String phone(String value) {
        String phone=value.replaceAll("[ -]","");
        if(phone.startsWith("+82")) phone="0"+phone.substring(3);
        if(!phone.matches("01[016789][0-9]{7,8}")) throw ApiError.invalid("등록할 휴대전화번호를 확인해 주세요.");
        return phone;
    }
    // [기능] totp 메서드: 현재 시각을 30초 구간으로 나누어 6자리 TOTP 인증번호를 계산합니다.
    public static String totp(String secret,Instant now) { return totpAt(secret,now.getEpochSecond()/30); }
    // [기능] totpAt 메서드: 지정한 시간 구간의 HMAC으로 6자리 인증번호를 계산합니다.
    static String totpAt(String secret,long step) {
        byte[] hash=hmac(Base64.getDecoder().decode(secret),ByteBuffer.allocate(8).putLong(step).array(),"HmacSHA1");
        int at=hash[hash.length-1]&15;
        int value=ByteBuffer.wrap(hash,at,4).getInt()&0x7fffffff;
        return String.format(Locale.ROOT,"%06d",value%1000000);
    }
    // [기능] verifyTotp 메서드: 허용한 시간 오차 범위에서 번호를 검사하고 이전에 사용한 시간 구간을 제외합니다.
    public static long verifyTotp(String secret,String code,Instant now,long lastStep) {
        if(!code.matches("[0-9]{6}")) return -1;
        long step=now.getEpochSecond()/30;
        for(long candidate=step-1;candidate<=step+1;candidate++) {
            if(candidate>lastStep && MessageDigest.isEqual(totpAt(secret,candidate).getBytes(StandardCharsets.US_ASCII),code.getBytes(StandardCharsets.US_ASCII))) return candidate;
        }
        return -1;
    }
    // [기능] base32 메서드: 인증 앱 등록에 사용하는 Base32 문자열로 변환합니다.
    public static String base32(String base64) {
        String alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        StringBuilder output=new StringBuilder(); int bits=0,buffer=0;
        for(byte b:Base64.getDecoder().decode(base64)) { buffer=(buffer<<8)|(b&255); bits+=8; while(bits>=5){bits-=5;output.append(alphabet.charAt((buffer>>bits)&31));} }
        if(bits>0) output.append(alphabet.charAt((buffer<<(5-bits))&31));
        return output.toString();
    }
    // [기능] hmac 메서드: 지정한 비밀키와 해시 알고리즘으로 메시지 인증 코드를 계산합니다.
    private static byte[] hmac(byte[] key,byte[] message,String algorithm) {
        try { Mac mac=Mac.getInstance(algorithm);mac.init(new SecretKeySpec(key,algorithm));return mac.doFinal(message); }
        catch(GeneralSecurityException e){throw new IllegalStateException(e);}
    }
}

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
    public String randomToken() { byte[] bytes=new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public byte[] fingerprint(String value) { return hmac(lookupKey,value.getBytes(StandardCharsets.UTF_8),"HmacSHA256"); }
    public String fingerprintHex(String value) { return HexFormat.of().formatHex(fingerprint(value)); }
    public byte[] encrypt(String value) {
        try {
            byte[] nonce=new byte[12]; random.nextBytes(nonce);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,nonce));
            byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(12+encrypted.length).put(nonce).put(encrypted).array();
        } catch(GeneralSecurityException e) { throw new IllegalStateException("Encryption failed",e); }
    }
    public String decrypt(byte[] value) {
        try {
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,Arrays.copyOf(value,12)));
            return new String(cipher.doFinal(Arrays.copyOfRange(value,12,value.length)),StandardCharsets.UTF_8);
        } catch(GeneralSecurityException e) { throw new IllegalStateException("Decryption failed",e); }
    }
    public String hashPassword(String password) { validatePassword(password); return passwords.encode(password); }
    public boolean matches(String password,String encoded) { return encoded!=null && passwords.matches(password,encoded); }
    public static void validatePassword(String value) {
        int length=value.codePointCount(0,value.length());
        if(length<12 || length>128) throw ApiError.invalid("비밀번호는 12~128자로 입력해 주세요.");
    }
    public static String phone(String value) {
        String phone=value.replaceAll("[ -]","");
        if(phone.startsWith("+82")) phone="0"+phone.substring(3);
        if(!phone.matches("01[016789][0-9]{7,8}")) throw ApiError.invalid("등록할 휴대전화번호를 확인해 주세요.");
        return phone;
    }
    public static String totp(String secret,Instant now) { return totpAt(secret,now.getEpochSecond()/30); }
    static String totpAt(String secret,long step) {
        byte[] hash=hmac(Base64.getDecoder().decode(secret),ByteBuffer.allocate(8).putLong(step).array(),"HmacSHA1");
        int at=hash[hash.length-1]&15;
        int value=ByteBuffer.wrap(hash,at,4).getInt()&0x7fffffff;
        return String.format(Locale.ROOT,"%06d",value%1000000);
    }
    public static long verifyTotp(String secret,String code,Instant now,long lastStep) {
        if(!code.matches("[0-9]{6}")) return -1;
        long step=now.getEpochSecond()/30;
        for(long candidate=step-1;candidate<=step+1;candidate++) {
            if(candidate>lastStep && MessageDigest.isEqual(totpAt(secret,candidate).getBytes(StandardCharsets.US_ASCII),code.getBytes(StandardCharsets.US_ASCII))) return candidate;
        }
        return -1;
    }
    public static String base32(String base64) {
        String alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        StringBuilder output=new StringBuilder(); int bits=0,buffer=0;
        for(byte b:Base64.getDecoder().decode(base64)) { buffer=(buffer<<8)|(b&255); bits+=8; while(bits>=5){bits-=5;output.append(alphabet.charAt((buffer>>bits)&31));} }
        if(bits>0) output.append(alphabet.charAt((buffer<<(5-bits))&31));
        return output.toString();
    }
    private static byte[] hmac(byte[] key,byte[] message,String algorithm) {
        try { Mac mac=Mac.getInstance(algorithm);mac.init(new SecretKeySpec(key,algorithm));return mac.doFinal(message); }
        catch(GeneralSecurityException e){throw new IllegalStateException(e);}
    }
}

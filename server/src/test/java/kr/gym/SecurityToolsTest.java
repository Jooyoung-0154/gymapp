package kr.gym;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.Base64;
import static org.assertj.core.api.Assertions.*;

class SecurityToolsTest {
    private final SecurityTools tools=new SecurityTools(Base64.getEncoder().encodeToString(new byte[32]),Base64.getEncoder().encodeToString(new byte[32]));
    @Test void authenticatedEncryptionRejectsTamperingAndUsesRandomNonces() {
        byte[] first=tools.encrypt("가상 회원");
        assertThat(tools.decrypt(first)).isEqualTo("가상 회원");
        assertThat(tools.encrypt("가상 회원")).isNotEqualTo(first);
        first[first.length-1]^=1;
        assertThatThrownBy(()->tools.decrypt(first)).isInstanceOf(IllegalStateException.class);
    }
    @Test void passwordBoundariesAndHashing() {
        assertThatThrownBy(()->tools.hashPassword("short")).isInstanceOf(ApiError.class);
        String password="가".repeat(128),hash=tools.hashPassword(password);
        assertThat(tools.matches(password,hash)).isTrue();
        assertThat(tools.matches(password+"x",hash)).isFalse();
        assertThatThrownBy(()->tools.hashPassword(password+"가")).isInstanceOf(ApiError.class);
    }
    @Test void totpMatchesRfc6238VectorAndRejectsReplay() {
        String secret=Base64.getEncoder().encodeToString("12345678901234567890".getBytes());
        Instant time=Instant.ofEpochSecond(59);
        assertThat(SecurityTools.totp(secret,time)).isEqualTo("287082");
        assertThat(SecurityTools.verifyTotp(secret,"287082",time,-1)).isEqualTo(1);
        assertThat(SecurityTools.verifyTotp(secret,"287082",time,1)).isEqualTo(-1);
        assertThat(SecurityTools.base32(secret)).isEqualTo("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    }
    @Test void phoneNormalizationPreventsAlternateFormatDuplicates() {
        assertThat(SecurityTools.phone("+82 10-1234-5678")).isEqualTo("01012345678");
        assertThatThrownBy(()->SecurityTools.phone("not a number")).isInstanceOf(ApiError.class);
    }
}

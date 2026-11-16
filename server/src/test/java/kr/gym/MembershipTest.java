package kr.gym;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

// [목적] 이용권의 접근 권한·기간 검증·미등록 상태·중복 기간 거부를 확인합니다.
class MembershipTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final AuthService service=new AuthService(db,mock(SecurityTools.class),mock(TransactionTemplate.class),new ObjectMapper());
    final AuthService.Actor operator=new AuthService.Actor("1","1",List.of("OPERATOR"));
    @Test void memberCannotRegister() {
        assertThatThrownBy(()->service.registerMembership(new AuthService.Actor("2","2",List.of("MEMBER")),"2",Map.of())).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.status).isEqualTo(403));
        verifyNoInteractions(db);
    }
    @Test void rejectsReversedDatesBeforeDatabase() {
        assertThatThrownBy(()->service.registerMembership(operator,"2",Map.of("startsOn","2026-12-02","expiresOn","2026-12-01"))).isInstanceOf(ApiError.class);
        verifyNoInteractions(db);
    }
    @Test void unregisteredDoesNotReturnExampleDates() {
        var result=service.membership(operator).data();
        assertThat(result).containsEntry("registered",false).doesNotContainKey("expiresOn");
    }
    @Test void overlapIsRejectedBeforeInsert() {
        when(db.queryForList(contains("FOR UPDATE OF m"),eq("2"))).thenReturn(List.of(Map.of("id",22L)));
        when(db.queryForList(contains("current_expires_on>=?::date"),eq("22"),eq("2026-12-31"),eq("2026-12-01"))).thenReturn(List.of(Map.of("id",3L)));
        assertThatThrownBy(()->service.registerMembership(operator,"2",Map.of("startsOn","2026-12-01","expiresOn","2026-12-31"))).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.code).isEqualTo("MEMBERSHIP_OVERLAP"));
        verify(db,never()).update(anyString(),any(Object[].class));
    }
    @Test void registersUsingMemberAndOperatorIdentity() {
        when(db.queryForList(contains("FOR UPDATE OF m"),eq("2"))).thenReturn(List.of(Map.of("id",22L)));
        when(db.queryForList(contains("SELECT id FROM gym.policy_versions"))).thenReturn(List.of(Map.of("id",1L)));
        when(db.queryForObject(contains("INSERT INTO gym.memberships"),eq(Long.class),eq("22"),eq("2026-12-01"),eq("2026-12-31"),eq("2026-12-01"),eq("2026-12-31"),eq("1"),eq(1L))).thenReturn(99L);
        assertThat(service.registerMembership(operator,"2",Map.of("startsOn","2026-12-01","expiresOn","2026-12-31")).data()).containsEntry("membershipId","99");
    }
}

package kr.gym;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

// [목적] 만료·정지 세션·미등록 기기를 거부하고 정상·중복 입장을 구분하는 서비스 검증입니다.
class CheckinServiceTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final SecurityTools crypto=mock(SecurityTools.class);
    final FacilityService facility=mock(FacilityService.class);
    final Instant now=Instant.parse("2026-11-16T13:00:00Z");
    final CheckinService service=new CheckinService(db,crypto,facility,Clock.fixed(now,ZoneOffset.UTC));
    final AuthService.Actor admin=new AuthService.Actor("1","9",List.of("OPERATOR"));
    final Map<String,Object> qr=new HashMap<>();
    boolean device=true,session=true,duplicate=false,paused=false;
    final String token="gymqr:"+"A".repeat(43);
    @BeforeEach void data() {
        qr.put("id",55L);qr.put("expires_at",Timestamp.from(now.plusSeconds(60)));
        when(crypto.fingerprint(anyString())).thenReturn(new byte[]{1});
        when(crypto.decrypt(any(byte[].class))).thenReturn("운동회원");
        when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(inv->{
            String sql=inv.getArgument(0);
            if(sql.contains("FROM gym.checkin_devices")) return device?List.of(Map.of("id",9L)):List.of();
            if(sql.contains("FOR UPDATE OF a,m")) return List.of(Map.of("member_id",22L,"account_id",17L,"display_name_ciphertext",new byte[]{1}));
            if(sql.startsWith("SELECT q.id,a.id")) return List.of(Map.of("id",55L,"account_id",17L));
            if(sql.startsWith("SELECT q.id,q.used_at")) return session?List.of(qr):List.of();
            if(sql.contains("FROM gym.pause_requests")) return paused?List.of(Map.of("id",7L)):List.of();
            if(sql.contains("FROM gym.memberships")) return List.of(Map.of("id",31L));
            if(sql.contains("FROM gym.occupancy_windows")) return duplicate?List.of(Map.of("id",44L)):List.of();
            if(sql.contains("FROM gym.visits")) return duplicate?List.of(Map.of("id",77L)):List.of();
            return List.of();
        });
        when(db.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(99L);
    }
    AuthService.Reply scan() { return service.consume(admin,Map.of("deviceId","9","qrToken",token),"request-key-for-checkin-0001"); }
    @Test void expiredTokenIsRejectedBeforeAnyWrite() {
        qr.put("expires_at",Timestamp.from(now));
        assertThatThrownBy(this::scan).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.code).isEqualTo("QR_EXPIRED_OR_USED"));
        verify(db,never()).update(anyString(),any(Object[].class));
    }
    @Test void usedTokenCannotCreateAnotherVisit() {
        qr.put("used_at",Timestamp.from(now.minusSeconds(1)));
        assertThatThrownBy(this::scan).isInstanceOf(ApiError.class);
        verify(db,never()).queryForObject(anyString(),eq(Long.class),any(Object[].class));
    }
    @Test void unknownDeviceAndLoggedOutMemberSessionAreRejected() {
        device=false;
        assertThatThrownBy(this::scan).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.code).isEqualTo("DEVICE_NOT_REGISTERED"));
        device=true;session=false;
        assertThatThrownBy(this::scan).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.code).isEqualTo("QR_SESSION_ENDED"));
    }
    @Test void pauseIsCheckedAtConsumption() {
        paused=true;
        assertThatThrownBy(this::scan).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.code).isEqualTo("MEMBERSHIP_PAUSED"));
        verify(db,never()).update(anyString(),any(Object[].class));
    }
    @Test void acceptedVisitConsumesTokenAndRecordsARequest() {
        var result=scan().data();
        assertThat(result).containsEntry("accepted",true).containsEntry("duplicate",false).containsEntry("attendanceDate","2026-11-16");
        verify(db).update(startsWith("UPDATE gym.member_qr_credentials SET used_at"),any(Object[].class));
        verify(db).update(startsWith("INSERT INTO gym.checkin_requests"),any(Object[].class));
    }
    @Test void sameWindowAndDateDoesNotCreateOrExtendOccupancy() {
        duplicate=true;
        assertThat(scan().data()).containsEntry("duplicate",true).containsEntry("visitId","77");
        verify(db,never()).queryForObject(startsWith("INSERT INTO gym.occupancy_windows"),eq(Long.class),any(Object[].class));
        verify(db,never()).queryForObject(startsWith("INSERT INTO gym.visits"),eq(Long.class),any(Object[].class));
    }
    @Test void ordinaryMemberCannotConsumeQr() {
        assertThatThrownBy(()->service.consume(new AuthService.Actor("17","5",List.of("MEMBER")),Map.of(),"request-key")).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.status).isEqualTo(403));
    }
}

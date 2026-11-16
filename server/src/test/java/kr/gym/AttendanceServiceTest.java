// [목적] AttendanceServiceTest는 본인 범위·월 경계·중복 제거 뷰 사용과 빈 조회를 검증합니다.
package kr.gym;

import java.sql.Date;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AttendanceServiceTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final Clock clock=Clock.fixed(Instant.parse("2026-11-14T15:30:00Z"),ZoneId.of("Asia/Seoul"));
    final AttendanceService service=new AttendanceService(db,clock);
    final AuthService.Actor actor=new AuthService.Actor("17","1",List.of("MEMBER"));
    @Test void monthlyUsesAuthenticatedAccountAndSeoulDate() {
        when(db.queryForList(anyString(),eq("17"))).thenReturn(List.of(Map.of("id",42L)));
        when(db.queryForList(anyString(),eq(Date.class),eq("42"),eq(Date.valueOf("2026-11-01")),eq(Date.valueOf("2026-12-01")),eq(Date.valueOf("2026-11-15"))))
            .thenReturn(List.of(Date.valueOf("2026-11-02"),Date.valueOf("2026-11-15")));
        when(db.queryForObject(anyString(),eq(Date.class),eq("42"),eq(Date.valueOf("2026-11-15")))).thenReturn(Date.valueOf("2026-10-01"));
        var result=service.monthly(actor,"2026-11");
        assertThat(result.get("today")).isEqualTo("2026-11-15");
        assertThat(result.get("attendanceCount")).isEqualTo(2);
        assertThat(result.get("attendanceDates")).isEqualTo(List.of("2026-11-02","2026-11-15"));
        assertThat(result.get("earliestMonth")).isEqualTo("2026-10");
        verify(db).queryForList(contains("account_id=?::bigint"),eq("17"));
        verify(db).queryForList(contains("gym.member_attendance_days"),eq(Date.class),eq("42"),any(),any(),any());
    }
    @Test void noHistoryIsEmptyRatherThanDemoRecords() {
        when(db.queryForList(anyString(),eq("17"))).thenReturn(List.of(Map.of("id",42L)));
        when(db.queryForList(anyString(),eq(Date.class),eq("42"),any(),any(),any())).thenReturn(List.of());
        var result=service.monthly(actor,"2026-11");
        assertThat(result.get("attendanceCount")).isEqualTo(0);
        assertThat(result.get("attendanceDates")).isEqualTo(List.of());
        assertThat(result.get("earliestMonth")).isEqualTo("2026-11");
    }
    @Test void unknownOrInactiveMemberDoesNotReadAttendance() {
        when(db.queryForList(anyString(),eq("17"))).thenReturn(List.of());
        assertThatThrownBy(()->service.monthly(actor,"2026-11")).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.status).isEqualTo(404));
        verify(db,never()).queryForObject(anyString(),eq(Date.class),any(),any());
    }
    @Test void rejectsInvalidAndFutureMonthsBeforeDatabaseAccess() {
        for(String value:List.of("2026-13","2026-1","2026-12","1899-01","x")) {
            assertThatThrownBy(()->service.monthly(actor,value)).isInstanceOfSatisfying(ApiError.class,e->assertThat(e.status).isEqualTo(422));
        }
        verifyNoInteractions(db);
    }
}


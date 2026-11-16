package kr.gym;

import java.time.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

// [목적] QR 만료·한국 날짜·2시간 경계와 영업시간 경계를 검증합니다.
class CheckinRulesTest {
    final Instant start=Instant.parse("2026-11-16T14:30:00Z");
    @Test void qrExpiresAtExactlySixtySecondsAndUsedTokensCannotPass() {
        assertThat(CheckinRules.usable(start.plusSeconds(60),null,null,start.plusSeconds(59))).isTrue();
        assertThat(CheckinRules.usable(start.plusSeconds(60),null,null,start.plusSeconds(60))).isFalse();
        assertThat(CheckinRules.usable(start.plusSeconds(60),start,null,start)).isFalse();
        assertThat(CheckinRules.usable(start.plusSeconds(60),null,start,start)).isFalse();
    }
    @Test void occupancyExcludesTheExactEndAndUsesKoreanDate() {
        assertThat(CheckinRules.inWindow(start,start.plusSeconds(7200),start.plusSeconds(7199))).isTrue();
        assertThat(CheckinRules.inWindow(start,start.plusSeconds(7200),start.plusSeconds(7200))).isFalse();
        assertThat(CheckinRules.today(Instant.parse("2026-11-16T15:00:00Z"))).isEqualTo(LocalDate.parse("2026-11-17"));
    }
    @Test void overnightOpeningHoursIncludeOpeningAndExcludeClosing() {
        LocalDate day=LocalDate.parse("2026-11-16");
        assertThat(CheckinRules.open(day,LocalTime.of(22,0),LocalTime.of(2,0),1,Instant.parse("2026-11-16T13:00:00Z"))).isTrue();
        assertThat(CheckinRules.open(day,LocalTime.of(22,0),LocalTime.of(2,0),1,Instant.parse("2026-11-16T17:00:00Z"))).isFalse();
    }
    @Test void missingCrowdingThresholdsAreNotReportedAsQuiet() {
        assertThat(CheckinRules.crowding(0,null,null)).isEqualTo("UNCONFIGURED");
        assertThat(CheckinRules.crowding(9,10,20)).isEqualTo("QUIET");
        assertThat(CheckinRules.crowding(10,10,20)).isEqualTo("NORMAL");
        assertThat(CheckinRules.crowding(20,10,20)).isEqualTo("CROWDED");
    }
}

// [목적] 입장·QR·혼잡도에 사용하는 시간 경계 규칙입니다. 모든 판정은 서버 시간과 한국 날짜를 사용합니다.
package kr.gym;
import java.time.*;
final class CheckinRules {
    static final ZoneId SEOUL=ZoneId.of("Asia/Seoul");
    static LocalDate today(Instant now) { return now.atZone(SEOUL).toLocalDate(); }
    static boolean usable(Instant expiresAt,Instant usedAt,Instant revokedAt,Instant now) { return usedAt==null && revokedAt==null && now.isBefore(expiresAt); }
    static boolean inWindow(Instant startsAt,Instant endsAt,Instant now) { return !now.isBefore(startsAt) && now.isBefore(endsAt); }
    static boolean open(LocalDate day,LocalTime opens,LocalTime closes,int offset,Instant now) {
        return inWindow(day.atTime(opens).atZone(SEOUL).toInstant(),day.plusDays(offset).atTime(closes).atZone(SEOUL).toInstant(),now);
    }
    static String crowding(int count,Integer normal,Integer crowded) { return normal==null || crowded==null ? "UNCONFIGURED" : count>=crowded ? "CROWDED" : count>=normal ? "NORMAL" : "QUIET"; }
}

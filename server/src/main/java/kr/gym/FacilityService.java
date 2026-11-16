// [목적] 운영시간·혼잡도 기준을 관리하고 실제 입장 구간을 집계합니다. 미설정 상태를 정상 운영으로 추측하지 않습니다.
package kr.gym;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
class FacilityService {
    private final JdbcTemplate db;
    FacilityService(JdbcTemplate db) { this.db=db; }
    AuthService.Reply occupancy() {
        Instant now=Instant.now();
        int count=db.queryForObject("SELECT count(DISTINCT member_id) FROM gym.occupancy_windows WHERE status='VALID' AND starts_at<=? AND ends_at>?",Integer.class,Timestamp.from(now),Timestamp.from(now));
        var settings=db.queryForList("SELECT normal_from,crowded_from FROM gym.gym_settings WHERE id=1");
        Integer normal=settings.isEmpty()?null:(Integer)settings.getFirst().get("normal_from"),crowded=settings.isEmpty()?null:(Integer)settings.getFirst().get("crowded_from");
        return AuthService.Reply.ok(Map.of("people",count,"level",CheckinRules.crowding(count,normal,crowded),"serverTime",now.toString(),"refreshSeconds",60,"staleSeconds",180));
    }
    AuthService.Reply settings() {
        var settings=db.queryForList("SELECT name,normal_from,crowded_from FROM gym.gym_settings WHERE id=1");
        LocalDate today=CheckinRules.today(Instant.now());
        var hours=db.queryForList("SELECT iso_weekday weekday,is_closed closed,opens_at,closes_at,closing_day_offset FROM gym.weekly_opening_hours WHERE effective_from<=?::date AND (effective_until IS NULL OR effective_until>?::date) ORDER BY iso_weekday",today.toString(),today.toString());
        var result=new LinkedHashMap<String,Object>();
        result.put("name",settings.isEmpty()?"":settings.getFirst().get("name"));
        result.put("normalFrom",settings.isEmpty()?null:settings.getFirst().get("normal_from"));
        result.put("crowdedFrom",settings.isEmpty()?null:settings.getFirst().get("crowded_from"));
        result.put("hours",hours.stream().map(row->{
            var value=new LinkedHashMap<String,Object>();value.put("weekday",row.get("weekday"));value.put("closed",row.get("closed"));
            value.put("opensAt",row.get("opens_at")==null?"":row.get("opens_at").toString().substring(0,5));
            value.put("closesAt",row.get("closes_at")==null?"":row.get("closes_at").toString().substring(0,5));
            value.put("overnight",((Number)row.get("closing_day_offset")).intValue()==1);return value;
        }).toList());
        return AuthService.Reply.ok(result);
    }
    record Hours(int weekday,boolean closed,LocalTime opens,LocalTime closes,int offset) {}
    AuthService.Reply saveSettings(AuthService.Actor actor,Map<String,Object> body) {
        if(actor==null || !actor.roles().contains("OPERATOR")) throw new ApiError(403,"ACCESS_DENIED","운영자 권한이 필요합니다.");
        String name=AuthService.text(body,"name",80).strip();
        int normal=positive(body.get("normalFrom")),crowded=positive(body.get("crowdedFrom"));
        if(normal>=crowded) throw ApiError.invalid("혼잡 인원은 보통 인원보다 커야 합니다.");
        if(!(body.get("hours") instanceof List<?> inputs) || inputs.size()!=7) throw ApiError.invalid("월요일부터 일요일까지 운영시간 또는 휴무를 입력해 주세요.");
        var parsed=new ArrayList<Hours>();var weekdays=new HashSet<Integer>();
        for(Object input:inputs) {
            if(!(input instanceof Map<?,?> row)) throw ApiError.invalid("운영시간 형식을 확인해 주세요.");
            int weekday=positive(row.get("weekday"));
            if(weekday>7 || !weekdays.add(weekday) || !(row.get("closed") instanceof Boolean closed)) throw ApiError.invalid("요일별 휴무 여부를 확인해 주세요.");
            LocalTime opens=null,closes=null;int offset=Boolean.TRUE.equals(row.get("overnight"))?1:0;
            if(!closed) {
                try {
                    String from=Objects.toString(row.get("opensAt"),""),until=Objects.toString(row.get("closesAt"),"");
                    if(!from.matches("[0-9]{2}:[0-9]{2}") || !until.matches("[0-9]{2}:[0-9]{2}")) throw new IllegalArgumentException();
                    opens=LocalTime.parse(from);closes=LocalTime.parse(until);
                    long minutes=Duration.between(opens,closes).toMinutes()+offset*1440L;
                    if(minutes<=0 || minutes>1440) throw new IllegalArgumentException();
                } catch(RuntimeException e) { throw ApiError.invalid("영업시간은 HH:MM 형식으로 입력하고, 익일 종료 여부를 확인해 주세요."); }
            } else offset=0;
            parsed.add(new Hours(weekday,closed,opens,closes,offset));
        }
        LocalDate today=CheckinRules.today(Instant.now());
        db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('facility-settings',0))");
        if(!db.queryForList("SELECT id FROM gym.weekly_opening_hours WHERE effective_from>?::date",today.toString()).isEmpty()) throw new ApiError(409,"FUTURE_HOURS_EXIST","예약된 운영시간 변경이 있어 저장할 수 없습니다.");
        db.update("INSERT INTO gym.gym_settings(id,name,normal_from,crowded_from,updated_by) VALUES(1,?,?,?,?::bigint) ON CONFLICT(id) DO UPDATE SET name=excluded.name,normal_from=excluded.normal_from,crowded_from=excluded.crowded_from,updated_by=excluded.updated_by,updated_at=now()",name,normal,crowded,actor.id());
        for(Hours hours:parsed) {
            var existing=db.queryForList("SELECT id,effective_from FROM gym.weekly_opening_hours WHERE iso_weekday=? AND effective_from<=?::date AND (effective_until IS NULL OR effective_until>?::date) FOR UPDATE",hours.weekday(),today.toString(),today.toString());
            if(!existing.isEmpty() && existing.getFirst().get("effective_from").toString().equals(today.toString())) {
                db.update("UPDATE gym.weekly_opening_hours SET is_closed=?,opens_at=?::time,closes_at=?::time,closing_day_offset=?,changed_by=?::bigint WHERE id=?",hours.closed(),time(hours.opens()),time(hours.closes()),hours.offset(),actor.id(),existing.getFirst().get("id"));
            } else {
                if(!existing.isEmpty()) db.update("UPDATE gym.weekly_opening_hours SET effective_until=?::date WHERE id=?",today.toString(),existing.getFirst().get("id"));
                db.update("INSERT INTO gym.weekly_opening_hours(iso_weekday,effective_from,is_closed,opens_at,closes_at,closing_day_offset,changed_by) VALUES(?,?::date,?,?::time,?::time,?,?::bigint)",hours.weekday(),today.toString(),hours.closed(),time(hours.opens()),time(hours.closes()),hours.offset(),actor.id());
            }
        }
        db.update("INSERT INTO gym.audit_events(actor_account_id,actor_type,target_type,target_id,action,reason_code,purge_after) VALUES(?::bigint,'ACCOUNT','GYM_SETTINGS','1','UPDATE','OPERATING_SETTINGS',now()+interval '1 year')",actor.id());
        return settings();
    }
    private static String time(LocalTime value) { return value==null?null:value.toString(); }
    private static int positive(Object value) {
        if(!(value instanceof Number n) || n.doubleValue()!=n.intValue() || n.intValue()<=0) throw ApiError.invalid("인원과 요일은 양의 정수로 입력해 주세요.");
        return n.intValue();
    }
    // [기능] 날짜별 휴무를 우선 적용하고 전날 시작해 자정을 넘긴 운영시간도 확인합니다.
    void requireOpen(Instant now) {
        LocalDate today=CheckinRules.today(now);
        var override=db.queryForList("SELECT kind FROM gym.calendar_overrides WHERE business_date=?::date",today.toString());
        if(!override.isEmpty() && "CLOSED".equals(override.getFirst().get("kind"))) throw new ApiError(409,"GYM_CLOSED","오늘은 시설 휴무일입니다.");
        for(int offset=0;offset<2;offset++) {
            LocalDate day=today.minusDays(offset);
            var special=offset==0?override:db.queryForList("SELECT kind FROM gym.calendar_overrides WHERE business_date=?::date",day.toString());
            if(!special.isEmpty()) {
                if("CUSTOM_OPEN".equals(special.getFirst().get("kind")) && !db.queryForList("SELECT id FROM gym.calendar_open_intervals WHERE business_date=?::date AND starts_at<=? AND ends_at>?",day.toString(),Timestamp.from(now),Timestamp.from(now)).isEmpty()) return;
                continue;
            }
            var hours=db.queryForList("SELECT is_closed,opens_at,closes_at,closing_day_offset FROM gym.weekly_opening_hours WHERE iso_weekday=? AND effective_from<=?::date AND (effective_until IS NULL OR effective_until>?::date)",day.getDayOfWeek().getValue(),day.toString(),day.toString());
            if(hours.isEmpty()) {
                if(offset==0) throw new ApiError(409,"HOURS_REQUIRED","운영시간이 설정되지 않았습니다. 운영자에게 문의해 주세요.");
                continue;
            }
            var row=hours.getFirst();
            if(!Boolean.TRUE.equals(row.get("is_closed")) && CheckinRules.open(day,LocalTime.parse(row.get("opens_at").toString()),LocalTime.parse(row.get("closes_at").toString()),((Number)row.get("closing_day_offset")).intValue(),now)) return;
        }
        throw new ApiError(409,"OUTSIDE_OPENING_HOURS","시설 운영시간이 아닙니다.");
    }
}

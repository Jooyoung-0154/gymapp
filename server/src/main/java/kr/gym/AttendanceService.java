// [목적] AttendanceService는 로그인 계정의 월별 출석을 DB에서 읽습니다. 출석 생성·보상 판정은 수행하지 않습니다.
package kr.gym;

import java.sql.Date;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AttendanceService {
    private final JdbcTemplate db;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    AttendanceService(JdbcTemplate db) { this(db, Clock.system(ZoneId.of("Asia/Seoul"))); }
    AttendanceService(JdbcTemplate db, Clock clock) { this.db=db; this.clock=clock; }

    // [기능] monthly는 클라이언트의 회원 ID 대신 인증 계정으로 회원을 찾아 타인의 기록 조회를 막습니다.
    @Transactional(readOnly=true)
    public Map<String,Object> monthly(AuthService.Actor actor, String month) {
        LocalDate today=LocalDate.now(clock);
        YearMonth selected=parseMonth(month,today);
        var members=db.queryForList("SELECT id FROM gym.members WHERE account_id=?::bigint AND status='ACTIVE'",actor.id());
        if(members.isEmpty()) throw new ApiError(404,"MEMBER_NOT_FOUND","이용 가능한 회원 정보를 찾지 못했어요.");
        String memberId=members.getFirst().get("id").toString();
        // [목적] 일별 뷰는 VALID 방문만 집계하며 같은 날 여러 방문은 출석 하루로 합칩니다.
        var dates=db.queryForList("""
            SELECT attendance_date FROM gym.member_attendance_days
            WHERE member_id=?::bigint AND attendance_date>=? AND attendance_date<?
              AND attendance_date<=? ORDER BY attendance_date
            """,Date.class,memberId,Date.valueOf(selected.atDay(1)),Date.valueOf(selected.plusMonths(1).atDay(1)),Date.valueOf(today));
        Date first=db.queryForObject("SELECT min(attendance_date) FROM gym.member_attendance_days WHERE member_id=?::bigint AND attendance_date<=?",Date.class,memberId,Date.valueOf(today));
        return Map.of("memberId",memberId,"month",selected.toString(),
            "attendanceDates",dates.stream().map(d->d.toLocalDate().toString()).toList(),
            "attendanceCount",dates.size(),"today",today.toString(),
            "earliestMonth",first==null?YearMonth.from(today).toString():YearMonth.from(first.toLocalDate()).toString());
    }

    // [정의] 월 입력 범위는 앱 달력과 동일한 1900~2100년이며 미래 월과 잘못된 형식은 거절합니다.
    static YearMonth parseMonth(String value,LocalDate today) {
        if(value==null || !value.matches("[0-9]{4}-[0-9]{2}")) throw ApiError.invalid("조회 월은 YYYY-MM 형식으로 입력해 주세요.");
        try {
            YearMonth month=YearMonth.parse(value);
            if(month.getYear()<1900 || month.getYear()>2100 || month.isAfter(YearMonth.from(today))) throw new IllegalArgumentException();
            return month;
        } catch(RuntimeException e) { throw ApiError.invalid("조회할 수 없는 월입니다."); }
    }
}


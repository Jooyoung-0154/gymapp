-- [목적] 앱 업무 계정이 일별 출석 뷰를 읽도록 허용합니다. 기본 테이블 쓰기 권한은 추가하지 않습니다.
GRANT SELECT ON gym.member_attendance_days TO gym_app;

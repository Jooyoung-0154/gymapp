-- 운영자 비밀번호 로그인: MFA 인증 시각을 요구하던 세션 제약만 제거합니다.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid='gym.account_sessions'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%mfa_verified_at%'
  LOOP
    EXECUTE format('ALTER TABLE gym.account_sessions DROP CONSTRAINT %I', item.conname);
  END LOOP;
END $$;

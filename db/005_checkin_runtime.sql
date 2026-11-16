-- [목적] QR·입장·혼잡도 조회에 필요한 인덱스를 준비합니다. 기존 회원·방문 데이터는 변경하지 않습니다.
BEGIN;
CREATE INDEX IF NOT EXISTS qr_session_expiry ON gym.member_qr_credentials(session_id,expires_at);
CREATE INDEX IF NOT EXISTS checkin_device_owner ON gym.checkin_devices(registered_by) WHERE status='ACTIVE';
COMMIT;

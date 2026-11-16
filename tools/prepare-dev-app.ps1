# [목적] prepare-dev-app.ps1 파일: 개발용 DB 연결·보안 키 등 로컬 설정 파일을 준비합니다. 생성한 설정과 비밀값은 공개 배포용 파일이 아닙니다.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'start-dev-db.ps1')
$localApp = Join-Path $projectRoot '.validation\app'
New-Item -ItemType Directory -Path $localApp -Force | Out-Null
$secretPath = Join-Path $localApp 'secrets.json'
# [처리 흐름] secrets.json 최초 생성 조건문: 로컬 설정이 없는 최초 실행에서만 비밀번호와 암호화·조회 키를 생성합니다.
if (!(Test-Path -LiteralPath $secretPath)) {
    $secret = [ordered]@{
        password = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
        encryptionKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
        lookupKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    }
    $secret | ConvertTo-Json | Set-Content -LiteralPath $secretPath -Encoding utf8
}
$secret = Get-Content -LiteralPath $secretPath -Raw | ConvertFrom-Json
$connection = Get-Content -LiteralPath (Join-Path $projectRoot '.validation\dev-postgres\connection.json') -Raw | ConvertFrom-Json
$oldPassword = $env:PGPASSWORD
$env:PGPASSWORD = $connection.password
$pg = 'C:\Program Files\PostgreSQL\15\bin\psql.exe'
$pgArgs = @('-h','127.0.0.1','-p','55432','-U','gym_dev_owner','-d','gym_dev','-X','-w','-v','ON_ERROR_STOP=1')
try {
    & $pg @pgArgs -f (Join-Path $projectRoot 'db\003_auth_runtime.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Authentication migration failed' }
    & $pg @pgArgs -f (Join-Path $projectRoot 'db\004_operator_password_login.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Operator login migration failed' }
    & $pg @pgArgs -f (Join-Path $projectRoot 'db\005_checkin_runtime.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Check-in migration failed' }
    # Values below are machine-generated hex strings. No user SQL is interpolated.
    # [처리 흐름] $roleSql의 앱 전용 DB 역할·권한 설정: 앱 전용 DB 역할을 준비하고 인증 처리에 필요한 테이블·시퀀스 권한을 부여합니다.
    $roleSql = "DO `$`$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='gym_app') THEN CREATE ROLE gym_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; END IF; END `$`$; ALTER ROLE gym_app PASSWORD '$($secret.password)'; GRANT CONNECT ON DATABASE gym_dev TO gym_app; GRANT USAGE ON SCHEMA gym TO gym_app; GRANT SELECT,INSERT,UPDATE ON gym.accounts,gym.account_roles,gym.members,gym.auth_codes,gym.mfa_enrollments,gym.account_sessions,gym.login_attempts,gym.auth_challenges,gym.auth_operations TO gym_app; GRANT SELECT,INSERT ON gym.audit_events TO gym_app; GRANT USAGE,SELECT ON SEQUENCE gym.accounts_id_seq,gym.members_id_seq,gym.auth_codes_id_seq,gym.mfa_enrollments_id_seq,gym.account_sessions_id_seq,gym.login_attempts_id_seq,gym.audit_events_id_seq TO gym_app;"
    $roleSql += ' GRANT SELECT,INSERT ON gym.auth_action_reasons TO gym_app; GRANT SELECT ON gym.member_attendance_days TO gym_app; GRANT SELECT,INSERT ON gym.memberships,gym.policy_versions TO gym_app; GRANT USAGE,SELECT ON SEQUENCE gym.memberships_id_seq,gym.policy_versions_id_seq TO gym_app;'
    $roleSql += ' GRANT SELECT,INSERT,UPDATE ON gym.member_qr_credentials,gym.checkin_devices,gym.gym_settings,gym.weekly_opening_hours TO gym_app; GRANT SELECT,INSERT ON gym.visits,gym.occupancy_windows,gym.checkin_requests TO gym_app; GRANT SELECT ON gym.pause_requests,gym.pt_bookings,gym.pt_passes,gym.calendar_overrides,gym.calendar_open_intervals TO gym_app; GRANT USAGE,SELECT ON SEQUENCE gym.member_qr_credentials_id_seq,gym.checkin_devices_id_seq,gym.visits_id_seq,gym.occupancy_windows_id_seq,gym.checkin_requests_id_seq,gym.weekly_opening_hours_id_seq TO gym_app;'
    $roleSql | & $pg @pgArgs -q
    if ($LASTEXITCODE -ne 0) { throw 'Development app role preparation failed' }
} finally { $env:PGPASSWORD = $oldPassword }
$guidePath = (Join-Path $localApp 'bootstrap.json').Replace('\','/')
# [목적] Java properties가 한글 경로를 잘못 해석하지 않도록 비ASCII 문자를 Unicode escape로 저장합니다.
$guidePath = -join ($guidePath.ToCharArray() | ForEach-Object { if ([int]$_ -gt 127) { '\u{0:x4}' -f [int]$_ } else { [string]$_ } })
@"
spring.datasource.url=jdbc:postgresql://127.0.0.1:55432/gym_dev
spring.datasource.username=gym_app
spring.datasource.password=$($secret.password)
gym.encryption-key=$($secret.encryptionKey)
gym.lookup-key=$($secret.lookupKey)
gym.local=true
gym.bootstrap=true
gym.cookie-secure=false
gym.bootstrap-file=$guidePath
"@ | Set-Content -LiteralPath (Join-Path $localApp 'application-local.properties') -Encoding utf8
Write-Output 'Development application role and local configuration ready. Secrets were not printed.'



$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'start-dev-db.ps1')
$localApp = Join-Path $projectRoot '.validation\app'
New-Item -ItemType Directory -Path $localApp -Force | Out-Null
$secretPath = Join-Path $localApp 'secrets.json'
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
    # Values below are machine-generated hex strings. No user SQL is interpolated.
    $roleSql = "DO `$`$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='gym_app') THEN CREATE ROLE gym_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; END IF; END `$`$; ALTER ROLE gym_app PASSWORD '$($secret.password)'; GRANT CONNECT ON DATABASE gym_dev TO gym_app; GRANT USAGE ON SCHEMA gym TO gym_app; GRANT SELECT,INSERT,UPDATE ON gym.accounts,gym.account_roles,gym.members,gym.auth_codes,gym.mfa_enrollments,gym.account_sessions,gym.login_attempts,gym.auth_challenges,gym.auth_operations TO gym_app; GRANT SELECT,INSERT ON gym.audit_events TO gym_app; GRANT USAGE,SELECT ON SEQUENCE gym.accounts_id_seq,gym.members_id_seq,gym.auth_codes_id_seq,gym.mfa_enrollments_id_seq,gym.account_sessions_id_seq,gym.login_attempts_id_seq,gym.audit_events_id_seq TO gym_app;"
    $roleSql += ' GRANT SELECT,INSERT ON gym.auth_action_reasons TO gym_app;'
    $roleSql | & $pg @pgArgs -q
    if ($LASTEXITCODE -ne 0) { throw 'Development app role preparation failed' }
} finally { $env:PGPASSWORD = $oldPassword }
$guidePath = (Join-Path $localApp 'bootstrap.json').Replace('\','/')
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

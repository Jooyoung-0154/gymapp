# [목적] start-dev-db.ps1 파일: 개발용 PostgreSQL 실행 환경을 준비하고 DB 초기화·기동에 필요한 명령을 수행합니다.
param([switch]$Validate)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pgBin = 'C:\Program Files\PostgreSQL\15\bin'
$localRoot = Join-Path $projectRoot '.validation\dev-postgres'
$dataPath = Join-Path $localRoot 'data'
$configPath = Join-Path $localRoot 'connection.json'
$passwordPath = Join-Path $localRoot 'init-password.txt'
$port = 55432

# [기능] Run 함수: PostgreSQL 도구를 호출하고 실패한 종료 코드는 예외로 처리합니다.
function Run-Pg([string]$Tool, [string[]]$Arguments) {
    & (Join-Path $pgBin $Tool) @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Tool failed (exit $LASTEXITCODE)" }
}

if (!(Test-Path -LiteralPath (Join-Path $pgBin 'initdb.exe'))) {
    throw 'PostgreSQL 15 command line tools not found.'
}
New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
if (!(Test-Path -LiteralPath $configPath)) {
    if (Test-Path -LiteralPath $dataPath) { throw 'Existing data without credentials; refusing to overwrite.' }
    $configuration = [ordered]@{
        host = '127.0.0.1'; port = $port; user = 'gym_dev_owner'; database = 'gym_dev'
        password = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    }
    $configuration | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
}
$configuration = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($configuration.host -ne '127.0.0.1' -or $configuration.port -ne $port -or
    $configuration.database -ne 'gym_dev' -or $configuration.user -ne 'gym_dev_owner') {
    throw 'Unexpected development configuration; refusing to continue.'
}

# [처리 흐름] PG_VERSION 존재 여부에 따른 DB 초기화 분기: 아직 초기화하지 않은 전용 데이터 폴더만 초기화합니다. 임시 비밀번호 파일은 finally에서 제거합니다.
if (!(Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
    $configuration.password | Set-Content -LiteralPath $passwordPath -Encoding ascii
    try {
        Run-Pg 'initdb.exe' @('-D', $dataPath, '-U', $configuration.user, '--pwfile', $passwordPath,
            '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C')
    } finally {
        if (Test-Path -LiteralPath $passwordPath) { Remove-Item -LiteralPath $passwordPath }
    }
}
# [목적] pg_ctl의 상태 판정만으로 재기동하지 않습니다. 준비 완료는 재사용하고 복구 중이면 기다립니다.
. (Join-Path $PSScriptRoot 'dev-db-lifecycle.ps1')
Ensure-DevPostgresReady -PidExists (Test-Path -LiteralPath (Join-Path $dataPath 'postmaster.pid')) -Probe {
    & (Join-Path $pgBin 'pg_isready.exe') -h '127.0.0.1' -p "$port" -t 2 -q
    return $LASTEXITCODE
} -Status {
    & (Join-Path $pgBin 'pg_ctl.exe') -D $dataPath status | Out-Host
    return $LASTEXITCODE
} -PidIsStale {
    Test-DevPostgresPidStale -PidFile (Join-Path $dataPath 'postmaster.pid')
} -Start {
    # [목적] 이전 프로세스가 열어 둔 로그와 충돌하지 않도록 기동마다 별도 로그를 사용합니다.
    $startupLog = Join-Path $localRoot ('server-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.log')
    Write-Output "PostgreSQL startup log: $startupLog"
    Run-Pg 'pg_ctl.exe' @('-D', $dataPath, '-l', $startupLog,
        '-o', '-h 127.0.0.1 -p 55432', '-w', 'start')
}
$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $configuration.password
$baseArgs = @('-h', '127.0.0.1', '-p', "$port", '-U', $configuration.user, '-w')
try {
    $exists = & (Join-Path $pgBin 'psql.exe') @baseArgs -X -At -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='gym_dev'"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to project development server.' }
    if ("$exists".Trim() -ne '1') { Run-Pg 'createdb.exe' ($baseArgs + @('gym_dev')) }
    $sqlArgs = $baseArgs + @('-X', '-d', 'gym_dev', '-v', 'ON_ERROR_STOP=1')
    Run-Pg 'psql.exe' ($sqlArgs + @('-c', 'SELECT version(), current_database(), current_user;'))
    # [처리 흐름] $Validate에 따른 스키마 검증 분기: 검증 옵션은 gym 스키마가 없는 경우에만 초기 스키마와 테스트 SQL을 적용합니다.
    if ($Validate) {
        $schemaCount = & (Join-Path $pgBin 'psql.exe') @sqlArgs -At -c "SELECT count(*) FROM pg_namespace WHERE nspname IN ('gym','gym_private')"
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing schemas.' }
        if ("$schemaCount".Trim() -ne '0') { throw 'Existing gym schemas: refusing reapplication. No data was removed.' }
        Run-Pg 'psql.exe' ($sqlArgs + @('-f', (Join-Path $projectRoot 'db\001_schema.sql')))
        Run-Pg 'psql.exe' ($sqlArgs + @('-f', (Join-Path $projectRoot 'db\002_smoke_test.sql')))
        Write-Output 'DEVELOPMENT DB: schema and smoke SQL passed.'
    }
    Write-Output 'Development PostgreSQL: 127.0.0.1:55432 / gym_dev (project-local credentials; not printed).'
} finally {
    $env:PGPASSWORD = $previousPassword
}

param([switch]$Validate)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pgBin = 'C:\Program Files\PostgreSQL\15\bin'
$localRoot = Join-Path $projectRoot '.validation\dev-postgres'
$dataPath = Join-Path $localRoot 'data'
$configPath = Join-Path $localRoot 'connection.json'
$passwordPath = Join-Path $localRoot 'init-password.txt'
$port = 55432

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

if (!(Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
    $configuration.password | Set-Content -LiteralPath $passwordPath -Encoding ascii
    try {
        Run-Pg 'initdb.exe' @('-D', $dataPath, '-U', $configuration.user, '--pwfile', $passwordPath,
            '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C')
    } finally {
        if (Test-Path -LiteralPath $passwordPath) { Remove-Item -LiteralPath $passwordPath }
    }
}
& (Join-Path $pgBin 'pg_ctl.exe') -D $dataPath status *> $null
if ($LASTEXITCODE -ne 0) {
    Run-Pg 'pg_ctl.exe' @('-D', $dataPath, '-l', (Join-Path $localRoot 'server.log'),
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

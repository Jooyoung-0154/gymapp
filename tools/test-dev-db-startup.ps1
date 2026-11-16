# [목적] 실제 PostgreSQL을 건드리지 않고 준비·복구·정지 상태별 중복 기동 방지를 검증합니다.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-db-lifecycle.ps1')

function Assert-Startup([string]$Name, [int[]]$ProbeCodes, [int]$ProcessCode, [bool]$PidExists, [int]$ExpectedStarts, [bool]$ExpectedFailure = $false, [bool]$StaleResult = $false) {
    $state = @{ index = 0; starts = 0; statuses = 0 }
    $probe = { $index = [Math]::Min($state.index, $ProbeCodes.Length - 1); $state.index++; return $ProbeCodes[$index] }
    $statusProbe = { $state.statuses++; return $ProcessCode }
    $start = { $state.starts++ }
    $failed = $false
    try {
        Ensure-DevPostgresReady -Probe $probe -Status $statusProbe -Start $start -PidExists $PidExists -PidIsStale { return $StaleResult } -Delay {} -Attempts 3
    } catch { $failed = $true }
    if ($failed -ne $ExpectedFailure) { throw "$Name : unexpected success/failure" }
    if ($state.starts -ne $ExpectedStarts) { throw "$Name : expected $ExpectedStarts starts, got $($state.starts)" }
    if ($ProbeCodes[0] -in 0,1 -and $state.statuses -ne 0) { throw "$Name : ready/recovering server must not need pg_ctl status" }
    Write-Output "PASS: $Name"
}

Assert-Startup 'Ready server is reused despite misleading pg_ctl status' @(0) 3 $true 0
Assert-Startup 'Recovering server becomes ready without restart' @(1,1,0) 3 $true 0
Assert-Startup 'Running process with unavailable connection is not started twice' @(2,0) 0 $true 0
Assert-Startup 'Stopped server starts once' @(2,2,0) 3 $false 1
Assert-Startup 'Unknown process status does not trigger start' @(2) 4 $false 0 $true
Assert-Startup 'Existing PID with inconclusive status does not trigger start' @(2) 3 $true 0 $true
Assert-Startup 'Recovery timeout does not trigger start' @(1) 3 $true 0 $true
Assert-Startup 'Invalid readiness probe does not trigger start' @(3) 3 $false 0 $true
Assert-Startup 'Confirmed exited process with leftover PID starts once' @(2,0) 3 $true 1 $false $true

# [목적] 실제 프로세스 조회와 PID 파일 해석을 검증합니다. 프로젝트의 DB 파일은 사용하지 않습니다.
$fixtureFile = Join-Path ([IO.Path]::GetTempPath()) ('gym-pid-test-' + [guid]::NewGuid().ToString('N') + '.txt')
try {
    if (!(Test-DevPostgresPidStale -PidFile $fixtureFile)) { throw 'Missing PID file must allow native startup' }
    Write-Output 'PASS: Missing PID file is handled'
    [IO.File]::WriteAllText($fixtureFile, [string]$PID)
    if (Test-DevPostgresPidStale -PidFile $fixtureFile) { throw 'Current process must not be considered exited' }
    Write-Output 'PASS: Existing process is not considered stale'
    [IO.File]::WriteAllText($fixtureFile, [string][int]::MaxValue)
    if (!(Test-DevPostgresPidStale -PidFile $fixtureFile)) { throw 'Nonexistent process must be considered exited' }
    Write-Output 'PASS: Nonexistent process is considered stale'
    [IO.File]::WriteAllText($fixtureFile, 'invalid-pid')
    $invalidRejected = $false
    try { Test-DevPostgresPidStale -PidFile $fixtureFile | Out-Null } catch { $invalidRejected = $true }
    if (!$invalidRejected) { throw 'Invalid PID must not allow startup' }
    Write-Output 'PASS: Invalid PID is rejected'
} finally {
    if (Test-Path -LiteralPath $fixtureFile) { Remove-Item -LiteralPath $fixtureFile }
}

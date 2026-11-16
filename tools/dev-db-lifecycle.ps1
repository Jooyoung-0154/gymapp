# [목적] PostgreSQL의 접속 준비 상태를 먼저 확인해 이미 가동·복구 중인 서버의 중복 기동을 방지합니다.
function Test-DevPostgresPidStale {
    param([Parameter(Mandatory)][string]$PidFile)
    if (!(Test-Path -LiteralPath $PidFile)) { return $true }
    $lines = @(Get-Content -LiteralPath $PidFile -TotalCount 1 -ErrorAction Stop)
    $serverProcessId = 0
    if ($lines.Count -ne 1 -or ![int]::TryParse($lines[0], [ref]$serverProcessId) -or $serverProcessId -le 1) {
        throw 'postmaster.pid의 프로세스 번호를 읽을 수 없습니다. DB 파일은 변경하지 않았습니다.'
    }
    try {
        $serverProcess = [Diagnostics.Process]::GetProcessById($serverProcessId)
        try { return $serverProcess.HasExited } finally { $serverProcess.Dispose() }
    } catch {
        # [목적] 해당 PID가 존재하지 않는 경우만 종료로 판단합니다. 접근 거부 등은 종료로 간주하지 않습니다.
        if ($_.Exception.GetBaseException() -is [ArgumentException]) { return $true }
        throw "기존 DB 프로세스 $serverProcessId 상태를 확인하지 못했습니다. DB 파일은 변경하지 않았습니다."
    }
}

function Ensure-DevPostgresReady {
    param(
        [Parameter(Mandatory)][scriptblock]$Probe,
        [Parameter(Mandatory)][scriptblock]$Status,
        [Parameter(Mandatory)][scriptblock]$Start,
        [bool]$PidExists,
        [scriptblock]$PidIsStale = { return $false },
        [scriptblock]$Delay = { Start-Sleep -Milliseconds 500 },
        [int]$Attempts = 30
    )
    # [정의] pg_isready 종료 코드: 0 준비 완료, 1 복구 등으로 접속 거부 중, 2 응답 없음, 3 실행 인자 오류.
    $readiness = & $Probe
    if ($readiness -eq 0) { return }
    if ($readiness -eq 2) {
        $processStatus = & $Status
        if ($processStatus -eq 3 -and (!$PidExists -or (& $PidIsStale))) {
            # [목적] PID 파일이 없거나 기록된 프로세스의 종료가 확인되면 PostgreSQL 자체 시작 절차에 맡깁니다.
            # 남은 PID 파일을 직접 삭제하지 않습니다. PostgreSQL이 잠금·복구 상태를 최종 확인합니다.
            & $Start
        } elseif ($processStatus -eq 3) {
            throw 'DB 상태를 확인할 수 없습니다. 기존 postmaster.pid가 있어 중복 시작을 중단했습니다. PID·로그 파일을 삭제하지 말고 서버 상태를 확인해 주세요.'
        } elseif ($processStatus -ne 0) {
            throw "PostgreSQL 상태 확인에 실패했습니다 (pg_ctl exit $processStatus). 중복 시작을 중단했습니다."
        }
    } elseif ($readiness -ne 1) {
        throw "PostgreSQL 접속 준비 상태를 확인하지 못했습니다 (pg_isready exit $readiness)."
    }
    # [목적] 이미 실행·복구 중이거나 방금 시작한 서버가 준비될 때까지 기다립니다. 기다리는 중에는 다시 시작하지 않습니다.
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        & $Delay
        $readiness = & $Probe
        if ($readiness -eq 0) { return }
        if ($readiness -notin 1,2) { throw "PostgreSQL 접속 준비 상태 확인에 실패했습니다 (exit $readiness)." }
    }
    throw 'PostgreSQL이 아직 접속 준비 중입니다. 중복 시작하지 않았습니다. 잠시 후 다시 실행하거나 기존 DB 로그를 확인해 주세요.'
}

# [목적] start-app.ps1 파일: 로컬 DB를 준비하고 필요한 설정을 만든 뒤 서버 실행 스크립트를 호출합니다.
param([switch]$Verify)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
# [목적] prepare-dev-app.ps1 안에서 DB를 준비하므로 중복 호출하지 않습니다.
& (Join-Path $PSScriptRoot 'prepare-dev-app.ps1')
if ($Verify) {
    Write-Output 'Verifying registration, approval and facility membership against the local database (creates TEST accounts)...'
    & (Join-Path $PSScriptRoot 'run-server.ps1') -Test
    if ($LASTEXITCODE -ne 0) { throw 'Verification failed. See server/target/surefire-reports. Application was not started.' }
    Write-Output 'Database verification passed.'
}
Write-Output 'Gym application: http://127.0.0.1:8080'
Write-Output 'After startup, open the local operator guide in .validation/app.'
Write-Output 'Keep this window open. Press Ctrl+C to stop the web application.'
# [목적] 시작 전에 최신 Java·웹 리소스를 빌드해 이전 JAR로 실행되는 일을 막습니다.
# 실행 중인 서버는 사용자가 Ctrl+C로 종료한 뒤 이 시작 파일을 다시 실행합니다.
Write-Output 'Building the current server and web screens...'
& (Join-Path $PSScriptRoot 'run-server.ps1') -Build
if($LASTEXITCODE -ne 0){throw 'Build failed. Close the previous server window and try again.'}
& (Join-Path $PSScriptRoot 'run-server.ps1')
# [목적] 서버 실행 실패를 CMD에도 전달해 실패가 종료 코드 0으로 표시되지 않게 합니다.
exit $LASTEXITCODE


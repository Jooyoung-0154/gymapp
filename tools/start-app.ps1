$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
& (Join-Path $PSScriptRoot 'start-dev-db.ps1')
if(!(Test-Path -LiteralPath (Join-Path $projectRoot '.validation\app\application-local.properties'))){
    & (Join-Path $PSScriptRoot 'prepare-dev-app.ps1')
}
Write-Output 'Gym application: http://127.0.0.1:8080'
Write-Output 'After startup, open the local operator guide in .validation/app.'
Write-Output 'Keep this window open. Press Ctrl+C to stop the web application.'
& (Join-Path $PSScriptRoot 'run-server.ps1')

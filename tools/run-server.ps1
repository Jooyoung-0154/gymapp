# [목적] run-server.ps1 파일: 프로젝트 전용 Maven과 로컬 설정으로 서버를 실행합니다. -Test는 테스트, -Build는 테스트를 생략한 패키징을 선택합니다.
param([switch]$Test,[switch]$Build)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$maven=Join-Path $projectRoot '.validation\tooling\apache-maven-3.9.16\bin\mvn.cmd'
$config=(Join-Path $projectRoot '.validation\app\application-local.properties').Replace('\','/')
if(!(Test-Path -LiteralPath $config)){throw 'Run tools/prepare-dev-app.ps1 first.'}
if (!$env:GYM_CORS_ALLOWED_ORIGINS) {
    $env:GYM_CORS_ALLOWED_ORIGINS='http://localhost:8081,http://127.0.0.1:8081'
}
$repo=(Join-Path $projectRoot '.validation\m2')
$pom=Join-Path $projectRoot 'server\pom.xml'
# [처리 흐름] $Test·$Build에 따른 실행 모드 분기: 테스트·패키징·서버 실행 중 요청한 모드를 선택합니다. 이 스크립트 자체가 포트를 변경하지는 않습니다.
if($Test){
    & $maven -f $pom "-Dmaven.repo.local=$repo" "-Dspring.config.additional-location=file:$config" test
} elseif($Build){
    # 공통 React 프런트엔드를 서버 JAR에 함께 포함합니다.
    & npm.cmd --prefix (Join-Path $projectRoot 'mobile') run export:web
    if($LASTEXITCODE -ne 0){throw 'Frontend export failed'}
    $staticOutput = [IO.Path]::GetFullPath((Join-Path $projectRoot 'server\target\classes\static'))
    $targetRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'server\target')) + [IO.Path]::DirectorySeparatorChar
    if (!$staticOutput.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected static output path' }
    if (Test-Path -LiteralPath $staticOutput) { Remove-Item -LiteralPath $staticOutput -Recurse -Force }
    & $maven -f $pom "-Dmaven.repo.local=$repo" '-DskipTests' package
} else {
    $jar=Join-Path $projectRoot 'server\target\gym-server-0.1.0-exec.jar'
    if(!(Test-Path -LiteralPath $jar)){throw 'Build first: tools/run-server.ps1 -Build'}
    & java -jar $jar "--spring.config.additional-location=file:$config"
}
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}


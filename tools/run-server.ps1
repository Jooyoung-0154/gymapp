param([switch]$Test,[switch]$Build)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$maven=Join-Path $projectRoot '.validation\tooling\apache-maven-3.9.16\bin\mvn.cmd'
$config=(Join-Path $projectRoot '.validation\app\application-local.properties').Replace('\','/')
if(!(Test-Path -LiteralPath $config)){throw 'Run tools/prepare-dev-app.ps1 first.'}
$repo=(Join-Path $projectRoot '.validation\m2')
$pom=Join-Path $projectRoot 'server\pom.xml'
if($Test){
    & $maven -f $pom "-Dmaven.repo.local=$repo" "-Dspring.config.additional-location=file:$config" test
} elseif($Build){
    & $maven -f $pom "-Dmaven.repo.local=$repo" '-DskipTests' package
} else {
    $jar=Join-Path $projectRoot 'server\target\gym-server-0.1.0.jar'
    if(!(Test-Path -LiteralPath $jar)){throw 'Build first: tools/run-server.ps1 -Build'}
    & java -jar $jar "--spring.config.additional-location=file:$config"
}
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}

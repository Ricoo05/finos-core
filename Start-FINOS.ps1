#Requires -Version 7.2
param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'scripts/Common.ps1')
$settings=Get-FinosSettings
if(-not $settings.node){throw 'Run ./Setup-FINOS.ps1 to finish runtime setup.'}
$jar=Join-Path $FinosRoot 'backend/target/ledger-0.1.0.jar'
if(-not(Test-Path -LiteralPath $jar)){throw 'Build the backend with ./Setup-FINOS.ps1 first.'}
Start-FinosPostgres $settings
Start-FinosKafka $settings
Invoke-FinosEnvironment (Get-FinosEnvironment $settings) {
  Start-FinosProcess 'backend' 8080 (Join-Path $settings.java 'bin/java.exe') @('-jar',('"'+$jar+'"')) $jar
}
Wait-FinosHttp 'http://127.0.0.1:8080/actuator/health'
$vite=Join-Path $FinosRoot 'node_modules/vite/bin/vite.js'
Start-FinosProcess 'frontend' 5173 $settings.node @(('"'+$vite+'"'),'--host','127.0.0.1','--port','5173','--strictPort') $vite
Wait-FinosHttp 'http://127.0.0.1:5173/api/state'
Write-Output 'Ready: http://127.0.0.1:5173/ | API http://127.0.0.1:8080/api/state'
if(-not $NoBrowser){Start-Process 'http://127.0.0.1:5173/'}

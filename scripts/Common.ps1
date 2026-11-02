$ErrorActionPreference='Stop'
$script:FinosRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:FinosLocal=Join-Path $FinosRoot '.local'

function Get-FinosSettings {
  $file=Join-Path $FinosLocal 'runtime.json'
  if(-not(Test-Path -LiteralPath $file)){throw 'Run ./Setup-FINOS.ps1 first.'}
  Get-Content -LiteralPath $file -Raw | ConvertFrom-Json -AsHashtable
}
function Invoke-FinosEnvironment([hashtable]$Values,[scriptblock]$Action) {
  $previous=@{}
  foreach($name in $Values.Keys){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$Values[$name],'Process')}
  try { & $Action } finally {foreach($name in $previous.Keys){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}}
}
function Get-FinosEnvironment($Settings,[string]$Database='finos') {
  @{
    JAVA_HOME=$Settings.java; PATH=((Split-Path $Settings.node)+';'+$env:PATH)
    DB_URL="jdbc:postgresql://127.0.0.1:55432/$Database"; DB_USER='finos_app'; DB_PASSWORD=$Settings.appPassword
    MIGRATION_USER='finos_owner'; MIGRATION_PASSWORD=$Settings.ownerPassword
    EVENT_MODE='kafka'; KAFKA_BOOTSTRAP_SERVERS='127.0.0.1:19092'; REDIS_ENABLED='false'
  }
}
function Invoke-FinosNpm($Settings,[string[]]$Arguments) {
  & $Settings.node (Join-Path (Split-Path $Settings.node) 'node_modules/npm/bin/npm-cli.js') @Arguments
  if($LASTEXITCODE -ne 0){throw "npm $($Arguments -join ' ') failed ($LASTEXITCODE)."}
}
function Wait-FinosHttp([string]$Uri,[int]$Seconds=60) {
  $deadline=(Get-Date).AddSeconds($Seconds)
  do {
    try {if((Invoke-WebRequest -Uri $Uri -TimeoutSec 3).StatusCode -eq 200){return}} catch {}
    Start-Sleep -Milliseconds 400
  } while((Get-Date) -lt $deadline)
  throw "Service did not become ready: $Uri. Inspect .local/*.log."
}
function Test-FinosPort([int]$Port) {
  $client=[Net.Sockets.TcpClient]::new()
  try {return $client.ConnectAsync('127.0.0.1',$Port).Wait(400) -and $client.Connected} catch {return $false} finally {$client.Dispose()}
}
function Start-FinosPostgres($Settings) {
  $ctl=Join-Path $Settings.pgBin 'pg_ctl.exe'
  & $ctl status -D $Settings.pgData 2>$null | Out-Null
  if($LASTEXITCODE -ne 0){
    if(Test-FinosPort 55432){throw 'Port 55432 is occupied by another PostgreSQL instance.'}
    # A newly started postgres can inherit PowerShell's captured output handles.
    # Redirect pg_ctl to files and wait only for its parent process, not the
    # persistent server process tree (Start-Process -Wait would wait forever).
    $startup=Start-Process -FilePath $ctl -ArgumentList @('start','-D',('"'+$Settings.pgData+'"'),'-l',('"'+(Join-Path $FinosLocal 'postgres.log')+'"'),'-w','-t','45') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $FinosLocal 'pg-start.stdout.log') -RedirectStandardError (Join-Path $FinosLocal 'pg-start.stderr.log')
    if(-not $startup.WaitForExit(60000)){throw 'PostgreSQL startup timed out. Inspect .local/pg-start.*.log.'}
    if($startup.ExitCode -ne 0){throw 'Project PostgreSQL failed to start. Inspect .local/pg-start.*.log.'}
  }
}
function Get-FinosProcess([string]$Name) {
  $file=Join-Path $FinosLocal "$Name.process.json"
  if(-not(Test-Path -LiteralPath $file)){return $null}
  $record=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.id)" -ErrorAction SilentlyContinue
  if($process -and $process.CreationDate.ToUniversalTime() -eq ([DateTime]$record.created).ToUniversalTime() -and $process.CommandLine.Contains($record.marker,[StringComparison]::OrdinalIgnoreCase)){return $process}
  return $null
}
function Start-FinosProcess([string]$Name,[int]$Port,[string]$File,[string[]]$Arguments,[string]$Marker) {
  if(Get-FinosProcess $Name){return}
  if(Test-FinosPort $Port){throw "Port $Port is occupied by an untracked process. It will not be terminated automatically."}
  $process=Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $FinosRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $FinosLocal "$Name.stdout.log") -RedirectStandardError (Join-Path $FinosLocal "$Name.stderr.log")
  $details=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
  if(-not $details){throw "$Name exited immediately. Inspect .local/$Name.stderr.log."}
  @{id=$process.Id;created=$details.CreationDate.ToUniversalTime().ToString('o');marker=$Marker}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $FinosLocal "$Name.process.json")
}
function Stop-FinosProcess([string]$Name) {
  $process=Get-FinosProcess $Name
  if($process){Stop-Process -Id $process.ProcessId -ErrorAction Stop}
  $file=Join-Path $FinosLocal "$Name.process.json"
  if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file}
}
function Start-FinosKafka($Settings) {
  $java=Join-Path $Settings.java 'bin/java.exe'; $config=Join-Path $FinosLocal 'kafka.properties'
  $arguments=@('-Xms256m','-Xmx512m',('"-Dkafka.logs.dir='+$FinosLocal+'"'),('"-Dlog4j2.configurationFile='+(Join-Path $Settings.kafka 'config/log4j2.yaml')+'"'),'-cp',('"'+(Join-Path $Settings.kafka 'libs/*')+'"'),'kafka.Kafka',('"'+$config+'"'))
  Start-FinosProcess 'kafka' 19092 $java $arguments $config
  $deadline=(Get-Date).AddSeconds(45)
  while(-not(Test-FinosPort 19092)) {
    if((Get-Date) -gt $deadline -or -not(Get-FinosProcess 'kafka')){throw 'Kafka failed to become ready. Inspect .local/kafka.stderr.log.'}
    Start-Sleep -Milliseconds 500
  }
}

#Requires -Version 7.2
param([string]$DownloadCache,[switch]$SkipBuild)
. (Join-Path $PSScriptRoot 'scripts/Common.ps1')
if(-not $IsWindows -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64'){throw 'This portable setup supports Windows x64. See README for other platforms.'}
New-Item -ItemType Directory -Force $FinosLocal | Out-Null
$versions=Get-Content (Join-Path $PSScriptRoot 'scripts/runtime-versions.json') -Raw | ConvertFrom-Json -AsHashtable
$settingsFile=Join-Path $FinosLocal 'runtime.json'
$settings=if(Test-Path -LiteralPath $settingsFile){Get-FinosSettings}else{@{}}
if((Get-FinosProcess 'backend') -or (Get-FinosProcess 'frontend')){throw 'Run ./Stop-FINOS.ps1 -AppOnly before changing dependencies or rebuilding.'}
foreach($key in @('java','maven','pgBin','kafka','node')) {
  $check=if($settings[$key]){switch($key){java{Join-Path $settings.java 'bin/java.exe'} pgBin{Join-Path $settings.pgBin 'pg_ctl.exe'} kafka{Join-Path $settings.kafka 'config/server.properties'} default{$settings[$key]}}}else{$null}
  if($check -and (Test-Path -LiteralPath $check)){continue}
  $v=$versions[$key]; $destination=Join-Path $FinosLocal "tools/$($v.folder)"; $binary=Join-Path $destination $v.binary
  if(-not(Test-Path -LiteralPath $binary)) {
    $downloads=Join-Path $FinosLocal 'downloads'; New-Item -ItemType Directory -Force $downloads,$destination|Out-Null
    $archive=Join-Path $downloads $v.archive
    if(-not(Test-Path -LiteralPath $archive)) {
      $cached=if($DownloadCache){Join-Path $DownloadCache $v.archive}else{$null}
      if($cached -and (Test-Path -LiteralPath $cached)){Copy-Item -LiteralPath $cached -Destination $archive}
      else {Write-Output "Downloading pinned $key runtime...";Invoke-WebRequest $v.url -OutFile $archive -TimeoutSec 600}
    }
    if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $v.sha256){throw "Checksum mismatch for $archive. Remove that archive and retry."}
    if($v.archive.EndsWith('.tgz')) {& tar -xzf $archive -C $destination;if($LASTEXITCODE -ne 0){throw 'Kafka extraction failed'}}
    else {Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force}
    if(-not(Test-Path -LiteralPath $binary)){throw "Missing runtime after extraction: $binary"}
  }
  $settings[$key]=switch($key){java{Split-Path (Split-Path $binary)} pgBin{Split-Path $binary} kafka{Split-Path (Split-Path $binary)} default{$binary}}
}
if(-not $settings.ownerPassword){$settings.ownerPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))}
if(-not $settings.appPassword){$settings.appPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))}
if(-not $settings.pgData){$settings.pgData=Join-Path $FinosLocal 'pgdata'}
$settings|ConvertTo-Json|Set-Content -LiteralPath $settingsFile
if(-not(Test-Path -LiteralPath (Join-Path $settings.pgData 'PG_VERSION'))) {
  $pw=Join-Path $FinosLocal 'init-password.tmp'
  try {
    [IO.File]::WriteAllText($pw,$settings.ownerPassword)
    & (Join-Path $settings.pgBin 'initdb.exe') -D $settings.pgData -U finos_owner --pwfile=$pw --auth=scram-sha-256 --encoding=UTF8 --locale=C
    if($LASTEXITCODE -ne 0){throw 'PostgreSQL initialization failed; check the VC++ runtime prerequisite in README.'}
  } finally {if(Test-Path -LiteralPath $pw){Remove-Item -LiteralPath $pw}}
  Add-Content -LiteralPath (Join-Path $settings.pgData 'postgresql.conf') -Value "`nlisten_addresses='127.0.0.1'`nport=55432`nmax_connections=80"
}
Start-FinosPostgres $settings
Write-Output 'Provisioning local databases...'
Invoke-FinosEnvironment @{PGPASSWORD=$settings.ownerPassword} {
  if($settings.appPassword -notmatch '^[A-Fa-f0-9]{48}$'){throw 'Unexpected local password encoding.'}
  $sql="SELECT 'CREATE ROLE finos_app LOGIN PASSWORD ''$($settings.appPassword)''' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='finos_app')\gexec`nSELECT 'CREATE DATABASE finos OWNER finos_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='finos')\gexec`nSELECT 'CREATE DATABASE finos_test OWNER finos_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='finos_test')\gexec"
  $sql|& (Join-Path $settings.pgBin 'psql.exe') -h 127.0.0.1 -p 55432 -U finos_owner -d postgres -v ON_ERROR_STOP=1
  if($LASTEXITCODE -ne 0){throw 'Database provisioning failed'}
}
$config=Join-Path $FinosLocal 'kafka.properties'
Write-Output 'Checking Kafka storage...'
if(-not(Test-Path -LiteralPath $config)) {
  $data=(Join-Path $FinosLocal 'kafka-data').Replace('\','/')
  @"
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@127.0.0.1:19093
listeners=PLAINTEXT://127.0.0.1:19092,CONTROLLER://127.0.0.1:19093
advertised.listeners=PLAINTEXT://127.0.0.1:19092
listener.security.protocol.map=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
controller.listener.names=CONTROLLER
inter.broker.listener.name=PLAINTEXT
log.dirs=$data
num.partitions=3
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
group.initial.rebalance.delay.ms=0
num.network.threads=2
num.io.threads=4
# Retain this small local demo's logs: Windows can reject renaming mapped indexes during expiry.
log.retention.hours=-1
"@|Set-Content -LiteralPath $config
}
$kafkaData=Get-Content $config|Where-Object{$_ -like 'log.dirs=*'}|ForEach-Object{$_.Substring(9)}
if(-not(Test-Path -LiteralPath (Join-Path $kafkaData 'meta.properties'))) {
  $java=Join-Path $settings.java 'bin/java.exe';$cp=Join-Path $settings.kafka 'libs/*'
  $cluster=(& $java '-cp' $cp kafka.tools.StorageTool random-uuid | Select-Object -Last 1).Trim()
  & $java '-cp' $cp kafka.tools.StorageTool format -t $cluster -c $config
  if($LASTEXITCODE -ne 0){throw 'Kafka storage format failed'}
}
Push-Location $FinosRoot
Write-Output 'Installing frontend dependencies...'
try {
  Invoke-FinosEnvironment (Get-FinosEnvironment $settings) {
    Invoke-FinosNpm $settings @('ci','--no-audit','--no-fund')
    if(-not $SkipBuild) {
      & $settings.maven -B -f backend/pom.xml package -DskipTests
      if($LASTEXITCODE -ne 0){throw 'Backend build failed'}
      Invoke-FinosNpm $settings @('run','build')
    }
  }
} finally {Pop-Location}
Write-Output 'Setup complete. Run ./Start-FINOS.ps1. No Windows services or global runtimes were installed.'

#Requires -Version 7.2
param([switch]$AppOnly)
. (Join-Path $PSScriptRoot 'scripts/Common.ps1')
Stop-FinosProcess 'frontend'
Stop-FinosProcess 'backend'
if(-not $AppOnly) {
  Stop-FinosProcess 'kafka'
  $settings=Get-FinosSettings
  & (Join-Path $settings.pgBin 'pg_ctl.exe') status -D $settings.pgData 2>$null|Out-Null
  if($LASTEXITCODE -eq 0) {
    & (Join-Path $settings.pgBin 'pg_ctl.exe') stop -D $settings.pgData -m fast -w
    if($LASTEXITCODE -ne 0){throw 'PostgreSQL did not stop cleanly.'}
  }
}
Write-Output 'Project processes stopped. Stored ledger and Kafka data are preserved.'

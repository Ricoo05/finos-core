#Requires -Version 7.2
param([switch]$SkipBrowser,[switch]$LiveFx,[string]$BrowserChannel)
. (Join-Path $PSScriptRoot 'scripts/Common.ps1')
& (Join-Path $PSScriptRoot 'Start-FINOS.ps1') -NoBrowser
$settings=Get-FinosSettings
$testEnvironment=Get-FinosEnvironment $settings 'finos_test'
$testEnvironment.EVENT_MODE='postgres';$testEnvironment.TEST_KAFKA='true'
Push-Location $FinosRoot
try {
  Write-Output 'Running backend integration tests against finos_test...'
  Invoke-FinosEnvironment $testEnvironment {
    & $settings.maven -B -f backend/pom.xml test *> (Join-Path $FinosLocal 'integration-tests.log')
    if($LASTEXITCODE -ne 0){Get-Content (Join-Path $FinosLocal 'integration-tests.log') -Tail 45;throw 'Backend tests failed.'}
  }
  $suites=@(Get-ChildItem 'backend/target/surefire-reports/TEST-*.xml'|ForEach-Object {
    [xml]$r=Get-Content -LiteralPath $_.FullName
    @{name=$r.testsuite.name;tests=[int]$r.testsuite.tests;failures=[int]$r.testsuite.failures;errors=[int]$r.testsuite.errors;skipped=[int]$r.testsuite.skipped;seconds=[double]$r.testsuite.time}
  })
  $total=($suites|ForEach-Object{$_.tests}|Measure-Object -Sum).Sum
  if($total -ne 12 -or ($suites|Where-Object{$_.failures -or $_.errors -or $_.skipped})){throw 'Expected all 12 backend tests, including Kafka, without skips.'}
  $checks=[Collections.Generic.List[string]]::new()
  $checks.Add('12 backend integration tests passed, including real Kafka and Redis outage fallback.')
  Invoke-FinosEnvironment @{LIVE_FX=([string][bool]$LiveFx).ToLowerInvariant();PATH=((Split-Path $settings.node)+';'+$env:PATH);FINOS_BROWSER_CHANNEL=$BrowserChannel} {
    Invoke-FinosNpm $settings @('test')
    $checks.Add('HTTP integration smoke: settlement, replay, payload mismatch, Kafka projection, deduplication, SSE.')
    if($LiveFx){$checks.Add('Live FX check: provider available, timestamp fresh, server quote returned.')}
    if(-not $SkipBrowser) {
      if(-not $BrowserChannel) {
        & $settings.node node_modules/@playwright/test/cli.js install chromium
        if($LASTEXITCODE -ne 0){throw 'Browser installation failed. If installed, use -BrowserChannel msedge or chrome.'}
      }
      Invoke-FinosNpm $settings @('run','test:ui')
      $browser=Get-Content test-results/browser.json -Raw|ConvertFrom-Json
      if($browser.stats.unexpected -or $browser.stats.skipped){throw 'Browser report contains failures or skips.'}
      $checks.Add("$($browser.stats.expected) browser tests passed: six views, 320–1440px widths, retry after reload, freeze, backlog recovery and reconnect.")
    }
    Invoke-FinosNpm $settings @('run','build')
  }
  $checks.Add('Frontend production build passed.')
  @{passed=$true;recordedAt=(Get-Date).ToUniversalTime().ToString('o');checks=$checks;suites=$suites;scope="Local PostgreSQL and single-broker Kafka. Browser checks included: $(-not $SkipBrowser). Live FX check included: $([bool]$LiveFx). Healthy Redis cache and hosted CI are not verified. This is a recorded run, not continuous monitoring."}|ConvertTo-Json -Depth 5|Set-Content public/verification.json
  # Include the just-recorded evidence in the export as well as the dev server.
  Copy-Item -LiteralPath public/verification.json -Destination dist/verification.json
  Write-Output 'All requested checks passed. Evidence: public/verification.json'
} finally {Pop-Location}

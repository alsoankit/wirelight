# Packs the baked maps, their logs and the check report into wirelight-bake-results.zip (send that back).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path out\report.json)) { Write-Host "No out\report.json: run .\run.ps1 first"; exit 1 }
$zip = Join-Path $PSScriptRoot "wirelight-bake-results.zip"
if (Test-Path $zip) { Remove-Item $zip }
$files = @(Get-Item in\layouts.json) + @(Get-ChildItem out -Include *.webp, *.log.json, report.json -File -Recurse)
Compress-Archive -Path ($files | ForEach-Object { $_.FullName }) -DestinationPath $zip -CompressionLevel Optimal
$report = Get-Content out\report.json -Raw | ConvertFrom-Json
Write-Host ("{0} ({1:N1} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
if ($report.ok) { Write-Host "verify: OK" } else { Write-Host ("verify: {0} problem(s)" -f $report.problems.Count) }

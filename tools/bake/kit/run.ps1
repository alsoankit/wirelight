# Bakes every layout in in\ into out\, then checks the results.
#   .\run.ps1 [--quality draft|final] [--only id,id] [--force] [--cpu]
# Resumable: rerun after a failure or an interruption and finished layouts are skipped.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Find-Blender {
  if ($env:BLENDER -and (Test-Path $env:BLENDER)) { return $env:BLENDER }
  $cmd = Get-Command blender -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $roots = @("$env:ProgramFiles\Blender Foundation", "${env:ProgramFiles(x86)}\Steam\steamapps\common", "$env:LOCALAPPDATA\Programs")
  foreach ($root in $roots) {
    if (Test-Path $root) {
      $found = Get-ChildItem -Path $root -Filter blender.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
      if ($found) { return $found.FullName }
    }
  }
  return $null
}

$blender = Find-Blender
if (-not $blender) { Write-Host "Blender not found: install Blender 4.2 or later, or set `$env:BLENDER"; exit 2 }
$version = (& $blender --version | Select-Object -First 1)
Write-Host "Using $blender ($version)"
if ($version -match "Blender (\d+)\.(\d+)") {
  $major = [int]$Matches[1]; $minor = [int]$Matches[2]
  if ($major -lt 4 -or ($major -eq 4 -and $minor -lt 2)) { Write-Host "Blender $major.$minor is too old: 4.2 or later is needed"; exit 2 }
}
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader }

New-Item -ItemType Directory -Force -Path out | Out-Null
# Blender writes warnings to stderr; Windows PowerShell 5.1 would turn those into terminating errors under "Stop".
$ErrorActionPreference = "Continue"
$start = Get-Date
& $blender -b --factory-startup --python bake.py -- --in in --out out @args 2>&1 |
  Tee-Object -FilePath out\bake.log -Append | Select-String -Pattern '^\[bake\]|Error'
$status = $LASTEXITCODE
Write-Host ("Bake finished in {0:N0} min (exit {1})" -f ((Get-Date) - $start).TotalMinutes, $status)
& $blender -b --factory-startup --python verify.py -- --in in --out out 2>&1 | Select-String -Pattern '^\[verify\]'
exit $status

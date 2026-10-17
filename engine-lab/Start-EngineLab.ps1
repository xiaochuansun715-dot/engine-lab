[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$engineRoot=$PSScriptRoot
$engineAddress='http://127.0.0.1:4328'
function Read-EngineHealth {
  try { $engineHealth=Invoke-RestMethod -Uri "$engineAddress/health" -TimeoutSec 2; return ($engineHealth.app -eq 'engine-lab') } catch { return $false }
}
if (-not (Read-EngineHealth)) {
  $engineNodeCandidates=@(
    (Join-Path $engineRoot 'runtime\node.exe'),
    'D:\node.exe',
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
  )
  $engineNode=($engineNodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
  if (-not $engineNode) { $engineNode=(Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
  if (-not $engineNode) { throw 'Node.js was not found. This computer needs an existing Node.js runtime to start Engine Lab.' }
  $engineLogDir=Join-Path $engineRoot '.runtime'
  New-Item -ItemType Directory -Path $engineLogDir -Force | Out-Null
  Start-Process -FilePath $engineNode -ArgumentList @('"'+(Join-Path $engineRoot 'server.cjs')+'"') -WorkingDirectory $engineRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $engineLogDir 'server.log') -RedirectStandardError (Join-Path $engineLogDir 'server-error.log') | Out-Null
  $engineDeadline=(Get-Date).AddSeconds(10)
  while (-not (Read-EngineHealth) -and (Get-Date) -lt $engineDeadline) { Start-Sleep -Milliseconds 200 }
  if (-not (Read-EngineHealth)) { throw "Engine Lab did not start. Check $engineLogDir\server-error.log. Port 4328 may be occupied." }
}
if (-not $NoBrowser) { Start-Process $engineAddress }
Write-Output $engineAddress

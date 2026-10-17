$ErrorActionPreference='Stop'
try { $engineHealth=Invoke-RestMethod -Uri 'http://127.0.0.1:4328/health' -TimeoutSec 2 } catch { Write-Output 'Engine Lab is already stopped.'; exit 0 }
if ($engineHealth.app -ne 'engine-lab') { throw 'Port 4328 belongs to another app; no process was stopped.' }
$engineProc=Get-CimInstance Win32_Process -Filter "ProcessId = $($engineHealth.pid)"
$engineServerPath=Join-Path $PSScriptRoot 'server.cjs'
if ($engineProc.Name -ne 'node.exe' -or -not $engineProc.CommandLine.Contains($engineServerPath)) { throw 'Server identity did not match; no process was stopped.' }
Stop-Process -Id $engineProc.ProcessId
Write-Output 'Engine Lab stopped.'

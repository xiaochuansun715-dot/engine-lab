@echo off
setlocal
set "LAB_PWSH=%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe"
if exist "%LAB_PWSH%" goto launch
set "LAB_PWSH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if exist "%LAB_PWSH%" goto launch
set "LAB_PWSH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
:launch
"%LAB_PWSH%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-EngineLab.ps1"
if errorlevel 1 pause
endlocal

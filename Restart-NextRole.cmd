@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-NextRole.ps1" -Restart
if errorlevel 1 pause

@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Launch-Demo3.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)

@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node "%~dp0..\scripts\serve.mjs"
) else (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "%~dp0..\scripts\serve.mjs"
  ) else (
    echo Install free Node.js LTS from https://nodejs.org, then run this launcher again.
    echo Or open index.html and choose Basic extraction for the non-AI baseline.
  )
)
pause

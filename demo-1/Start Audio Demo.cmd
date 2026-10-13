@echo off
setlocal
cd /d "%~dp0"
set "AUDIO_PY=python"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" set AUDIO_PY="%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
py -3.12 --version >nul 2>&1
if not errorlevel 1 set "AUDIO_PY=py -3.12"
if exist "local-audio\.venv\Scripts\python.exe" goto run
echo Installing the free local audio tools. Internet access is needed for setup.
%AUDIO_PY% -m venv local-audio\.venv
if errorlevel 1 goto failed
:run
local-audio\.venv\Scripts\python.exe -m pip install --disable-pip-version-check -r local-audio\requirements.txt
if errorlevel 1 goto failed
local-audio\.venv\Scripts\python.exe local-audio\server.py
if errorlevel 1 goto failed
exit /b 0
:failed
echo Install Python 3.12 from python.org and enable Add Python to PATH, then try again.
echo If installation succeeded, read the error above. Setup instructions are in audio-setup.html.
pause
exit /b 1

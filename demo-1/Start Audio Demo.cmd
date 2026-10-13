@echo off
setlocal
if not exist "%~dp0local-audio\requirements.txt" goto missing_files
if not exist "%~dp0local-audio\server.py" goto missing_files
pushd "%~dp0"
if errorlevel 1 goto folder_failed
set "AUDIO_PY=python"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" set AUDIO_PY="%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
py -3.12 --version >nul 2>&1
if not errorlevel 1 set "AUDIO_PY=py -3.12"
if exist "local-audio\.venv\Scripts\python.exe" goto run
echo Installing the free local audio tools. Internet access is needed for setup.
%AUDIO_PY% -m venv local-audio\.venv
if errorlevel 1 goto python_failed
:run
local-audio\.venv\Scripts\python.exe -m pip install --disable-pip-version-check -r local-audio\requirements.txt
if errorlevel 1 goto install_failed
local-audio\.venv\Scripts\python.exe local-audio\server.py
if errorlevel 1 goto server_failed
popd
exit /b 0
:missing_files
echo The complete audio companion folder is missing.
echo This usually happens when the launcher is opened inside the ZIP.
echo.
echo 1. Close this window and go to Downloads in File Explorer.
echo 2. Right-click capstone-grp2-main.zip and choose Extract All.
echo 3. Open the extracted capstone-grp2-main folder, then demo-1.
echo 4. Double-click Start Audio Demo.cmd there.
echo Keep the launcher beside the local-audio folder. Do not move it by itself.
echo.
echo Launcher location:
echo "%~dp0"
echo No tools have been installed. This is not a Python installation error.
pause
exit /b 2
:folder_failed
echo Could not open the project folder. Extract the ZIP to a folder you can access.
pause
exit /b 1
:python_failed
echo Python could not create the local environment. Read the error above.
echo If Python is missing, install Python 3.12 and enable Add Python to PATH.
goto failed
:install_failed
echo The audio packages could not be installed. Read the error above.
echo Check your internet connection and the Windows instructions in audio-setup.html.
goto failed
:server_failed
echo The local audio service could not start. Read the error above.
echo If port 4176 is already in use, close the older audio demo launcher.
:failed
popd
pause
exit /b 1

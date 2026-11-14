@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
set "projectExitCode=%errorlevel%"
if not "%projectExitCode%"=="0" if not "%JOB_ASSISTANT_NONINTERACTIVE%"=="1" pause
exit /b %projectExitCode%

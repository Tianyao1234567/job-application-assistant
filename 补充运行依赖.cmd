@echo off
setlocal
node "%~dp0scripts\prepare-deps.mjs"
set "projectExitCode=%errorlevel%"
if not "%projectExitCode%"=="0" if not "%JOB_ASSISTANT_NONINTERACTIVE%"=="1" pause
exit /b %projectExitCode%

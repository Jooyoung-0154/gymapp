@echo off
setlocal
cd /d "%~dp0"
set "GYM_PWSH="
for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined GYM_PWSH set "GYM_PWSH=%%P"
if not defined GYM_PWSH if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "GYM_PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined GYM_PWSH if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe" set "GYM_PWSH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not defined GYM_PWSH (
  echo PowerShell 7 was not found. Please install PowerShell 7.
  pause
  exit /b 1
)
if "%~1"=="--check" (
  "%GYM_PWSH%" -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"
  exit /b
)
"%GYM_PWSH%" -NoProfile -File "%~dp0tools\start-app.ps1"
set "GYM_EXIT=%ERRORLEVEL%"
echo.
echo Application stopped. Exit code: %GYM_EXIT%
pause
exit /b %GYM_EXIT%

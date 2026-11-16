@echo off
setlocal
cd /d "%~dp0"
if not exist ".validation" mkdir ".validation"
set "PG_DIAG_LOG=%~dp0.validation\pg-native-diagnostic.log"
set "PG_DIAG_BIN=C:\Program Files\PostgreSQL\15\bin"
> "%PG_DIAG_LOG%" echo PostgreSQL native startup diagnosis
>> "%PG_DIAG_LOG%" echo Date: %date% %time%
>> "%PG_DIAG_LOG%" ver
echo Checking pg_ctl.exe...
"%PG_DIAG_BIN%\pg_ctl.exe" --version >> "%PG_DIAG_LOG%" 2>&1
set "PG_CTL_RESULT=%ERRORLEVEL%"
>> "%PG_DIAG_LOG%" echo PG_CTL_EXIT=%PG_CTL_RESULT%
echo Checking psql.exe...
"%PG_DIAG_BIN%\psql.exe" --version >> "%PG_DIAG_LOG%" 2>&1
set "PG_PSQL_RESULT=%ERRORLEVEL%"
>> "%PG_DIAG_LOG%" echo PSQL_EXIT=%PG_PSQL_RESULT%
echo Checking postgres.exe...
"%PG_DIAG_BIN%\postgres.exe" --version >> "%PG_DIAG_LOG%" 2>&1
set "PG_SERVER_RESULT=%ERRORLEVEL%"
>> "%PG_DIAG_LOG%" echo POSTGRES_EXIT=%PG_SERVER_RESULT%
echo.
type "%PG_DIAG_LOG%"
echo.
if "%PG_CTL_RESULT%:%PG_PSQL_RESULT%:%PG_SERVER_RESULT%"=="0:0:0" (
  echo RESULT: All three programs started successfully in this CMD environment.
  echo PostgreSQL startup works here. No DLL replacement was performed.
) else (
  echo RESULT: At least one native program failed. Keep this log for diagnosis.
)
echo.
echo Log: "%PG_DIAG_LOG%"
echo This check does not modify the database or install software.
pause
endlocal

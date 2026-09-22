@echo off
rem Double-click this file from inside the folder that holds your movie, plan and voice files.
rem Or drag that folder onto this file.
cd /d "%~dp0"
if "%~1"=="" (
  node naki-export.js .
) else (
  node naki-export.js "%~1"
)
echo.
pause

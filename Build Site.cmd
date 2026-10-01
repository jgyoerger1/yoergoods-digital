@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
if errorlevel 1 ( echo BUILD FAILED. & pause & exit /b 1 )
echo.
echo Built. The website is in docs\
pause

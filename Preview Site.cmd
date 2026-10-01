@echo off
cd /d "%~dp0"
start "" http://localhost:8777/yoergoods-digital/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8777

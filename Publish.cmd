@echo off
cd /d "%~dp0"
echo Building...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
if errorlevel 1 (
  echo BUILD FAILED - nothing was published.
  pause
  exit /b 1
)
echo.
echo Publishing to GitHub Pages...
git add -A
git commit -m "Update site"
git push
echo.
echo Published. The live site updates within a minute or two.
pause

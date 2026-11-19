@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
  echo Could not open the project folder.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  pause
  popd
  exit /b 1
)

node scripts\recover-admin.js
echo.
pause
popd
endlocal

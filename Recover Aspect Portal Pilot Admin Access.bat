@echo off
setlocal
pushd "%~dp0" >nul
if errorlevel 1 (
  echo Could not open or map the project folder.
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

set "ASPECT_DATA_DIR=%LOCALAPPDATA%\AspectCompaniesPortalPilot"
node scripts\recover-admin.js
echo.
pause
popd
endlocal

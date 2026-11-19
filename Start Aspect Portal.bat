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
  echo Node.js was not found. Install Node.js 22.13 or newer, then try again.
  pause
  popd
  exit /b 1
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number);try{require('node:sqlite');process.exit(major>22||(major===22&&minor>=13)?0:1)}catch{process.exit(1)}" >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer with the built-in SQLite module is required.
  pause
  popd
  exit /b 1
)

set "PORTAL_URL=http://localhost:3000"
node -e "const fs=require('node:fs'),crypto=require('node:crypto'),expected=crypto.createHash('sha256').update(fs.readFileSync('server.js')).digest('hex').slice(0,16);fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1500)}).then(async r=>{let d;try{d=await r.json()}catch{process.exit(3)}if(!r.ok||d.service!=='aspect-portal-api'||d.pilotMode!==false)process.exit(3);process.exit(d.buildId===expected?0:2)}).catch(()=>process.exit(1))" >nul 2>nul
if errorlevel 3 (
  echo Port 3000 is in use by another service or returned an invalid health response.
  echo Stop the other service before starting the Aspect Companies Portal.
  pause
  popd
  exit /b 3
)
if errorlevel 2 (
  echo The portal is already running, but its server code is out of date.
  echo Press Ctrl+C in the original portal terminal, then click this launcher again.
  pause
  popd
  exit /b 2
)
if not errorlevel 1 (
  echo Aspect Companies Portal is already running at %PORTAL_URL%
  start "" "%PORTAL_URL%"
  popd
  exit /b 0
)

set "ASPECT_OPEN_BROWSER=1"
node server.js
set "PORTAL_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %PORTAL_EXIT_CODE%

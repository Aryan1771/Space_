@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing Space_ dependencies...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
)

echo Building Space_...
call npm run build
if errorlevel 1 exit /b %errorlevel%

echo Starting Space_...
call npm start

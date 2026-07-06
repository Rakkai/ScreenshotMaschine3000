@echo off
setlocal EnableExtensions

rem Screenshot Maschine 3000 — Dashboard-Start
cd /d "%~dp0.."

if not exist "package.json" (
  echo.
  echo FEHLER: package.json wurde nicht gefunden.
  echo Bitte das Programm nicht verschieben oder umbenennen.
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo FEHLER: Node.js ist nicht installiert.
  echo Bitte von https://nodejs.org/ installieren und den PC neu starten.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installiere Abhaengigkeiten ^(einmalig^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo FEHLER: npm install ist fehlgeschlagen.
    echo.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
  )
)

if not exist "logs\" mkdir "logs"
if not exist "screenshots\" mkdir "screenshots"

title Screenshot Maschine 3000
npm start
exit /b %ERRORLEVEL%

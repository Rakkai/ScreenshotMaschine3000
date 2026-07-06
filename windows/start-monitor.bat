@echo off
setlocal EnableExtensions

rem Screenshot Maschine 3000 — manueller Start (Desktop-Verknuepfung)
cd /d "%~dp0.."

if not exist "monitor.js" (
  echo.
  echo FEHLER: monitor.js wurde nicht gefunden.
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
  echo.
  echo FEHLER: .env fehlt. Bitte zuerst die Einrichtung ausfuehren:
  echo   Rechtsklick auf "Einrichten" ^(Install-ScreenshotMaschine.ps1^) -^> Mit PowerShell ausfuehren
  echo.
  pause
  exit /b 1
)

if not exist "logs\" mkdir "logs"

title Screenshot Maschine 3000
echo.
echo ========================================
echo   Screenshot Maschine 3000
echo ========================================
echo.
echo Starte WhatsApp-Ueberwachung...
echo Beim ersten Mal: QR-Code mit dem Handy scannen.
echo Danach meldet sich WhatsApp automatisch an.
echo.
echo Fenster offen lassen. Zum Beenden: Strg+C
echo.

node monitor.js
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
  echo.
  echo Das Programm ist mit Fehlercode %EXIT_CODE% beendet.
  echo Details stehen in logs\monitor.log
  echo.
  pause
)

exit /b %EXIT_CODE%

@echo off
echo.
echo Screenshot Maschine 3000 — Autostart und Verknuepfung entfernen...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-ScreenshotMaschine.ps1"
echo.
pause

#Requires -Version 5.1
<#
.SYNOPSIS
  Entfernt Desktop-Verknuepfung und Autostart von Screenshot Maschine 3000.
#>

$ErrorActionPreference = 'Stop'

$TaskName = 'ScreenshotMaschine3000'
$ShortcutName = 'Screenshot Maschine 3000.lnk'

Write-Host ''
Write-Host 'Screenshot Maschine 3000 — Deinstallation der Windows-Einrichtung' -ForegroundColor Yellow
Write-Host ''

$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop $ShortcutName
if (Test-Path -LiteralPath $ShortcutPath) {
    Remove-Item -LiteralPath $ShortcutPath -Force
    Write-Host "Desktop-Verknuepfung entfernt: $ShortcutPath"
}
else {
    Write-Host 'Keine Desktop-Verknuepfung gefunden.'
}

$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Autostart-Aufgabe entfernt: $TaskName"
}
else {
    Write-Host 'Keine Autostart-Aufgabe gefunden.'
}

Write-Host ''
Write-Host 'Fertig. Das Programm selbst wurde nicht geloescht.' -ForegroundColor Green
Write-Host ''

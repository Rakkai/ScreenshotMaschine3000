#Requires -Version 5.1
<#
.SYNOPSIS
  Einrichtung fuer Screenshot Maschine 3000 (Dashboard-Verknuepfung + Autostart).

.DESCRIPTION
  - Prueft Node.js
  - Installiert npm-Abhaengigkeiten
  - Erstellt .env aus Vorlage (falls noetig)
  - Legt Desktop-Verknuepfung an
  - Registriert Autostart nach Windows-Anmeldung
#>
param(
    [switch]$SkipDesktopShortcut,
    [switch]$SkipAutostart
)

$ErrorActionPreference = 'Stop'

$WindowsDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $WindowsDir
$TaskName = 'ScreenshotMaschine3000'
$ShortcutName = 'Screenshot Maschine 3000.lnk'
$BackgroundVbs = Join-Path $WindowsDir 'start-dashboard-background.vbs'

function Write-Step([string]$Message) {
    Write-Host "-> $Message" -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  Screenshot Maschine 3000 — Einrichtung' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'monitor.js'))) {
    throw "monitor.js nicht gefunden in: $ProjectRoot"
}

Write-Step 'Pruefe Node.js...'
if (-not (Test-Command 'node')) {
    throw @"
Node.js ist nicht installiert.
Bitte von https://nodejs.org/ die LTS-Version installieren und danach dieses Skript erneut ausfuehren.
"@
}
Write-Host "   Node $(node --version)"

$NodeExe = (Get-Command node).Source
$NodePathFile = Join-Path $WindowsDir 'node-path.txt'
Set-Content -LiteralPath $NodePathFile -Value $NodeExe -Encoding ASCII
Write-Host "   Node-Pfad gespeichert: $NodeExe"

Write-Step 'Installiere Abhaengigkeiten...'
Push-Location $ProjectRoot
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw 'npm install ist fehlgeschlagen.'
    }
}
finally {
    Pop-Location
}

Write-Step 'Pruefe Konfiguration (.env)...'
$EnvFile = Join-Path $ProjectRoot '.env'
$EnvExample = Join-Path $ProjectRoot '.env.example'
if (-not (Test-Path -LiteralPath $EnvFile)) {
    if (-not (Test-Path -LiteralPath $EnvExample)) {
        throw '.env und .env.example fehlen.'
    }
    Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
    Write-Host '   .env wurde aus .env.example erstellt.' -ForegroundColor Yellow
    Write-Host '   Kontakte und Chats koennen im Dashboard eingetragen werden.' -ForegroundColor Yellow
}
else {
    Write-Host '   .env vorhanden.'
}

Ensure-Directory (Join-Path $ProjectRoot 'logs')
Ensure-Directory (Join-Path $ProjectRoot 'screenshots')

if (-not $SkipDesktopShortcut) {
    Write-Step 'Erstelle Desktop-Verknuepfung...'
    $Desktop = [Environment]::GetFolderPath('Desktop')
    $ShortcutPath = Join-Path $Desktop $ShortcutName
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $Shortcut.Arguments = "`"$BackgroundVbs`""
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.WindowStyle = 1
    $Shortcut.Description = 'Screenshot Maschine 3000 Dashboard starten'
    $Shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,69"
    $Shortcut.Save()
    Write-Host "   Verknuepfung: $ShortcutPath"
}

if (-not $SkipAutostart) {
    Write-Step 'Richte Autostart ein (nach Windows-Anmeldung)...'

    $ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($ExistingTask) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    $Action = New-ScheduledTaskAction `
        -Execute 'wscript.exe' `
        -Argument "`"$BackgroundVbs`"" `
        -WorkingDirectory $ProjectRoot

    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $Trigger.Delay = 'PT45S'

    $Settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 2) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Description 'Startet Screenshot Maschine 3000 nach der Windows-Anmeldung.' `
        | Out-Null

    Write-Host "   Geplante Aufgabe: $TaskName (Start 45 Sek. nach Anmeldung)"
}

Write-Host ''
Write-Host 'Fertig!' -ForegroundColor Green
Write-Host ''
Write-Host 'Naechste Schritte:'
Write-Host '  1. Desktop-Verknuepfung doppelklicken'
Write-Host '  2. Beim ersten Mal QR-Code im Appfenster mit WhatsApp scannen'
Write-Host '  3. Zielkontakte oder Chats im Dashboard eintragen und speichern'
Write-Host '  4. Danach startet das Dashboard bei jedem PC-Neustart automatisch'
Write-Host ''

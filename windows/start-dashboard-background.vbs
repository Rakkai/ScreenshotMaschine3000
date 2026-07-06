' Screenshot Maschine 3000 — Dashboard-Start ohne Terminalfenster
Option Explicit

Dim fso, shell, scriptDir, projectDir, runCmd

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(scriptDir)

If Not fso.FileExists(projectDir & "\package.json") Then
  WScript.Quit 1
End If

shell.CurrentDirectory = projectDir
runCmd = "cmd.exe /c npm start"
' 0 = kein Terminalfenster; das Electron-Appfenster bleibt sichtbar.
shell.Run runCmd, 0, False

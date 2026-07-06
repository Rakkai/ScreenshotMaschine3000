' Screenshot Maschine 3000 — Hintergrundstart (Autostart nach Windows-Anmeldung)
' Laeuft komplett unsichtbar. Logs: logs\monitor.log
Option Explicit

Dim fso, shell, scriptDir, projectDir, nodePathTxt, nodeExe, runCmd, nodeFile

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(scriptDir)
nodePathTxt = scriptDir & "\node-path.txt"

If Not fso.FileExists(projectDir & "\monitor.js") Then
  WScript.Quit 1
End If

If Not fso.FileExists(projectDir & "\.env") Then
  WScript.Quit 1
End If

If fso.FileExists(nodePathTxt) Then
  Set nodeFile = fso.OpenTextFile(nodePathTxt, 1)
  nodeExe = Trim(nodeFile.ReadAll())
  nodeFile.Close
Else
  nodeExe = "node"
End If

If Len(nodeExe) = 0 Then
  nodeExe = "node"
End If

shell.CurrentDirectory = projectDir

runCmd = """" & nodeExe & """ monitor.js"
' 0 = komplett versteckt (kein leeres Terminal-Fenster)
shell.Run runCmd, 0, False

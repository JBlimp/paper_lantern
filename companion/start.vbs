Set shell = CreateObject("WScript.Shell")
folder = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\PaperLantern\companion"
shell.Run "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & folder & "\library.ps1""", 0, False

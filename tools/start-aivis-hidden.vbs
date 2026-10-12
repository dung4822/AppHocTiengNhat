' Chay AivisSpeech Engine an (khong hien cua so console)
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & dir & "\start-aivis.bat""", 0, False

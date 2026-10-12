' Sinh audio con thieu o nen (an cua so), doc lap voi Claude. Xem tien do: data\cache\audio.log
Set sh = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
sh.Run "cmd /c npx tsx pipeline\audio.ts > data\cache\audio.log 2>&1", 0, False

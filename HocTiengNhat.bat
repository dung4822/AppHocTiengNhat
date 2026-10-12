@echo off
rem Mo app hoc tieng Nhat (tu build lan dau neu chua co)
cd /d "%~dp0"
if not exist "out\main\index.js" (
  echo Dang build app lan dau...
  call npx electron-vite build
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."

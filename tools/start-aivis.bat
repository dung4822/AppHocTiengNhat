@echo off
rem Khoi dong AivisSpeech Engine. Du lieu (model giong, log) luu tren o D qua junction.
rem Mac dinh chay CPU (GPU MX350 de bi treo DirectML). Them tham so "gpu" de thu GPU.
set "DATA=%~dp0..\data\aivis-engine"
if not exist "%DATA%" mkdir "%DATA%"
if not exist "%APPDATA%\AivisSpeech-Engine" mklink /J "%APPDATA%\AivisSpeech-Engine" "%DATA%"
set "GPUFLAG="
if /I "%~1"=="gpu" set "GPUFLAG=--use_gpu"
cd /d "%~dp0aivis\Windows-x64"
run.exe %GPUFLAG% --output_log_utf8 --port 10101 > "%~dp0..\data\aivis-engine.log" 2>&1

@echo off
rem Double-click once per drive: downloads Git Bash, Node.js, llama.cpp and the model into runtime\.
rem Run it again any time; it only downloads what's missing (an interrupted model download resumes).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if errorlevel 1 (echo. & echo Install failed; see the message above. Double-click install again to retry.) else (echo. & echo Installed. Double-click app to start.)
pause

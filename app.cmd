@echo off
rem Double-click: asks for a project folder, then opens Salieri (the coding agent) in it; quitting
rem Salieri closes the window. The work happens in scripts\app.ps1.
if not exist "%~dp0runtime\git\usr\bin\mintty.exe" (
  echo Salieri isn't installed yet: double-click install first.
  pause
  exit /b 1
)
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\app.ps1"

@echo off
rem Double-click: opens the portable Git Bash, where `salieri`, node and npm are ready to use
rem (runtime\git\etc\profile.d\salieri.sh, written by setup, puts them on its PATH).
if not exist "%~dp0runtime\git\git-bash.exe" (
  echo Salieri isn't installed yet: double-click install first.
  pause
  exit /b 1
)
start "" "%~dp0runtime\git\git-bash.exe" --cd-to-home

@echo off
rem Double-click: opens the portable Git Bash in the home folder, where `salieri`, node and npm are
rem ready to use (runtime\git\etc\profile.d\salieri.sh, written by install, sets them up).
if not exist "%~dp0runtime\git\usr\bin\mintty.exe" (
  echo Salieri isn't installed yet: double-click install first.
  pause
  exit /b 1
)
rem What git-bash.exe --cd-to-home does, plus -c for our look (configs\mintty.conf).
set MSYSTEM=MINGW64
start "" /D "%USERPROFILE%" "%~dp0runtime\git\usr\bin\mintty.exe" -c "%~dp0configs\mintty.conf" -i "%~dp0runtime\git\mingw64\share\git\git-for-windows.ico" /usr/bin/bash --login -i

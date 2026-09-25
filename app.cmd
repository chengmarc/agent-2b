@echo off
rem Double-click: opens the portable Git Bash in the home folder and starts 2B in it; quitting
rem 2B leaves a normal prompt, with `2b`, node and npm ready to use
rem (runtime\git\etc\profile.d\2b.sh, written by install, sets them up and does the autorun).
if not exist "%~dp0runtime\git\usr\bin\mintty.exe" (
  echo 2B isn't installed yet: double-click install first.
  pause
  exit /b 1
)
rem What git-bash.exe --cd-to-home does, plus -c for our look (configs\mintty.conf).
set MSYSTEM=MINGW64
set TWOB_AUTORUN=1
start "" /D "%USERPROFILE%" "%~dp0runtime\git\usr\bin\mintty.exe" -c "%~dp0configs\mintty.conf" -i "%~dp0runtime\git\mingw64\share\git\git-for-windows.ico" /usr/bin/bash --login -i

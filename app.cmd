@echo off
rem Double-click: opens the portable Git Bash in the home folder and starts 2B in it; quitting
rem 2B leaves a normal prompt, with `2b`, node and npm ready to use.
if not exist "%~dp0runtime\git\usr\bin\mintty.exe" (
  echo 2B isn't installed yet: double-click install first.
  pause
  exit /b 1
)
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
rem Git Bash keeps the PATH it starts with, after its own folders (unless ORIGINAL_PATH, left by
rem another Git Bash this was started from, says otherwise).
set "PATH=%ROOT%\runtime\node;%PATH%"
set ORIGINAL_PATH=
rem The 2b command: bash defines a function from each BASH_FUNC_<name>%% variable it starts with, and
rem passes it on to the bashes it starts (%%%% is how a .cmd file writes %%).
set "BASH_FUNC_2b%%%%=() {  node "$(cygpath -u '%ROOT%')/agent/main.ts" "$@"; }"
rem What git-bash.exe --cd-to-home does, plus -c for our look (configs\mintty.conf).
set MSYSTEM=MINGW64
rem First the agent (a Ctrl+C in it is the agent's, not this shell's), then a normal prompt.
start "" /D "%USERPROFILE%" "%~dp0runtime\git\usr\bin\mintty.exe" -c "%~dp0configs\mintty.conf" -i "%~dp0runtime\git\mingw64\share\git\git-for-windows.ico" /usr/bin/bash --login -i -c "trap : INT; 2b; trap - INT; exec bash --login -i"

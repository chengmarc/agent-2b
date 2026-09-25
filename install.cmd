@echo off
rem Double-click once per drive: downloads Git Bash, Node.js, llama.cpp and the model into runtime\.
rem Run it again any time; it only downloads what's missing (an interrupted download resumes).
rem Node.js comes first, with Windows' own curl and tar (not Git's, if one is on PATH); the rest of the installer (scripts\install.ts) runs in it.
setlocal
set "RUNTIME=%~dp0runtime"
set "NODE_ZIP=node-v24.21.0-win-x64.zip"
rem Node.js 24.21.0 LTS (the agent needs 22.18+ to run its .ts files as they are)   ~30 MB
set "NODE_URL=https://nodejs.org/dist/v24.21.0/%NODE_ZIP%"

if exist "%RUNTIME%\node\node.exe" goto installer
echo.
echo == runtime/node ==
rem curl reads HTTPS_PROXY, but not the Windows proxy setting (e.g. Clash), so copy it there.
set "KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
if defined HTTPS_PROXY goto download
reg query "%KEY%" /v ProxyEnable 2>nul | findstr /c:"0x1" >nul || goto download
for /f "tokens=3" %%p in ('reg query "%KEY%" /v ProxyServer 2^>nul ^| findstr ProxyServer') do set "SERVER=%%p"
if not defined SERVER goto download
rem Not per-protocol ones (http=...;https=...).
echo %SERVER%| findstr /c:"=" >nul && goto download
set "HTTPS_PROXY=http://%SERVER%"

:download
set "ZIP=%RUNTIME%\downloads\%NODE_ZIP%"
rem A finished download; an unfinished one is still <zip>.part.
if exist "%ZIP%" goto unpack
if not exist "%RUNTIME%\downloads" mkdir "%RUNTIME%\downloads"
echo Downloading %NODE_ZIP%...
rem -C -: resume a partial download; a stalled connection is dropped and retried.
"%SystemRoot%\System32\curl.exe" -L --fail --retry 5 --retry-all-errors -C - --speed-limit 10000 --speed-time 60 --progress-bar ^
  -o "%ZIP%.part" "%NODE_URL%" || goto failed
move "%ZIP%.part" "%ZIP%" >nul || goto failed

:unpack
if exist "%RUNTIME%\node.new" rmdir /s /q "%RUNTIME%\node.new"
mkdir "%RUNTIME%\node.new"
rem The zip holds a single folder (node-v24.21.0-win-x64\): use what's inside it.
"%SystemRoot%\System32\tar.exe" -xf "%ZIP%" -C "%RUNTIME%\node.new" --strip-components 1 || goto failed
move "%RUNTIME%\node.new" "%RUNTIME%\node" >nul || goto failed
del "%ZIP%"
echo Ready: runtime/node

:installer
"%RUNTIME%\node\node.exe" "%~dp0scripts\install.ts" || goto failed
echo.
echo Installed. Double-click app to start.
pause
exit /b 0

:failed
echo.
echo Install failed; see the message above. Double-click install again to retry.
pause
exit /b 1

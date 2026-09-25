# Run by install.cmd: sets up everything 2B needs, inside this folder. Run again any time.
#  1. downloads whatever is missing from configs/components.txt (Git Bash, Node.js, llama.cpp, the model),
#     each one the same way: download (resumable) -> check sha256 -> unpack into <dest>.new -> rename to <dest>
#  2. sets up 2b (scripts/app.sh), node and npm in the portable Git Bash that app.cmd opens
#  3. writes configs/2b.conf, if there isn't one, estimated from this computer's VRAM and RAM
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$curl = "$env:SystemRoot\System32\curl.exe"   # Windows' own, not Git's
$tar = "$env:SystemRoot\System32\tar.exe"     # Windows' own; unpacks .zip
$staging = "$root\runtime\downloads"          # partial downloads wait here, so they resume

function Write-LF($path, $text) {  # bash reads these files, so LF endings and no BOM
  [IO.File]::WriteAllText($path, $text.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
}
function Run($exe, [string[]]$argv) {  # runs a program in this console (its progress shows as is); returns its exit code
  $quoted = $argv | ForEach-Object { if ($_ -match '[\s"]') { "`"$_`"" } else { $_ } }
  (Start-Process -FilePath $exe -ArgumentList $quoted -NoNewWindow -Wait -PassThru).ExitCode
}

# ---- the GPU: llama.cpp here is the CUDA build, so an NVIDIA GPU (and its driver) is required ----
$vram = 0
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  $out = & nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits
  if ($LASTEXITCODE -eq 0 -and $out) { $vram = [int](@($out)[0].Trim()) }
}
if (-not $vram) { throw "no NVIDIA GPU found (nvidia-smi): 2B needs one, with its driver installed" }

# ---- proxy: curl doesn't read the Windows proxy setting (e.g. Clash), so pass it on ----
$proxy = @()
$ie = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
if (-not $env:HTTPS_PROXY -and $ie.ProxyEnable -eq 1 -and $ie.ProxyServer -and $ie.ProxyServer -notmatch '=') {
  $proxy = @('--proxy', "http://$($ie.ProxyServer)")
  Write-Host "(using the Windows proxy $($ie.ProxyServer))"
}

# ---- 1. components ----
$rows = foreach ($line in Get-Content "$root\configs\components.txt") {
  if ($line -match '^\s*(#|$)') { continue }
  $dest, $sha, $url = -split $line
  [pscustomobject]@{ Dest = $dest; Sha = $sha; Url = $url; File = $url.Split('/')[-1] }
}

foreach ($group in $rows | Group-Object Dest) {
  $dest = Join-Path $root $group.Name
  if (Test-Path $dest) { continue }   # only a finished install gets renamed to $dest
  Write-Host "`n== $($group.Name) =="
  New-Item -ItemType Directory -Force $staging | Out-Null

  foreach ($r in $group.Group) {
    $file = "$staging\$($r.File)"
    $done = (Test-Path $file) -and (Get-FileHash -Algorithm SHA256 $file).Hash -eq $r.Sha
    if (-not $done) {
      Write-Host "Downloading $($r.File)..."
      # -C -: resume a partial download; a stalled connection is dropped and retried.
      $code = Run $curl (@('-L', '--fail', '--retry', '5', '--retry-all-errors', '-C', '-', '--speed-limit', '10000',
        '--speed-time', '60', '--progress-bar') + $proxy + @('-o', $file, $r.Url))
      if ($code -ne 0) { throw "downloading $($r.File) failed; double-click install again to resume" }
      Write-Host "Checking sha256..."
      if ((Get-FileHash -Algorithm SHA256 $file).Hash -ne $r.Sha) {
        Remove-Item $file
        throw "$($r.File) is corrupted (sha256 mismatch); double-click install again"
      }
    }
  }

  $tmp = "$dest.new"
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  foreach ($r in $group.Group) {
    $file = "$staging\$($r.File)"
    if ($r.File -like '*.zip') {
      New-Item -ItemType Directory -Force $tmp | Out-Null
      if ((Run $tar @('-xf', $file, '-C', $tmp)) -ne 0) { throw "unpacking $($r.File) failed" }
    } elseif ($r.File -like '*.7z.exe') {   # a self-extracting 7-Zip archive
      New-Item -ItemType Directory -Force $tmp | Out-Null
      if ((Run $file @("-o$tmp", '-y')) -ne 0) { throw "unpacking $($r.File) failed" }
    } else {
      New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
      Move-Item $file $tmp
    }
  }
  # A zip that holds a single folder (e.g. node-v24-win-x64/): use what's inside it.
  $inner = @(Get-ChildItem -Force $tmp -ErrorAction SilentlyContinue)
  if ((Test-Path $tmp -PathType Container) -and $inner.Count -eq 1 -and $inner[0].PSIsContainer) {
    Get-ChildItem -Force $inner[0].FullName | Move-Item -Destination $tmp
    Remove-Item $inner[0].FullName
  }
  Move-Item $tmp $dest
  foreach ($r in $group.Group) { Remove-Item -ErrorAction SilentlyContinue "$staging\$($r.File)" }
  Write-Host "Ready: $($group.Name)"
}
if ((Test-Path $staging) -and -not (Get-ChildItem $staging)) { Remove-Item $staging }

# ---- 2. the app's commands ----
# This Git Bash is <2b>/runtime/git, so the 2b folder is two up from its /.
Write-LF "$root\runtime\git\etc\profile.d\2b.sh" @'
# Written by install.cmd: the 2b command (scripts/app.sh), and node and npm first on PATH,
# in this portable Git Bash.
TWOB_ROOT="$(cygpath -u "$(dirname "$(dirname "$(cygpath -m /)")")")"
export PATH="$TWOB_ROOT/runtime/node:$PATH"
2b() { bash "$TWOB_ROOT/scripts/app.sh" "$@"; }
# app.cmd sets TWOB_AUTORUN: its window starts with the agent, as if `2b` had been typed at the
# first prompt; quitting it leaves a normal prompt.
if [ -n "${TWOB_AUTORUN-}" ] && [[ $- == *i* ]]; then
  unset TWOB_AUTORUN
  _prompt=${PS1@P}; printf '%s2b\n' "${_prompt//[$'\001\002']/}"; unset _prompt
  2b
fi
'@

# ---- 3. configs/2b.conf ----
$conf = "$root\configs\2b.conf"
if (Test-Path $conf) {
  Write-Host "`nKeeping configs\2b.conf (if this computer's GPU differs, edit it by hand):"
  Get-Content $conf | Where-Object { $_ -notmatch '^#' } | ForEach-Object { Write-Host "  $_" }
} else {
  $ramMb = [int]((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1MB)
  # ~3 GB for attention, KV cache (32k) and buffers; ~0.52 GB per expert layer; 24 layers total;
  # plus 2 layers of margin, since nothing is measured.
  $n = 24 - [math]::Floor(($vram - 3000) / 520) + 2
  $n = [math]::Max(0, [math]::Min(24, $n))
  # Keeping the CPU-side experts in RAM (not memory-mapped) is much faster, if RAM allows.
  $load = if ($ramMb -ge 14000) { 'none' } else { 'mmap' }
  Write-LF $conf @"
# 2B server settings (estimated by install on $env:COMPUTERNAME from $vram MB VRAM and $ramMb MB RAM, $(Get-Date -Format yyyy-MM-dd)).
# One file for every computer: on a new one, check these and edit by hand.
#   NCPUMOE   expert layers kept on the CPU, 0-24. Lower is faster but needs more VRAM;
#             raise it if the server fails to start (out of memory).
#   LOADMODE  none = copy CPU-side experts into RAM (fast, needs ~14 GB RAM); mmap = read them from disk
#   CTX       context window in tokens
NCPUMOE=$n
LOADMODE=$load
CTX=32768

"@
  Write-Host "`nWrote configs\2b.conf: NCPUMOE=$n LOADMODE=$load CTX=32768"
}

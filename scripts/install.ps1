# Run by install.cmd. Windows has no bash yet, so this fetches portable Git for Windows (Git Bash)
# into runtime/git/, then hands over to `salieri setup` for Node.js, llama.cpp and the model.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# The pinned URL and checksum live in versions.sh, next to every other version.
$versions = @{}
foreach ($line in Get-Content "$root\scripts\versions.sh") {
  if ($line -match '^(\w+)="([^"]*)"') { $versions[$Matches[1]] = $Matches[2] }
}

$git = "$root\runtime\git"
if (-not (Test-Path "$git\bin\bash.exe")) {
  $tmp = "$root\runtime\git.new"
  $exe = "$tmp\PortableGit.7z.exe"
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Write-Host "Downloading Git for Windows (portable, ~60 MB)..."
  # WebClient uses the Windows system proxy (e.g. Clash) on its own.
  (New-Object Net.WebClient).DownloadFile($versions['GIT_URL'], $exe)
  if ((Get-FileHash -Algorithm SHA256 $exe).Hash -ne $versions['GIT_SHA256']) {
    throw "checksum mismatch for $($versions['GIT_URL']); run install again"
  }
  Write-Host "Unpacking..."
  Start-Process -Wait -FilePath $exe -ArgumentList "-o`"$tmp`"", '-y'
  Remove-Item $exe
  if (-not (Test-Path "$tmp\bin\bash.exe")) { throw "unpacking Git for Windows failed" }
  if (Test-Path $git) { Remove-Item -Recurse -Force $git }
  Move-Item $tmp $git
  Write-Host "Git Bash ready: runtime\git"
}

# The rest is bash, like every other salieri command. bash wants the script path with forward slashes.
& "$git\bin\bash.exe" "$($root.Replace('\', '/'))/bin/salieri" setup
exit $LASTEXITCODE

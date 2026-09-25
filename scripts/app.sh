#!/usr/bin/env bash
# scripts/app.sh: the `salieri` command (bash, in the portable Git Bash that app.cmd opens; install defines `salieri` there).
# Runs the agent, starting llama-server (the process that runs the model) for it, and stopping it
# once the last Salieri window is done.
set -u

# ---- layout (everything relative to ROOT, so the drive letter doesn't matter) ----
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
MODEL="$ROOT/runtime/model/_model.gguf"
LLAMA="$ROOT/runtime/llama/llama-server.exe"   # llama.cpp, CUDA build
NODE="$ROOT/runtime/node/node.exe"             # portable Node.js
CONF="$ROOT/configs/salieri.conf"   # one set of server settings; retweak by hand on a new computer
LOG="$ROOT/logs/server.log"
PORT=8080
URL="http://127.0.0.1:$PORT"

say()  { printf '%s\n' "$*"; }
die()  { printf 'salieri: %s\n' "$*" >&2; exit 1; }
winpath() { cygpath -w "$1"; }

# ---- the model server ----
health() { curl -s -m 2 --noproxy '*' "$URL/health" 2>/dev/null | grep -q '"ok"'; }

start_server() {
  health && return 0
  [ -f "$CONF" ] || die "configs/salieri.conf is missing. Double-click install"
  # shellcheck disable=SC1090
  source "$CONF"
  [ -x "$LLAMA" ] || die "llama.cpp is missing. Double-click install"
  [ -f "$MODEL" ] || die "the model is missing. Double-click install"
  mkdir -p "$ROOT/logs"
  printf '\nLoading model weights '   # the progress dots below continue this line
  # A hidden process of its own (no window), started through Windows so it isn't tied to this terminal.
  # --jinja: format every message with the chat template inside the model file.
  local args="-m \"$(winpath "$MODEL")\" --log-file \"$(winpath "$LOG")\""
  args+=" --alias gpt-oss-20b -c $CTX --parallel 1 -ngl 99 --n-cpu-moe $NCPUMOE --load-mode $LOADMODE"
  args+=" --fit off --jinja --host 127.0.0.1 --port $PORT"
  powershell.exe -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '$(winpath "$LLAMA")' -ArgumentList '$args'" \
    || die "couldn't launch llama-server"
  local i
  for i in $(seq 1 120); do
    if health; then
      # The agent adds "System prompt:" in the same columns right below (main.ts).
      printf '\n\n'
      printf '%-16s%s\n' "Expert on CPU:" "$NCPUMOE layers" "Context length:" "$CTX tokens"
      return 0
    fi
    tasklist //FI "IMAGENAME eq llama-server.exe" 2>/dev/null | grep -q llama-server || break
    printf '.'; sleep 2
  done
  say ""; tail -n 15 "$LOG" 2>/dev/null
  die "the server didn't start (log: $LOG). Out of memory: raise NCPUMOE in configs/salieri.conf. A corrupted download: delete runtime/llama/ or runtime/model/ and double-click install."
}

# ---- the agent ----
use_system_proxy() {
  # Node (NODE_USE_ENV_PROXY) reads HTTPS_PROXY but not the Windows proxy setting (e.g. Clash), so copy it over.
  [ -n "${HTTPS_PROXY:-}${https_proxy:-}" ] && return
  local key='HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings' s
  reg.exe query "$key" //v ProxyEnable 2>/dev/null | grep -q '0x1' || return
  s=$(reg.exe query "$key" //v ProxyServer 2>/dev/null | awk '/ProxyServer/ {print $3}' | tr -d '\r')
  [ -n "$s" ] && [[ "$s" != *=* ]] || return
  export HTTPS_PROXY="http://$s" HTTP_PROXY="http://$s"
}

watch_server() {
  # When this script ends, however it ends (quitting, Ctrl-C while loading, or killed along with its
  # closed window, where no trap runs reliably), a hidden watcher outside the window stops the server,
  # unless another Salieri window is still running. (-EncodedCommand: PowerShell, free of quoting.)
  local ps
  ps=$(cat <<'EOF'
Wait-Process -Id @PID@
$others = Get-CimInstance Win32_Process -Filter "Name='bash.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('@APP@') }
if (-not $others) { Stop-Process -Name llama-server -Force -ErrorAction SilentlyContinue }
EOF
)
  ps=${ps//@PID@/$(cat /proc/$$/winpid)}
  ps=${ps//@APP@/${ROOT//\'/\'\'}/scripts/app.sh}
  powershell.exe -NoProfile -Command "Start-Process -WindowStyle Hidden powershell.exe -ArgumentList '-NoProfile -EncodedCommand $(printf '%s' "$ps" | iconv -t UTF-16LE | base64 -w0)'" \
    || die "couldn't start the server watcher"
}

run_agent() {
  [ -x "$NODE" ] || die "Node.js is missing. Double-click install"
  watch_server
  start_server   # or use the one already running, e.g. for another Salieri window
  # shellcheck disable=SC1090
  source "$CONF"
  trap ':' INT   # from here a Ctrl-C belongs to the agent; this script just ends after it
  use_system_proxy   # for WebSearch / WebFetch; the model server stays direct (NO_PROXY)
  SALIERI_URL="$URL" SALIERI_CTX="$CTX" SALIERI_BASH="$(winpath "$(command -v bash)")" \
    NODE_USE_ENV_PROXY=1 NO_PROXY="127.0.0.1,localhost" "$NODE" "$(winpath "$ROOT/agent/main.ts")"
}

[ $# -eq 0 ] || die "salieri takes no options (in the agent, /help lists its commands)"
run_agent

# Paths and small helpers shared by every command. Sourced by bin/salieri, which sets ROOT.

# ---- layout (everything relative to ROOT, so the drive letter doesn't matter) ----
MODEL="$ROOT/runtime/model/_model.gguf"
HOST="${COMPUTERNAME:-$(hostname)}"
CONF="$ROOT/salieri.conf"   # one set of server settings; retweak by hand on a new computer
LOG="$ROOT/logs/server.log"
PORT=8080
URL="http://127.0.0.1:$PORT"
LLAMA="$ROOT/runtime/llama/llama-server.exe"   # llama.cpp, CUDA build
NODE="$ROOT/runtime/node/node.exe"   # portable Node.js

say()  { printf '%s\n' "$*"; }
die()  { printf 'salieri: %s\n' "$*" >&2; exit 1; }
winpath() { cygpath -w "$1"; }
conf_summary() { grep -v '^#' "$CONF" | tr '\n' ' '; }   # salieri.conf settings on one line

# ---- network ----
use_system_proxy() {
  # Node (NODE_USE_ENV_PROXY) reads HTTPS_PROXY but not the Windows proxy setting (e.g. Clash), so copy it over.
  [ -n "${HTTPS_PROXY:-}${https_proxy:-}" ] && return
  local key='HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings' s
  reg.exe query "$key" //v ProxyEnable 2>/dev/null | grep -q '0x1' || return
  s=$(reg.exe query "$key" //v ProxyServer 2>/dev/null | awk '/ProxyServer/ {print $3}' | tr -d '\r')
  [ -n "$s" ] && [[ "$s" != *=* ]] || return
  export HTTPS_PROXY="http://$s" HTTP_PROXY="http://$s"
  say "(using the Windows proxy $s)"
}

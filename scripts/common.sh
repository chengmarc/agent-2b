# Paths and small helpers shared by every command. Sourced by salieri.sh, which sets ROOT.

# ---- layout (everything relative to ROOT, so the drive letter doesn't matter) ----
MODEL="$ROOT/model/_model.gguf"
HOST="${COMPUTERNAME:-$(hostname)}"
CONF="$ROOT/salieri.conf"   # one set of server settings; retweak by hand on a new computer
LOG="$ROOT/logs/server.log"
PORT=8080
URL="http://127.0.0.1:$PORT"
llama_exe() { printf '%s' "$ROOT/engine/$1/llama-server.exe"; }   # backend -> path

say()  { printf '%s\n' "$*"; }
die()  { printf 'salieri: %s\n' "$*" >&2; exit 1; }
ask()  { local a; read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }
winpath() { cygpath -w "$1"; }
node_ok() {  # Node.js is installed and at least NODE_MIN
  command -v node >/dev/null 2>&1 && node -e "const [a, b] = process.versions.node.split('.').map(Number), [x, y] = '$NODE_MIN'.split('.').map(Number); process.exit(a > x || (a === x && b >= y) ? 0 : 1)"
}
conf_summary() { grep -v '^#' "$CONF" | tr '\n' ' '; }   # salieri.conf settings on one line

# ---- network ----
use_system_proxy() {
  # curl reads HTTPS_PROXY but not the Windows proxy setting (e.g. Clash), so copy it over.
  [ -n "${HTTPS_PROXY:-}${https_proxy:-}" ] && return
  local key='HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings' s
  reg.exe query "$key" //v ProxyEnable 2>/dev/null | grep -q '0x1' || return
  s=$(reg.exe query "$key" //v ProxyServer 2>/dev/null | awk '/ProxyServer/ {print $3}' | tr -d '\r')
  [ -n "$s" ] && [[ "$s" != *=* ]] || return
  export HTTPS_PROXY="http://$s" HTTP_PROXY="http://$s"
  say "(using the Windows proxy $s)"
}

download() {  # url dest  (resumes a partial download; a stalled connection is dropped and retried)
  curl -L --fail --retry 5 --retry-all-errors -C - --speed-limit 10000 --speed-time 60 \
       --progress-bar -o "$2" "$1"
}

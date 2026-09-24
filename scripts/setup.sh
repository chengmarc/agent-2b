# `salieri setup` (run by install.cmd; downloads whatever is missing) and `salieri status`. Sourced by bin/salieri.

estimate_conf() {  # backend: writes salieri.conf with settings estimated from this computer's VRAM and RAM
  local backend="$1" vram=0 ram_mb n load
  ram_mb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
  if [ "$backend" = cuda ]; then
    vram=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 | tr -d ' \r')
    # ~3 GB for attention, KV cache (32k) and buffers; ~0.52 GB per expert layer; 24 layers total;
    # plus 2 layers of margin, since nothing is measured.
    n=$(( 24 - (vram - 3000) / 520 + 2 ))
  else
    n=20   # unknown VRAM: start conservative
  fi
  (( n < 0 )) && n=0; (( n > 24 )) && n=24
  # Keeping the CPU-side experts in RAM (not memory-mapped) is much faster, if RAM allows.
  (( ram_mb >= 14000 )) && load=none || load=mmap
  cat > "$CONF" <<EOF
# Salieri server settings (estimated by 'salieri setup' on $HOST from ${vram} MB VRAM and ${ram_mb} MB RAM, $(date +%F)).
# One file for every computer: on a new one, check these and edit by hand.
#   BACKEND   cuda (NVIDIA) or vulkan (any other GPU); uses engine/<BACKEND>/
#   NCPUMOE   expert layers kept on the CPU, 0-24. Lower is faster but needs more VRAM;
#             raise it if the server fails to start (out of memory).
#   LOADMODE  none = copy CPU-side experts into RAM (fast, needs ~14 GB RAM); mmap = read them from disk
#   CTX       context window in tokens
BACKEND=$backend
NCPUMOE=$n
LOADMODE=$load
CTX=32768
EOF
  say "Wrote salieri.conf: $(conf_summary)"
}

install_profile() {  # puts salieri, node and npm first on PATH in the portable Git Bash that app.cmd opens
  local f="$ROOT/runtime/git/etc/profile.d/salieri.sh"
  [ -d "${f%/*}" ] || return 0   # not installed by install.cmd
  cat > "$f" <<'EOF2'
# Written by `salieri setup`. This Git Bash is <salieri>/runtime/git, so the salieri folder is two up from /.
SALIERI_ROOT="$(cygpath -u "$(dirname "$(dirname "$(cygpath -m /)")")")"
export PATH="$SALIERI_ROOT/bin:$SALIERI_ROOT/runtime/node:$PATH"
EOF2
}

setup() {
  say "== salieri setup on $HOST =="
  install_profile
  [ -x "$NODE" ] || download_node
  local backend; backend="$(detect_backend)"
  [ "$backend" = cuda ] || say "No NVIDIA GPU found; using the Vulkan build."
  [ -x "$(llama_exe "$backend")" ] || download_llama "$backend"
  [ -f "$MODEL" ] || download_model
  if [ -f "$CONF" ]; then
    say "Using salieri.conf: $(conf_summary)"
    say "If this computer's GPU differs, edit salieri.conf by hand."
  else
    estimate_conf "$backend"
  fi
  say "Done. Double-click app, then type 'salieri' in a project folder."
}

status() {
  say "drive:    $ROOT"
  say "computer: $HOST"
  if [ -f "$CONF" ]; then say "settings: $(conf_summary)(salieri.conf)"; else say "settings: none (run salieri setup)"; fi
  local b; for b in cuda vulkan; do
    [ -x "$(llama_exe "$b")" ] && say "llama:    $b, $(llama_build "$b")"
  done
  [ -f "$MODEL" ] && say "model:    model/_model.gguf ($(( $(stat -c %s "$MODEL") / 1048576 )) MB)" || say "model:    missing"
  [ -x "$NODE" ] && say "node:     $("$NODE" --version)" || say "node:     missing (run salieri setup)"
  local git="$ROOT/runtime/git/cmd/git.exe"
  [ -x "$git" ] && say "git bash: runtime/git ($("$git" --version))" || say "git bash: missing (run install.cmd)"
  health && say "server:   running at $URL" || say "server:   stopped"
}

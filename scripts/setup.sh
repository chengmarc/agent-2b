# `salieri setup` (once per computer) and `salieri status`. Sourced by salieri.sh.

install_command() {
  mkdir -p "$HOME/bin"
  # The shim remembers where the drive was; if the letter changed, it looks for salieri.sh next to salieri.conf.
  cat > "$HOME/bin/salieri" <<EOF
#!/usr/bin/env bash
# Installed by 'salieri setup'. Finds the salieri drive and runs it.
last="$ROOT"
[ -f "\$last/salieri.sh" ] && [ -f "\$last/salieri.conf" ] && exec bash "\$last/salieri.sh" "\$@"
for d in /{c..z}; do
  [ -d "\$d" ] || continue
  for c in "\$d"/salieri.conf "\$d"/*/salieri.conf; do
    [ -f "\$c" ] && [ -f "\$(dirname "\$c")/salieri.sh" ] && exec bash "\$(dirname "\$c")/salieri.sh" "\$@"
  done
done
echo "salieri: drive not found. Plug in the SSD." >&2; exit 1
EOF
  chmod +x "$HOME/bin/salieri"
  if ! echo ":$PATH:" | grep -q ":$HOME/bin:"; then
    echo 'export PATH="$HOME/bin:$PATH"   # salieri' >> "$HOME/.bashrc"
    say "Added ~/bin to PATH in ~/.bashrc (open a new Git Bash)."
  fi
  say "Installed the 'salieri' command (~/bin/salieri)."
}

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

setup() {
  say "== salieri setup on $HOST =="
  install_command
  node_ok || say "The agent needs Node.js $NODE_MIN or newer: install it from nodejs.org (salieri chat works without it)."
  local backend; backend="$(detect_backend)"
  [ "$backend" = cuda ] || say "No NVIDIA GPU found; using the Vulkan build."
  [ -x "$(llama_exe "$backend")" ] || download_llama "$backend"
  if [ ! -f "$MODEL" ]; then
    ask "The model isn't on this drive. Download it now ($MODEL_SIZE)?" && download_model || die "no model; run salieri setup again to download it"
  fi
  if [ -f "$CONF" ]; then
    say "Using salieri.conf: $(conf_summary)"
    say "If this computer's GPU differs, edit salieri.conf by hand."
  else
    estimate_conf "$backend"
  fi
  say "Done. Type 'salieri' in any project folder."
}

status() {
  say "drive:    $ROOT"
  say "computer: $HOST"
  if [ -f "$CONF" ]; then say "settings: $(conf_summary)(salieri.conf)"; else say "settings: none (run salieri setup)"; fi
  local b; for b in cuda vulkan; do
    [ -x "$(llama_exe "$b")" ] && say "llama:    $b, $(llama_build "$b")"
  done
  [ -f "$MODEL" ] && say "model:    model/_model.gguf ($(( $(stat -c %s "$MODEL") / 1048576 )) MB)" || say "model:    missing"
  node_ok && say "node:     $(node --version)" || say "node:     missing or older than $NODE_MIN (nodejs.org)"
  health && say "server:   running at $URL" || say "server:   stopped"
}

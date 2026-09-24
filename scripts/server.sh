# Starting, stopping and checking llama-server, the process that runs the model. Sourced by salieri.sh.

detect_backend() { command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1 && echo cuda || echo vulkan; }
llama_build() { "$(llama_exe "$1")" --version 2>&1 | grep -o 'build [0-9]*'; }
health() { curl -s -m 2 --noproxy '*' "$URL/health" 2>/dev/null | grep -q '"ok"'; }

start_server() {
  health && return 0
  [ -f "$CONF" ] || die "salieri.conf is missing. Run: salieri setup"
  # shellcheck disable=SC1090
  source "$CONF"
  local exe; exe="$(llama_exe "$BACKEND")"
  [ -x "$exe" ] || die "llama.cpp ($BACKEND) is missing. Run: salieri setup"
  [ -f "$MODEL" ] || die "the model is missing. Run: salieri setup"
  mkdir -p "$ROOT/logs"
  local name; [ "$BACKEND" = cuda ] && name=CUDA || name=Vulkan
  printf '\nLoading model weights '   # the progress dots below continue this line
  # A hidden process of its own (no window), so the server outlives this terminal and the next start is instant.
  # --jinja: format every message with the chat template inside the model file.
  local args="-m \"$(winpath "$MODEL")\" --log-file \"$(winpath "$LOG")\""
  args+=" --alias gpt-oss-20b -c $CTX --parallel 1 -ngl 99 --n-cpu-moe $NCPUMOE --load-mode $LOADMODE"
  args+=" --fit off --jinja --host 127.0.0.1 --port $PORT"
  powershell.exe -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '$(winpath "$exe")' -ArgumentList '$args'" \
    || die "couldn't launch llama-server"
  local i
  for i in $(seq 1 120); do
    if health; then
      # The agent adds "System prompt:" in the same columns right below (main.ts).
      printf '\n\n'
      printf '%-16s%s\n' "Backend:" "$name" "Expert on CPU:" "$NCPUMOE layers" "Context length:" "$CTX tokens"
      return 0
    fi
    tasklist //FI "IMAGENAME eq llama-server.exe" 2>/dev/null | grep -q llama-server || break
    printf '.'; sleep 2
  done
  say ""; tail -n 15 "$LOG" 2>/dev/null
  die "the server didn't start (log: $LOG). Out of memory: raise NCPUMOE in salieri.conf. A corrupted download: delete engine/$BACKEND/ or model/_model.gguf and run salieri setup."
}

stop_server() {
  taskkill //F //IM llama-server.exe >/dev/null 2>&1 && say "Server stopped." || say "No server running."
}

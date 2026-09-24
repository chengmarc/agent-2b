# `salieri status`: what's installed, the settings, server state. Sourced by bin/salieri.

status() {
  say "drive:    $ROOT"
  say "computer: $HOST"
  if [ -f "$CONF" ]; then say "settings: $(conf_summary)(salieri.conf)"; else say "settings: none (double-click install)"; fi
  [ -x "$LLAMA" ] && say "llama:    $(llama_build)" || say "llama:    missing (double-click install)"
  [ -f "$MODEL" ] && say "model:    runtime/model/_model.gguf ($(( $(stat -c %s "$MODEL") / 1048576 )) MB)" || say "model:    missing (double-click install)"
  [ -x "$NODE" ] && say "node:     $("$NODE" --version)" || say "node:     missing (double-click install)"
  local git="$ROOT/runtime/git/cmd/git.exe"
  [ -x "$git" ] && say "git bash: $("$git" --version)" || say "git bash: missing (double-click install)"
  health && say "server:   running at $URL" || say "server:   stopped"
}

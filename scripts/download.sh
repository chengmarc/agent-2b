# Downloading llama.cpp, the model and Node.js, for `salieri setup`. Each one downloads into a temporary
# place and only replaces the old copy once the new one works. Sourced by bin/salieri.

download_llama() {  # backend
  local backend="$1" zips
  case "$backend" in
    cuda)   zips="llama-$LLAMA_TAG-bin-win-cuda-$LLAMA_CUDA-x64.zip cudart-llama-bin-win-cuda-$LLAMA_CUDA-x64.zip" ;;
    vulkan) zips="llama-$LLAMA_TAG-bin-win-vulkan-x64.zip" ;;
    *) die "unknown backend '$backend' (cuda or vulkan)" ;;
  esac
  use_system_proxy
  stop_server >/dev/null
  local tmp="$ROOT/engine/$backend.new" z
  rm -rf "$tmp"; mkdir -p "$tmp"
  for z in $zips; do
    say "Downloading $z..."
    download "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_TAG/$z" "$tmp/$z" || die "download failed"
    unzip -q -o "$tmp/$z" -d "$tmp" && rm "$tmp/$z" || die "unzip failed"
  done
  "$tmp/llama-server.exe" --version 2>&1 | grep -q "build" || die "the downloaded llama-server doesn't run"
  rm -rf "$ROOT/engine/$backend"; mv "$tmp" "$ROOT/engine/$backend"
  say "llama.cpp ready: engine/$backend ($(llama_build "$backend"))"
}

download_model() {
  use_system_proxy
  stop_server >/dev/null
  mkdir -p "$ROOT/model"
  say "Downloading ${MODEL_URL##*/} ($MODEL_SIZE; run setup again to resume if interrupted)..."
  download "$MODEL_URL" "$MODEL.part" || die "download failed; run salieri setup again to resume"
  say "Verifying checksum..."
  echo "$MODEL_SHA256  $MODEL.part" | sha256sum -c --status || { rm -f "$MODEL.part"; die "checksum mismatch; the download was corrupted. Run salieri setup again."; }
  mv -f "$MODEL.part" "$MODEL"
  say "Model ready: model/_model.gguf"
}

download_node() {
  use_system_proxy
  local z="node-v$NODE_VERSION-win-x64.zip" tmp="$ROOT/runtime/node.new"
  rm -rf "$tmp"; mkdir -p "$tmp"
  say "Downloading $z..."
  download "https://nodejs.org/dist/v$NODE_VERSION/$z" "$tmp/$z" || die "download failed"
  echo "$NODE_SHA256  $tmp/$z" | sha256sum -c --status || die "checksum mismatch for $z; run setup again"
  unzip -q -o "$tmp/$z" -d "$tmp" && rm "$tmp/$z" || die "unzip failed"
  "$tmp/${z%.zip}/node.exe" --version >/dev/null || die "the downloaded node doesn't run"
  rm -rf "$ROOT/runtime/node"; mv "$tmp/${z%.zip}" "$ROOT/runtime/node"; rm -rf "$tmp"
  say "Node.js ready: runtime/node ($("$NODE" --version))"
}

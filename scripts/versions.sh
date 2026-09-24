# Pinned versions of everything Salieri downloads. To upgrade: change them here, delete the old copy
# (engine/<backend>/ or model/_model.gguf), then run `salieri setup`. Sourced by salieri.sh.

LLAMA_TAG="b10434"   # llama.cpp release (github.com/ggml-org/llama.cpp/releases)
LLAMA_CUDA="12.4"    # CUDA build of that release
MODEL_URL="https://huggingface.co/ggml-org/gpt-oss-20b-GGUF/resolve/ef9b12f2ff56c69cf32153a02784e7a3c88bf524/gpt-oss-20b-MXFP4.gguf"
MODEL_SIZE="11.5 GB"
MODEL_SHA256="27cd6c432c7672cb812a92f611cf3ba7bbc35928262bb1e1253ff4ee6ae35901"
NODE_MIN="22.18"    # oldest Node.js that runs the agent's .ts files as is (installed by the user, not downloaded)

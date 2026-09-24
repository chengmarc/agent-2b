# Pinned versions of everything Salieri downloads. To upgrade: change them here, delete the old copy
# (runtime/git/, runtime/node/, engine/<backend>/ or model/_model.gguf), then run install.cmd again.
# Sourced by bin/salieri; scripts/install.ps1 reads the GIT_* lines too, so keep them as NAME="value".

GIT_URL="https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/PortableGit-2.55.0.5-64-bit.7z.exe"
GIT_SHA256="5aa8a20f6e9abb2c755f0e73c91c687701a46b309ad84a0ca6509380fa4ae290"
NODE_VERSION="24.21.0"   # Node.js LTS (nodejs.org/dist); the agent needs 22.18+ to run its .ts files as is
NODE_SHA256="158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541"   # node-v$NODE_VERSION-win-x64.zip
LLAMA_TAG="b10434"   # llama.cpp release (github.com/ggml-org/llama.cpp/releases)
LLAMA_CUDA="12.4"    # CUDA build of that release
MODEL_URL="https://huggingface.co/ggml-org/gpt-oss-20b-GGUF/resolve/ef9b12f2ff56c69cf32153a02784e7a3c88bf524/gpt-oss-20b-MXFP4.gguf"
MODEL_SIZE="11.5 GB"
MODEL_SHA256="27cd6c432c7672cb812a92f611cf3ba7bbc35928262bb1e1253ff4ee6ae35901"

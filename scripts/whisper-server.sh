#!/usr/bin/env bash
# Local Whisper server for Sotto HQ recording.
# One-time setup: brew install whisper-cpp
# Run: ./scripts/whisper-server.sh   (first run downloads the model, ~1.6 GB)
#
# The server binds to 127.0.0.1 only — nothing is reachable from the network.
set -euo pipefail

MODEL_DIR="${SOTTO_MODEL_DIR:-$HOME/.sotto/models}"
MODEL_NAME="${SOTTO_MODEL:-ggml-large-v3-turbo.bin}"
MODEL="$MODEL_DIR/$MODEL_NAME"
PORT="${SOTTO_WHISPER_PORT:-8123}"

if ! command -v whisper-server >/dev/null 2>&1; then
  echo "whisper-server not found. Install it with: brew install whisper-cpp" >&2
  exit 1
fi

mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL" ]; then
  echo "Downloading $MODEL_NAME (~1.6 GB) to $MODEL_DIR ..."
  curl -L --fail -o "$MODEL.part" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL_NAME"
  mv "$MODEL.part" "$MODEL"
fi

echo "Starting whisper-server on 127.0.0.1:$PORT with $MODEL_NAME"
exec whisper-server -m "$MODEL" --host 127.0.0.1 --port "$PORT"

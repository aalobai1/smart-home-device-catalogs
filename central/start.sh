#!/bin/bash
# Start the Matter controller + Command Central UI.
# Usage: ./central/start.sh   (run from repo root or anywhere)
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CTRL="$ROOT/controller"
CENTRAL="$ROOT/central"

if [ ! -x "$CTRL/.venv/bin/matter-server" ]; then
  echo "Setting up the Matter controller (one-time)…"
  cd "$CTRL"
  uv venv --python 3.13 .venv
  uv pip install --python .venv/bin/python "python-matter-server[server]"
fi

echo "Starting Matter controller (ws://127.0.0.1:5580)…"
mkdir -p "$CTRL/data"
"$CTRL/.venv/bin/matter-server" --storage-path "$CTRL/data" --port 5580 --log-level info \
  > "$CTRL/server.log" 2>&1 &
CTRL_PID=$!
echo "  controller pid $CTRL_PID  (logs: controller/server.log)"

# wait for the controller WS to open
for i in $(seq 1 30); do nc -z 127.0.0.1 5580 2>/dev/null && break; sleep 1; done

echo "Starting Command Central UI (http://127.0.0.1:8090)…"
node "$CENTRAL/server.mjs" > "$CENTRAL/server.log" 2>&1 &
UI_PID=$!
echo "  ui pid $UI_PID  (logs: central/server.log)"

echo "$CTRL_PID $UI_PID" > "$ROOT/.pids"
echo
echo "Open → http://127.0.0.1:8090"
echo "Stop → ./central/stop.sh"

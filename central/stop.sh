#!/bin/bash
# Stop the controller + UI started by start.sh
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.pids" ]; then
  kill $(cat "$ROOT/.pids") 2>/dev/null && echo "stopped." || echo "nothing running."
  rm -f "$ROOT/.pids"
else
  pkill -f "matter-server --storage-path" 2>/dev/null
  pkill -f "central/server.mjs" 2>/dev/null
  echo "stopped (by name)."
fi

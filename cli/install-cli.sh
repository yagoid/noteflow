#!/bin/bash
# NoteFlow CLI installer — Linux/macOS (requires Node.js >= 18)
set -e

DEST="/usr/local/bin/noteflow"
URL="https://raw.githubusercontent.com/yagoid/noteflow/main/cli/noteflow.js"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$DEST"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$DEST" "$URL"
else
  echo "Error: curl or wget required" && exit 1
fi

chmod +x "$DEST"
echo "noteflow CLI installed → $DEST"
echo "Try: noteflow help"

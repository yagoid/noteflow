#!/bin/bash
# chrome-sandbox requires setuid root so Electron's renderer sandbox works.
# We use dpkg-statoverride to register the override in dpkg's database so
# that it survives package updates and dpkg re-processing.
SANDBOX="/opt/NoteFlow/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  dpkg-statoverride --remove "$SANDBOX" 2>/dev/null || true
  dpkg-statoverride --add root root 4755 "$SANDBOX"
  chown root:root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi

# Post-install: create 'noteflow' CLI symlink
CLI_PATH="/opt/NoteFlow/resources/cli/noteflow.js"
if [ -f "$CLI_PATH" ]; then
  chmod +x "$CLI_PATH"
  ln -sf "$CLI_PATH" /usr/local/bin/noteflow
fi

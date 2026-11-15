#!/bin/bash
# Post-remove: clean up CLI symlink and sandbox permission override
rm -f /usr/local/bin/noteflow
dpkg-statoverride --remove /opt/NoteFlow/chrome-sandbox 2>/dev/null || true
if hash update-desktop-database 2>/dev/null; then
  update-desktop-database /usr/share/applications || true
fi

#!/bin/bash
# NoteFlow CLI installer — Linux/macOS (requires Node.js >= 18)
# Installs the CLI and its AI agent skill; re-running it updates both.
set -e

DEST="/usr/local/bin/noteflow"
URL="https://raw.githubusercontent.com/yagoid/noteflow/main/cli/noteflow.js"
SKILL_URL="https://raw.githubusercontent.com/yagoid/noteflow/main/cli/noteflow-cli/SKILL.md"

download() { # <url> <file>
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  else
    wget -qO "$2" "$1"
  fi
}

if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  echo "Error: curl or wget required" && exit 1
fi

download "$URL" "$DEST"
chmod +x "$DEST"
echo "noteflow CLI installed → $DEST"

# ── AI agent skill ────────────────────────────────────────────────────────────
# Same destinations as the desktop app (skillAgentDestDirs in electron/main.ts):
#   ~/.claude/skills/noteflow-cli           Claude Code
#   ~/.agents/skills/noteflow-cli           Agent Skills standard (Codex, Gemini CLI, Cursor…)
#   ~/.codeium/windsurf/skills/noteflow-cli only if ~/.codeium/windsurf already exists
# Best-effort: a failure here never fails the CLI install. Note that set -e is
# off inside functions called from an `if`, hence the explicit `|| return 1`.

SKILL_USER=""   # owner of what we create (the real user under sudo), empty = current
SKILL_HOME=""

resolve_skill_home() {
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    case "$SUDO_USER" in -*|*[!A-Za-z0-9._-]*) return 1 ;; esac
    SKILL_USER="$SUDO_USER"
    if command -v getent >/dev/null 2>&1; then
      SKILL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    fi
    if [ -z "$SKILL_HOME" ] && command -v dscl >/dev/null 2>&1; then
      # macOS has no getent; dscl may print the value on the next line
      SKILL_HOME=$(dscl . -read "/Users/$SUDO_USER" NFSHomeDirectory 2>/dev/null \
        | sed -e 's/^NFSHomeDirectory:[[:space:]]*//' -e 's/^[[:space:]]*//' | grep -v '^$' | head -n 1)
    fi
    if [ -z "$SKILL_HOME" ]; then
      SKILL_HOME=$(eval echo "~$SUDO_USER")
      case "$SKILL_HOME" in "~"*) SKILL_HOME="" ;; esac
    fi
  else
    SKILL_HOME="${HOME:-}"
  fi
  [ -n "$SKILL_HOME" ] && [ -d "$SKILL_HOME" ]
}

install_skill_to() { # <dir under the home, e.g. .claude/skills>
  local dir="$SKILL_HOME/$1/noteflow-cli"
  local file="$dir/SKILL.md"
  # Topmost dir we are about to create, so it can be handed to the user whole.
  local first_new="" p="$dir"
  while [ "$p" != "$SKILL_HOME" ] && [ "$p" != "/" ] && [ ! -e "$p" ]; do
    first_new="$p"
    p=$(dirname "$p")
  done
  if [ -f "$file" ] && command -v cmp >/dev/null 2>&1 && cmp -s "$SKILL_TMP" "$file"; then
    echo "  up to date  → $file"
    return 0
  fi
  mkdir -p "$dir" || return 1
  cp "$SKILL_TMP" "$file" || return 1
  chmod 644 "$file" || return 1
  if [ -n "$SKILL_USER" ]; then
    local group
    group=$(id -gn "$SKILL_USER" 2>/dev/null) || group=""
    local owner="$SKILL_USER${group:+:$group}"
    if [ -n "$first_new" ]; then
      chown -R "$owner" "$first_new" || return 1
    else
      chown "$owner" "$file" || return 1
    fi
  fi
  echo "  installed   → $file"
}

install_skill() {
  resolve_skill_home || { echo "Warning: could not find your home directory — AI agent skill not installed"; return 1; }
  SKILL_TMP=$(mktemp "${TMPDIR:-/tmp}/noteflow-skill.XXXXXX") || return 1
  trap 'rm -f "$SKILL_TMP"' EXIT
  if ! download "$SKILL_URL" "$SKILL_TMP" || [ "$(head -n 1 "$SKILL_TMP")" != "---" ]; then
    echo "Warning: could not download the AI agent skill — CLI installed without it"
    return 1
  fi
  echo "AI agent skill (noteflow-cli):"
  local failed=0
  install_skill_to ".claude/skills" || failed=1
  install_skill_to ".agents/skills" || failed=1
  if [ -e "$SKILL_HOME/.codeium/windsurf" ]; then
    install_skill_to ".codeium/windsurf/skills" || failed=1
  fi
  if [ "$failed" -ne 0 ]; then
    echo "Warning: the AI agent skill could not be written to every agent dir"
    return 1
  fi
}

install_skill || true

echo "Try: noteflow help"

#!/usr/bin/env bash
# Commit docs/events.json changes (cron-safe)

set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin"
export GIT_TERMINAL_PROMPT=0

# --- locate repo root (script lives at repo root) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
cd "$REPO_ROOT"

# --- single-run lock (prevents overlapping cron runs) ---
LOCKFILE="/tmp/$(basename "$REPO_ROOT")-events.commit.lock"
exec 9>"$LOCKFILE"
flock -n 9 || { echo "Another run is in progress; exiting."; exit 0; }

# --- ensure git repo ---
git rev-parse --git-dir >/dev/null 2>&1 || {
  echo "Error: Not in a git repository at $REPO_ROOT"
  exit 1
}

EVENTS_FILE="docs/events.json"

# --- handle stale .git/index.lock safely ---
if [ -f .git/index.lock ]; then
  if ! pgrep -f "git.*$(basename "$REPO_ROOT")" >/dev/null; then
    get_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"; }
    now=$(date +%s)
    mtime=$(get_mtime .git/index.lock || echo "$now")
    age=$(( now - mtime ))
    if [ "$age" -gt 900 ]; then
      echo "Removing stale .git/index.lock (age ${age}s)"
      rm -f .git/index.lock
    else
      echo ".git/index.lock exists and is recent (${age}s); exiting to avoid corruption."
      exit 0
    fi
  else
    echo "Git process active in this repo; exiting to avoid conflict."
    exit 0
  fi
fi

# --- stay current with remote to avoid push issues (optional but helpful) ---
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "HEAD" ]; then
  git fetch --quiet origin || true
  if git rev-parse --verify "origin/$current_branch" >/dev/null 2>&1; then
    if ! git rebase --autostash "origin/$current_branch"; then
      git rebase --abort || true
      echo "Rebase failed; exiting."
      exit 1
    fi
  fi
fi

# --- change detection (both working tree and staged) ---
if git diff --quiet -- "$EVENTS_FILE" && git diff --cached --quiet -- "$EVENTS_FILE"; then
  echo "No changes detected in $EVENTS_FILE"
  exit 0
fi

# --- sanity checks ---
[ -s "$EVENTS_FILE" ] || { echo "Error: $EVENTS_FILE is empty"; exit 1; }
command -v jq >/dev/null || { echo "Error: jq is not installed"; exit 1; }
jq empty "$EVENTS_FILE" >/dev/null 2>&1 || { echo "Error: invalid JSON in $EVENTS_FILE"; exit 1; }

echo "All sanity checks passed. Proceeding with commit..."

# --- stage, commit, push ---
git add -- "$EVENTS_FILE"

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S %z')"
if git commit -m "auto: update events.json - $TIMESTAMP"; then
  git push --quiet
  echo "Successfully committed and pushed changes at $TIMESTAMP"
else
  echo "Nothing to commit (race with another run or identical content)."
fi

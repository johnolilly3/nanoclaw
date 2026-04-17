#!/usr/bin/env bash
# Sync the canonical briefing prompt from docs/prompts/homebot-morning-briefing.md
# into the scheduled_tasks row for the 6:30am morning briefing.
#
# Usage: scripts/update-briefing-prompt.sh
# Safe to re-run. Strips the leading HTML comment before applying.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$REPO_ROOT/store/messages.db"
PROMPT_FILE="$REPO_ROOT/docs/prompts/homebot-morning-briefing.md"
TASK_ID="task-1774794467414-6all7p"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# Use Python for clean multiline string handling + SQL parameterization.
python3 - "$DB" "$TASK_ID" "$PROMPT_FILE" <<'PY'
import sqlite3, sys, re

db_path, task_id, prompt_path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(prompt_path, 'r') as f:
    body = f.read()

# Strip leading HTML comment (single or multiline) before the first blank line.
body = re.sub(r'^<!--[\s\S]*?-->\s*\n', '', body, count=1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("UPDATE scheduled_tasks SET prompt = ? WHERE id = ?", (body, task_id))
if cur.rowcount != 1:
    print(f"ERROR: expected 1 row updated, got {cur.rowcount}", file=sys.stderr)
    sys.exit(2)
conn.commit()
print(f"Updated {cur.rowcount} row ({task_id}), prompt length {len(body)} chars")
PY

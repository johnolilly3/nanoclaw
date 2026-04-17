# Daily Briefings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape homebot's 6:30am morning briefing into three work-product blocks (experiment pitch, portfolio & people desk with drafts, climate learning) plus add capture hooks (links, files, briefing archive) into the Obsidian vault.

**Architecture:** Config-only change. No new TypeScript code paths. We update the scheduled-task prompt in the `scheduled_tasks` SQLite row, add capture-hook instructions to `groups/global/CLAUDE.md` (homebot) and `groups/jbot/CLAUDE.md` (jbot), seed a small set of state files in the `whatsapp_main` group folder and the Obsidian vault, and store the canonical briefing prompt in the repo at `docs/prompts/homebot-morning-briefing.md` for version control.

**Tech Stack:** Bash + SQLite (for DB updates), Markdown (for prompts, CLAUDE.md edits, state files), existing Node.js/TypeScript nanoclaw infrastructure (unchanged).

**Paths at a glance:**
- Host `~/vaults/` ↔ container `/workspace/vaults/` (mounted read-write for all groups — change landed in commit `bc9f60a`)
- Host `nanoclaw/groups/whatsapp_main/` ↔ container `/workspace/group/` (homebot's group folder; contents gitignored except CLAUDE.md)
- Host `~/Library/CloudStorage/Dropbox/John/Medical/` ↔ container `/workspace/extra/Medical/` (jbot only, existing)
- Host `nanoclaw/store/messages.db` — SQLite DB with `scheduled_tasks` table

**Spec reference:** `docs/superpowers/specs/2026-04-16-daily-briefings-redesign-design.md`

**Testing note:** This is content + config, not application code. There's no meaningful unit test for "did homebot produce a better briefing." Verification happens via: (a) static checks on the DB row after update (schedule unchanged, prompt contains required block markers), (b) manual dry-run at the end. Where a TDD-style failing test doesn't fit, we substitute a concrete "before/after" check with exact expected output.

---

### Task 1: Seed the Obsidian vault folder structure

**Files:**
- Create: `~/vaults/Briefings/.gitkeep` (empty marker)
- Create: `~/vaults/Climate/README.md`
- Create: `~/vaults/Climate/Reading Log.md`
- Create: `~/vaults/Climate/Thesis.md`
- Create: `~/vaults/To Be Filed/.gitkeep`
- Create: `~/vaults/Reading List.md`

These are in the Obsidian vault (synced across John's devices via Obsidian Sync), not in the nanoclaw git repo.

- [ ] **Step 1: Confirm vault mount is accessible**

```bash
ls ~/vaults/
```

Expected: shows at least `Medical/` and `Welcome.md` (verified 2026-04-16).

- [ ] **Step 2: Create the Briefings archive folder with a marker**

```bash
mkdir -p ~/vaults/Briefings
touch ~/vaults/Briefings/.gitkeep
```

- [ ] **Step 3: Create the Climate folder with seed files**

```bash
mkdir -p ~/vaults/Climate
```

Write `~/vaults/Climate/README.md`:

```markdown
# Climate Investing

Daily reads and slow thesis-building from homebot's morning briefing.

- `Reading Log.md` — items homebot delivered + John's reactions
- `Thesis.md` — empty until ~2 weeks of reactions accumulate; homebot drafts v1 then
```

Write `~/vaults/Climate/Reading Log.md`:

```markdown
# Climate Reading Log

Appended by homebot each morning after the climate block. Format:

---
## YYYY-MM-DD — Item title

- Source:
- Link:
- Why it matters: (1-2 sentences)
- TL;DR:
  - bullet 1
  - bullet 2
  - bullet 3
- Reaction: (filled in when John replies/reacts)
---
```

Write `~/vaults/Climate/Thesis.md`:

```markdown
# Climate Investing Thesis (in formation)

Empty until ~2 weeks of Reading Log reactions accumulate. Homebot will draft v1 at that point and ask John to confirm.
```

- [ ] **Step 4: Create the To Be Filed folder and Reading List root file**

```bash
mkdir -p ~/vaults/"To Be Filed"
touch ~/vaults/"To Be Filed"/.gitkeep
```

Write `~/vaults/Reading List.md`:

```markdown
# Reading List

Links captured when John sends URLs to homebot or jbot. Format:

---
- **YYYY-MM-DD** — [Title fetched from page, if available](URL)
  - channel: homebot | jbot
  - context: (any text John sent alongside)
---
```

- [ ] **Step 5: Verify**

```bash
ls ~/vaults/Briefings ~/vaults/Climate ~/vaults/"To Be Filed" && ls ~/vaults/Reading\ List.md
```

Expected: lists the `.gitkeep`, `README.md`, `Reading Log.md`, `Thesis.md`, and the `Reading List.md` file.

- [ ] **Step 6: Commit**

Nothing to commit — these files live in the vault, not in the nanoclaw repo. Move on.

---

### Task 2: Seed whatsapp_main workspace state files

**Files:**
- Create: `/Users/homebot/nanoclaw/groups/whatsapp_main/experiment-log.md`
- Create: `/Users/homebot/nanoclaw/groups/whatsapp_main/watchlist.md`
- Create: `/Users/homebot/nanoclaw/groups/whatsapp_main/followup-ledger.md`

These live in the group folder (gitignored by the `groups/*` rule in `.gitignore`), mounted into the container at `/workspace/group/`.

- [ ] **Step 1: Verify target directory exists**

```bash
ls /Users/homebot/nanoclaw/groups/whatsapp_main/
```

Expected: existing group contents (at least a `conversations/` or similar). If the folder doesn't exist, create it: `mkdir -p /Users/homebot/nanoclaw/groups/whatsapp_main`.

- [ ] **Step 2: Create `experiment-log.md`**

Write `/Users/homebot/nanoclaw/groups/whatsapp_main/experiment-log.md`:

```markdown
# Experiment Log

Homebot's record of daily experiment pitches + skips + John's reactions.

Format (append a block each morning):

---
## YYYY-MM-DD

**Status:** pitched | skipped

**Idea:** (2 sentences, or blank if skipped)

**Why it fits:** (1 sentence grounding to John's recent work)

**First step:** (concrete command, question, or scope)

**Sources scanned today:**
- source 1
- source 2

**Reaction:** (filled in if John replies, reacts on WhatsApp, or subsequently commits code matching the pitch)
---

(Consecutive skip count: 0)
```

- [ ] **Step 3: Create `watchlist.md`**

Write `/Users/homebot/nanoclaw/groups/whatsapp_main/watchlist.md`:

```markdown
# Watchlist

Companies homebot scans each morning for news worth knowing.

## Boards
- Duolingo (DUOL)
- Figma
- Nuro

## Advisory / involved
- Gigascale (climate/hard tech fund — also scan named portfolio cos)
- Next Ladder Ventures (also scan named portfolio cos)
- Baseten
- VotingWorks
- Daffy

## Closeness signals (accumulated by homebot over time)

_Empty on day 1. Homebot appends entries like:_

```
- Duolingo: 4 emails with Luis in last 30d, 2 board calendar events → closeness HIGH
- Nuro: 1 email with Dave in last 30d → closeness MEDIUM
```

_Closer companies get their news weighted higher in the daily selection._
```

- [ ] **Step 4: Create `followup-ledger.md`**

Write `/Users/homebot/nanoclaw/groups/whatsapp_main/followup-ledger.md`:

```markdown
# Follow-up Ledger

Open threads where John owes a reply or a promised action. Append a block when homebot surfaces a follow-up; close (mark resolved) when John acts on the draft or says skip. Auto-drop items older than 30 days.

Format:

---
## <Person name> — <thread subject or commitment summary>

- **Opened:** YYYY-MM-DD
- **Source:** gmail | granola | calendar
- **What's owed:** (reply, intro, document, calendar hold, etc.)
- **Draft:** (full draft text, ready to send)
- **Status:** open | sent | skipped | aged-out
- **Last surfaced:** YYYY-MM-DD (updated each time homebot includes it in a briefing)
---
```

- [ ] **Step 5: Verify**

```bash
ls /Users/homebot/nanoclaw/groups/whatsapp_main/*.md
```

Expected: the three new files listed, plus any pre-existing group markdowns.

- [ ] **Step 6: Commit**

No commit. These files are gitignored (`groups/*` rule). Move on.

---

### Task 3: Add capture-hook instructions to homebot's CLAUDE.md

**Files:**
- Modify: `/Users/homebot/nanoclaw/groups/global/CLAUDE.md`

This file is homebot's persistent CLAUDE.md, mounted read-only into non-main groups and read-write for main. It already describes what homebot can do. We append a new top-level section for capture hooks.

- [ ] **Step 1: Write a static check of the current file**

Before editing, record the current line count so we can confirm the edit added content:

```bash
wc -l /Users/homebot/nanoclaw/groups/global/CLAUDE.md
```

Record the number (call it `BEFORE`).

- [ ] **Step 2: Append the capture-hooks section**

Use Edit tool to add this block after the last existing section (after the "Task Scripts" section that ends with "Help the user find the minimum viable frequency"). Add at the end of the file:

```markdown

---

## Capture Hooks

When John sends a message to you, in addition to your normal reply, run these capture behaviors:

### URL capture

If the message contains one or more URLs:

1. For each URL, try to fetch the page title via `agent-browser` (or a simple web fetch). Short titles are fine; on failure, use the URL itself.
2. Append a block to `/workspace/vaults/Reading List.md` in this exact format:

```
- **YYYY-MM-DD** — [Page Title](URL)
  - channel: homebot
  - context: <any text John sent alongside the URL, up to 1 line; empty if none>
```

3. Dedupe: before appending, check if the URL already exists anywhere in `Reading List.md`. If yes, skip (no duplicate entry).
4. Acknowledge concisely in your reply: a single line like `(saved to reading list)` — this is additional to your normal response to the message, not a replacement.

### File capture

If the message includes a file attachment (image, PDF, document, etc.):

1. Save the file to `/workspace/vaults/To Be Filed/` with a filename of `YYYY-MM-DD_<original-name>`.
2. If you can confidently infer a better landing location from filename or content (e.g., a board deck → `Duolingo/board/`), include a suggestion in your reply: `(saved to To Be Filed — suggest moving to <path>?)`. Do not auto-move.
3. If you cannot infer a location, just confirm: `(saved to To Be Filed)`.

### Briefing archive (only during the morning briefing task)

When you complete the morning briefing, before you return, save the full briefing body to `/workspace/vaults/Briefings/YYYY-MM-DD.md` with light frontmatter:

```
---
date: YYYY-MM-DD
experiment_skipped: true|false
followups_count: <N>
---

<full briefing body>
```

If the file for today already exists (re-run of the task), overwrite it — we only keep one per day.

### Handling messages that are both a URL and substantive

If John sends "check out X, I think we should Y <URL>", do your normal thoughtful reply AND save the URL. The save is additive; never skip the substantive response.
```

- [ ] **Step 3: Verify the line count grew**

```bash
wc -l /Users/homebot/nanoclaw/groups/global/CLAUDE.md
```

Expected: `BEFORE + ~60` lines (exactly matches the added block). If lower, the Edit was incomplete.

- [ ] **Step 4: Verify the file still parses cleanly**

```bash
grep -c "^## " /Users/homebot/nanoclaw/groups/global/CLAUDE.md
```

Expected: count includes the original headings plus "Capture Hooks" (one new top-level `## `).

- [ ] **Step 5: Commit**

```bash
cd /Users/homebot/nanoclaw
git add groups/global/CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(homebot): add URL, file, and briefing-archive capture hooks

Instructs homebot, on every inbound message, to save URLs to the
Obsidian vault's Reading List, save attachments to To Be Filed, and
archive each morning briefing to Briefings/YYYY-MM-DD.md.

See docs/superpowers/specs/2026-04-16-daily-briefings-redesign-design.md
EOF
)"
```

---

### Task 4: Add URL capture + file capture to jbot's CLAUDE.md

**Files:**
- Modify: `/Users/homebot/nanoclaw/groups/jbot/CLAUDE.md`

Jbot already has its own minimal CLAUDE.md that points at the Medical folder. We add a URL-capture section (identical behavior to homebot, but marks `channel: jbot` in the Reading List entry) and a file-capture section (files go to `/workspace/extra/Medical/To File/`, which matches the existing host-side pattern at `~/Library/CloudStorage/Dropbox/John/Medical/To File/`).

- [ ] **Step 1: Record current line count**

```bash
wc -l /Users/homebot/nanoclaw/groups/jbot/CLAUDE.md
```

Record as `BEFORE`.

- [ ] **Step 2: Append capture-hook section to jbot's CLAUDE.md**

Append at the end of the file (after the existing "Never run npm install" warning):

```markdown

---

## Capture Hooks

When John sends a message to you, in addition to your normal reply:

### URL capture

If the message contains one or more URLs, append to `/workspace/vaults/Reading List.md`:

```
- **YYYY-MM-DD** — [Page Title](URL)
  - channel: jbot
  - context: <any text John sent alongside>
```

Dedupe by URL. Acknowledge with `(saved to reading list)` on its own line in your reply.

### File capture

If the message includes a file attachment, save it to `/workspace/extra/Medical/To File/` (the existing "To File" inbox John already uses). Preserve the original filename; if a name collision would occur, prefix with `YYYY-MM-DD_`. Acknowledge with `(saved to Medical/To File)` on its own line in your reply.

The Medical folder's own `CLAUDE.md` already documents how "To File" items get processed during your normal health workflows — do not duplicate that logic here.
```

- [ ] **Step 3: Verify**

```bash
wc -l /Users/homebot/nanoclaw/groups/jbot/CLAUDE.md
grep -c "^## " /Users/homebot/nanoclaw/groups/jbot/CLAUDE.md
```

Expected: line count grew by ~25; at least one new `## ` heading ("Capture Hooks").

- [ ] **Step 4: Verify the "To File" directory exists on the host**

```bash
ls "/Users/homebot/Library/CloudStorage/Dropbox/John/Medical/To File/" 2>&1 | head -3
```

Expected: directory listing (possibly empty, but the folder exists — verified 2026-04-16).

- [ ] **Step 5: Commit**

Note: `groups/jbot/CLAUDE.md` is normally gitignored by the `groups/*` rule — verify whether it is actually tracked before committing.

```bash
cd /Users/homebot/nanoclaw
git check-ignore -v groups/jbot/CLAUDE.md
```

- If the file is ignored (likely), SKIP the commit. The edit remains on-host-only; that is expected for jbot group state. Move on.
- If it is NOT ignored, commit:

```bash
git add groups/jbot/CLAUDE.md
git commit -m "feat(jbot): add URL and file capture hooks"
```

---

### Task 5: Write the canonical briefing prompt file

**Files:**
- Create: `/Users/homebot/nanoclaw/docs/prompts/homebot-morning-briefing.md`

This file is the source of truth for the briefing prompt. Task 6 copies its contents verbatim into the `scheduled_tasks` row. Keeping it in the repo means changes to the prompt show up in git history.

- [ ] **Step 1: Write the prompt file**

Write `/Users/homebot/nanoclaw/docs/prompts/homebot-morning-briefing.md` with this exact content:

````markdown
<!-- Canonical briefing prompt. Source of truth for scheduled_tasks row task-1774794467414-6all7p. Edits here must be synced to the DB via the update script in the plan (see docs/superpowers/plans/2026-04-16-daily-briefings-redesign.md Task 6). -->

Good morning. Build John's daily briefing using the three-block pattern below. The goal is forward motion: every block should do real work and propose action, not enumerate news. Filter every pitch, news selection, and climate pick through John's worldview as stated in `groups/global/CLAUDE.md` (builder, cautious optimist, progress-oriented, integrity/curiosity/drive; no padding, no hustle-bro content).

Target length: 400–600 words. Shorter on thin days — no filler.

**Structure (in order):**

1. **Top line** — one sentence: today's date, weather if notable, number of calendar events today.

2. **Today's calendar** — compact list. For each event: `HH:MM — Title`. If you have useful prep context (from a prior email thread, a Granola note, or the event description), add a one-line prep hint indented under the event.

3. **Today's experiment pitch** — see Block 1 below.

4. **Portfolio & people desk** — see Block 2 below.

5. **Climate read** — see Block 3 below.

6. **Closing prompt** — at most one question that invites a reply and moves something forward. Examples: "Send the Daffy draft?" / "Add solid-state batteries to the climate thesis?" / "Want me to add X to the watchlist?". If nothing needs an answer, skip the closing prompt entirely.

---

## Block 1: Today's experiment pitch

**Goal:** one concrete ~30-minute experiment John could try today, in NanoClaw / agent tooling OR in his health setup (jbot still owns the daily sleep routine, but homebot can suggest new health experiments).

**Inputs to scan:**
- What John has tried recently:
  - `git log` of `/Users/homebot/nanoclaw` (last 7 days of commits + any new branches) — from the host, via whatever agent tool is available; if you cannot reach it, note that in your reasoning and proceed with what you can see.
  - Recent homebot/jbot conversations (skim last 3 days of the conversation log in `/workspace/group/conversations/`).
  - `/workspace/group/experiment-log.md` (past pitches — avoid repeats, note which ones John engaged with).
- What others are doing (pick a subset; don't exhaust all):
  - GitHub issues & discussions on `anthropics/claude-code`, the nanoclaw repo family (`johnolilly3/nanoclaw`, `qwibitai/nanoclaw`), trending agent repos.
  - r/ClaudeAI top of week.
  - Twitter/X search for "Claude Code" OR "claw" (use agent-browser if needed).
  - Hacker News frontpage agent-related stories.
  - Anthropic blog / Claude release notes for new features worth exploiting.

**Pitch format (if you pitch):**
```
**Today's experiment:** <2 sentences stating the idea>

**Why it fits:** <1 sentence grounding to John's recent work or a visible gap>

**First step:** <a concrete command, question, or 30-minute scope John can start with today>
```

**Skip (if you don't pitch):**
```
**Today's experiment:** skipped — no strong pitch. (Day N of consecutive skips.)
```

After 3 consecutive skips, add on a new line:
```
I've come up empty 3 days running — probably looking in the wrong places. Want me to change sources?
```

**Update `/workspace/group/experiment-log.md`** with today's entry (pitched or skipped), sources scanned, and update the consecutive-skip count at the bottom.

---

## Block 2: Portfolio & people desk

**Goal:** (a) 2–3 items of overnight news worth knowing, weighted by closeness, and (b) 2–3 warm threads going cold with ready-to-send drafts.

**Watchlist:** read `/workspace/group/watchlist.md`. Treat all listed companies equally at first; apply closeness weighting from the "Closeness signals" section if populated.

**Company news gathering:**
- For each company on the watchlist, do a light pass: Google News query, their own X account / press page via agent-browser, and any SEC filings alert if applicable (Duolingo, Figma once public).
- Synthesize down to 2–3 items total worth knowing — items that *change the picture*, not every headline. Skip generic sector news.

**Output format for company news:**
```
**Notable today:**
- <Company>: <1–2 sentence summary>. <Why it matters to John's position.>
- <Company>: ...
```

**Follow-up surfacing:** check three sources for threads where John owes something:
1. `gmail-cli` — threads in the last 14 days where John was the last to owe a reply.
2. Granola transcripts (via Granola MCP) — explicit commitments John made ("I'll send you X", "let me intro Y", "I'll look into that") still open.
3. Calendar past-week meetings where a TODO likely came out of the meeting.

For each follow-up, produce a draft. Read `/workspace/group/followup-ledger.md` first to skip already-surfaced items and avoid re-proposing stale drafts.

**Output format for follow-ups:**
```
**Owed today:**
- <Person> re <subject>: <what's owed in plain English>
  Draft: "<full draft reply or action text, <120 words>"

- <Person> re <subject>: ...
```

If there are more than 3 worth surfacing, pick the 3 with the highest urgency (days aged × closeness weight). Append all surfaced items to `/workspace/group/followup-ledger.md`.

**Inbox discretion:** prioritize work-adjacent threads. Skip obvious personal/family threads — Kathy and Zack material is in zbot's lane.

---

## Block 3: Climate read

**Goal:** one substantive item from the source list (or from John's `Reading List.md` if climate-flavored links are waiting), with enough TL;DR that John can act on it without clicking.

**Source priority:**
1. First, check `/workspace/vaults/Reading List.md` for links John saved in the last 7 days that look climate-flavored. If any are unread (not yet in the Reading Log), prefer the strongest one over the source list.
2. Otherwise, pull from the rotating source list below. Rotate to keep variety; don't hit the same source two days running.

**Source list:**
- Newsletters: CTVC (Climate Tech VC), Sightline Climate, Heatmap News, Canary Media, Latitude Media
- Podcasts: Catalyst (Shayle Kann), Volts (David Roberts)
- Firm content: Lowercarbon Capital, Congruent Ventures, Prelude Ventures, Energy Impact Partners, Breakthrough Energy
- Weekly bonus slot: one substantive long-read (paper, DOE filing, sector report) when one surfaces.

**Output format:**
```
**Climate read:** <Item title>

<1–2 sentence why-it-matters>

Link: <URL>

TL;DR:
- <bullet 1>
- <bullet 2>
- <bullet 3>
```

**Append to `/workspace/vaults/Climate/Reading Log.md`** with today's entry following the format in that file.

**Thesis note:** do not auto-draft the thesis file yet. That happens after ~2 weeks of reaction data accumulates in the Reading Log. Do not touch `/workspace/vaults/Climate/Thesis.md` unless John has explicitly asked you to start drafting.

---

## After the briefing

Before you return, save the full briefing body to `/workspace/vaults/Briefings/YYYY-MM-DD.md` with frontmatter:

```
---
date: YYYY-MM-DD
experiment_skipped: true|false
followups_count: <N surfaced>
---

<full briefing body>
```

If a file for today already exists (re-run), overwrite it.
````

- [ ] **Step 2: Verify the file is present and well-formed**

```bash
wc -l /Users/homebot/nanoclaw/docs/prompts/homebot-morning-briefing.md
head -3 /Users/homebot/nanoclaw/docs/prompts/homebot-morning-briefing.md
```

Expected: line count in the 120–180 range; first line is the `<!-- Canonical briefing prompt ... -->` comment.

- [ ] **Step 3: Commit**

```bash
cd /Users/homebot/nanoclaw
git add docs/prompts/homebot-morning-briefing.md
git commit -m "$(cat <<'EOF'
feat(prompts): add canonical homebot morning briefing prompt

Source of truth for scheduled task task-1774794467414-6all7p.
Edits here must be synced to the DB.

See docs/superpowers/specs/2026-04-16-daily-briefings-redesign-design.md
EOF
)"
```

---

### Task 6: Apply new briefing prompt to the scheduled task

**Files:**
- Modify: `/Users/homebot/nanoclaw/store/messages.db` (UPDATE row in `scheduled_tasks`)
- Create (helper): `/Users/homebot/nanoclaw/scripts/update-briefing-prompt.sh`

We write a small shell script that reads the canonical prompt file and UPDATEs the `scheduled_tasks` row. This keeps the update reproducible — if the prompt file changes in the future, re-running the script re-applies it.

- [ ] **Step 1: Capture the current prompt as a backup**

```bash
sqlite3 /Users/homebot/nanoclaw/store/messages.db \
  "SELECT prompt FROM scheduled_tasks WHERE id='task-1774794467414-6all7p';" \
  > /tmp/homebot-briefing-prompt.backup-2026-04-16.txt
wc -l /tmp/homebot-briefing-prompt.backup-2026-04-16.txt
```

Expected: backup file written with the current (old) prompt. Line count > 0.

- [ ] **Step 2: Write the update helper script**

Write `/Users/homebot/nanoclaw/scripts/update-briefing-prompt.sh`:

```bash
#!/usr/bin/env bash
# Sync the canonical briefing prompt from docs/prompts/homebot-morning-briefing.md
# into the scheduled_tasks row for the 6:30am morning briefing.
#
# Usage:
#   scripts/update-briefing-prompt.sh
#
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

# Strip the leading HTML comment line(s) before the first blank line — everything
# else is the actual prompt body sent to the agent.
PROMPT_BODY=$(awk 'NR==1 && /^<!--/ { in_comment=1 } in_comment && /-->/ { in_comment=0; next } !in_comment' "$PROMPT_FILE")

# Use Python to do the UPDATE safely with full control over quoting — shell-escaping a
# multi-paragraph prompt into sqlite3 is error-prone.
python3 - "$DB" "$TASK_ID" <<PY
import sqlite3, sys
db_path, task_id = sys.argv[1], sys.argv[2]
body = """$PROMPT_BODY"""
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("UPDATE scheduled_tasks SET prompt = ? WHERE id = ?", (body, task_id))
if cur.rowcount != 1:
    print(f"ERROR: expected 1 row updated, got {cur.rowcount}", file=sys.stderr)
    sys.exit(2)
conn.commit()
print(f"Updated {cur.rowcount} row ({task_id})")
PY
```

Make it executable:

```bash
chmod +x /Users/homebot/nanoclaw/scripts/update-briefing-prompt.sh
```

- [ ] **Step 3: Run the update script**

```bash
/Users/homebot/nanoclaw/scripts/update-briefing-prompt.sh
```

Expected output: `Updated 1 row (task-1774794467414-6all7p)`.

- [ ] **Step 4: Verify the DB row looks correct**

```bash
sqlite3 /Users/homebot/nanoclaw/store/messages.db <<SQL
SELECT schedule_type, schedule_value, status, length(prompt), substr(prompt, 1, 120)
FROM scheduled_tasks WHERE id='task-1774794467414-6all7p';
SQL
```

Expected:
- `schedule_type` = `cron`
- `schedule_value` = `30 6 * * *`
- `status` = `active`
- `length(prompt)` > 3000 (the new prompt is much longer than the old)
- First 120 chars start with "Good morning. Build John's daily briefing..."

If the schedule or status changed, restore from backup immediately:

```bash
python3 -c "
import sqlite3
body = open('/tmp/homebot-briefing-prompt.backup-2026-04-16.txt').read()
c = sqlite3.connect('/Users/homebot/nanoclaw/store/messages.db')
c.execute('UPDATE scheduled_tasks SET prompt = ? WHERE id = ?', (body, 'task-1774794467414-6all7p'))
c.commit()
print('Restored')
"
```

- [ ] **Step 5: Commit the helper script**

```bash
cd /Users/homebot/nanoclaw
git add scripts/update-briefing-prompt.sh
git commit -m "$(cat <<'EOF'
chore: add script to sync briefing prompt from repo to scheduled_tasks

Re-applies docs/prompts/homebot-morning-briefing.md into the
scheduled_tasks row task-1774794467414-6all7p. Idempotent.
EOF
)"
```

(The DB itself is not committed — it's in `store/` which is gitignored.)

---

### Task 7: Manual dry-run verification

**Files:** none modified — this is verification only.

Before the first scheduled fire at 6:30am tomorrow, trigger the briefing manually and inspect the output.

- [ ] **Step 1: Find the manual-fire mechanism**

Check whether the task-scheduler exposes a way to fire a single scheduled task on demand:

```bash
grep -rn "runTask\|fireTask\|triggerTask" /Users/homebot/nanoclaw/src/ | head -10
```

Look for a CLI flag or exported function that runs a specific task id. If none exists, use the fallback in Step 2.

- [ ] **Step 2: Fallback — temporarily set `next_run` to "now"**

If there's no manual-fire API, nudge `next_run` to a time one minute in the future. The scheduler will pick it up on its next poll:

```bash
sqlite3 /Users/homebot/nanoclaw/store/messages.db \
  "UPDATE scheduled_tasks SET next_run = datetime('now', '+1 minute') WHERE id='task-1774794467414-6all7p';"
```

Wait ~2 minutes. Check the whatsapp_main WhatsApp chat — the new briefing should arrive.

- [ ] **Step 3: Verify outputs**

After the briefing arrives in WhatsApp, check the state side-effects:

```bash
# Briefing was archived
ls ~/vaults/Briefings/$(date +%Y-%m-%d).md

# Experiment log got a new entry
tail -30 /Users/homebot/nanoclaw/groups/whatsapp_main/experiment-log.md

# Followup ledger got new entries (if any were surfaced)
tail -40 /Users/homebot/nanoclaw/groups/whatsapp_main/followup-ledger.md

# Climate reading log got a new entry
tail -20 ~/vaults/Climate/"Reading Log.md"
```

Expected: each file has a new entry with today's date.

- [ ] **Step 4: If anything is off, iterate on the prompt**

If a block is weak or formatting is off:
1. Edit `docs/prompts/homebot-morning-briefing.md` with the fix.
2. Re-run `scripts/update-briefing-prompt.sh`.
3. Re-run Step 2 to re-fire the task.
4. Commit prompt improvements separately: `git commit -m "refine(prompts): <what changed>"`.

- [ ] **Step 5: Restore the normal schedule**

If you modified `next_run` in Step 2, the scheduler will recompute it on next fire — but to be safe, let the scheduler's built-in recompute handle it. No action needed unless you see a row with a stale `next_run`.

```bash
sqlite3 /Users/homebot/nanoclaw/store/messages.db \
  "SELECT id, next_run FROM scheduled_tasks WHERE id='task-1774794467414-6all7p';"
```

Expected: `next_run` is a reasonable future timestamp (tomorrow 6:30am local).

- [ ] **Step 6: No commit**

Verification only. Move on.

---

## Self-Review Checklist (plan author's pre-handoff check)

Already completed inline as the plan was written:

- ✅ Spec coverage: every block (1/2/3), every capture hook (URL/file/briefing archive), the worldview filter, skip-counter behavior, deferred items, and state files each have a task or are explicitly included in the prompt text in Task 5.
- ✅ No placeholders: every step shows the actual commands/content. The one "TBD-ish" flow is the manual-fire mechanism in Task 7 — but it's explicitly backed by a concrete fallback (update `next_run`), so an executor is never stuck.
- ✅ Type consistency: file paths used across tasks (Reading List.md, experiment-log.md, watchlist.md, followup-ledger.md, Climate/Reading Log.md, Briefings/YYYY-MM-DD.md) match the prompt text and the spec.

## Post-Implementation Follow-ups (not part of this plan)

After this plan ships and the briefing has run for ~2 weeks:
- Auto-draft the climate thesis based on accumulated Reading Log reactions
- Consider merging the ~193 upstream commits from qwibitai (use the `/update-nanoclaw` skill)
- Begin the chief-of-staff todo-capture pipeline if the desire persists

# Daily Briefings Redesign

**Date:** 2026-04-16
**Owner:** John
**Status:** Design

## Context

Homebot's current 6:30am briefing (scheduled task `task-1774794467414-6all7p` on `whatsapp_main`) is a passive news-calendar-email digest. In practice it produces heavy writeups about world affairs (often the Iran war) plus a calendar list and email summary. Google Labs already sends a competent generic-news digest, so the homebot briefing is not earning its keep.

Jbot's 6:45am sleep briefing, by contrast, is useful: it fetches overnight sleep data, synthesizes it, and asks follow-up questions. The pattern that makes it work is that it **does real work** on John's behalf and **moves something forward**. Questions and narrow scope are means to those ends, not the point.

## Goals

Make the homebot morning briefing "wildly more useful" by applying the jbot pattern — real work + forward motion — to a broader but still-bounded scope of things John actively cares about advancing:

1. **Building/experiments** — NanoClaw, agent tooling, and health-adjacent experiments John could try today
2. **Portfolio & people** — boards/advisory watchlist news + warm threads going cold
3. **Climate investing learning** — one substantive item per day, accumulating toward a thesis

Also: capture low-friction inputs (links, files, past briefings) into the Obsidian vault so the briefing can reference and compound on them over time.

## Non-Goals (Phase 1)

Deferred, welcome to grow into later:

- Full chief-of-staff todo capture from Granola/Remarkable/iMessage → Todoist/Obsidian → homebot execution
- Auto-drafted climate thesis document (triggers ~2 weeks after reactions accumulate)
- iMessage/SMS scanning for commitments or follow-ups

## Architecture

Minimal change. The primary deliverable is a rewritten prompt on the existing scheduled task, plus a small set of persistent state files in the workspace and Obsidian vault, plus three lightweight capture hooks in message handling.

- **Scheduled task:** update `task-1774794467414-6all7p` prompt; keep schedule (`30 6 * * *`), group (`whatsapp_main`), container, and channel unchanged
- **Capabilities used:** existing `gmail-cli`, `gcal`, `agent-browser`, Granola MCP, web fetch, workspace/vault write access — no new infrastructure
- **State:** persistent markdown files under `/workspace/group/` and `/workspace/vaults/`
- **Worldview filter:** briefing prompt explicitly instructs homebot to filter pitches, news selection, and climate picks through the worldview already captured in `groups/global/CLAUDE.md` (builder, cautious optimist, progress-oriented, direct-not-padded, integrity/curiosity/drive)

## Daily Message Shape

Delivered to `whatsapp_main` at 6:30am. Target length 400–600 words, readable in ~3 minutes on phone. Shorter on thin days — no padding.

1. **Top line** (1 sentence) — date, weather if notable, count of events on the calendar today
2. **Today's calendar** — compact list: time, title, one-line prep hint if homebot has context (from prior email thread, Granola, or meeting description)
3. **Experiment pitch** — Block 1 output (or a graceful skip line)
4. **Portfolio & people desk** — Block 2 output (2–3 company items + 2–3 follow-ups with drafts)
5. **Climate read** — Block 3 output (one item + 3-bullet TL;DR)
6. **Closing prompt** — at most one question that invites a reply and moves something forward

Explicitly dropped: the generic world-news / geopolitics writeup. If John wants a specific deep-dive, he'll ask.

## Block 1: Experiment Pitch

### Goal

Every morning, one concrete ~30-minute experiment John could try today — NanoClaw, agent tooling, or health-adjacent. Not a listicle; a specific pitch grounded in where John is right now.

### Inputs

- **What John has tried recently:**
  - git log of the NanoClaw repo (last ~7 days, commits + branches)
  - Recent homebot/jbot conversations (skim last ~3 days of conversation log)
  - Recent skill installs or new scheduled tasks
- **What others are doing:**
  - GitHub: issues/discussions on `anthropics/claude-code`, NanoClaw family repos, trending agent repos
  - Community signals: r/ClaudeAI top-of-week, Twitter/X search for "Claude Code" + "claw", Hacker News frontpage agent posts
  - Anthropic blog / Claude release notes for new features to exploit
- **Past pitches:** `/workspace/group/experiment-log.md` to avoid repeats and to see which past pitches John engaged with

### Work

Homebot scans the inputs, synthesizes, and selects one experiment. Pitch format:

- **Idea** (2 sentences)
- **Why it fits** (1 sentence grounding to John's recent work or a visible gap)
- **First step** (a concrete command, question, or 30-minute scope to start today)

### Skip behavior

If there's no strong pitch, homebot skips cleanly rather than forcing filler. Skip line is terse — e.g., "No strong experiment pitch today (day N)."

After **3 consecutive skips**, homebot treats this as a signal that it's looking in the wrong places and surfaces: "I've come up empty 3 days running — probably looking in the wrong places. Want me to change sources?"

### State

- `/workspace/group/experiment-log.md` — append-only log of pitches and skips
  - Per entry: date, pitch (or "skipped"), sources scanned, John's reaction if captured (reply text, WhatsApp reaction, or subsequent commits matching the pitch)

## Block 2: Portfolio & People Desk

### Goal

Two linked things: (a) what happened overnight at companies John cares about, and (b) warm threads going cold that John should re-touch today — each delivered with a ready-to-send draft so the action cost is near zero.

### Watchlist

- **Boards:** Duolingo, Figma, Nuro
- **Advisory / involved:** Gigascale (plus its climate portfolio), Next Ladder Ventures (plus its portfolio), Baseten, VotingWorks, Daffy

Watchlist lives in `/workspace/group/watchlist.md` and can be expanded (John adds names, or homebot suggests adding names based on observed email/Granola activity).

### Work

- **Company news.** For each name: Google News query + their own blog / X account / press page via `agent-browser`. Synthesize into 2–3 items worth knowing — items that change the picture, not every headline.
- **Follow-ups.** Three sources:
  1. `gmail-cli` — threads in the last ~14 days where John was the last to owe a reply
  2. Granola transcripts — explicit commitments John made ("I'll send you X", "let me intro Y") still open
  3. Calendar past-week meetings where a TODO likely came out
- **Drafts.** Each surfaced follow-up comes with a ready-to-edit draft (reply text, intro email, calendar hold). John can green-light with "send it," edit, or skip.
- **Closeness weighting.** Starts empty. Over time, homebot updates `watchlist.md` with per-company closeness signals (email frequency with founders, meetings on calendar, Granola mentions) and weights news from closer companies higher.

### Inbox discretion

No hard label exclusions. Homebot uses judgment: prioritize work-adjacent threads; skip obvious personal/family traffic (Kathy and Zack material is already in zbot's lane).

### State

- `/workspace/group/watchlist.md` — companies + notes + closeness signals
- `/workspace/group/followup-ledger.md` — open follow-ups, aged, with draft versions; items close when John acts on them or 30 days pass

## Block 3: Climate Learning

### Goal

One substantive item per day — read/watch/absorb — with enough TL;DR that John can act on it from the briefing without clicking. Over ~2 weeks, reactions accumulate into material for a thesis document.

### Sources (starting set)

- **Newsletters:** CTVC (Climate Tech VC), Sightline Climate, Heatmap News, Canary Media, Latitude Media
- **Podcasts:** Catalyst (Shayle Kann), Volts (David Roberts)
- **Firm content:** Lowercarbon Capital, Congruent Ventures, Prelude Ventures, Energy Impact Partners, Breakthrough Energy
- **Bonus slot:** one substantive long-read per week (paper, DOE filing, sector report from McKinsey/BCG/Rystad) when one surfaces

At implementation, John will name any already-subscribed sources he wants weighted higher; homebot also prefers items from John's saved-reading-list if he's been saving climate links.

### Delivery format

- Topic headline
- 1–2 sentence why-it-matters
- Link
- 3-bullet TL;DR (no click required)

### Reaction capture

From day 1, homebot records John's reactions: positive reply text ("good", "interesting"), WhatsApp emoji reactions, or forwarding the briefing. Stored in `climate-reading-log.md` with the item.

### Graduation to thesis

After ~2 weeks of reactions, homebot drafts a v1 thesis document (`climate-thesis.md`) and asks John: "is this what you're actually converging on?" After acceptance, daily climate items get reframed as evidence for/against parts of the thesis. This graduation is Phase 1.5, deferred until the reaction signal is meaningful.

### State

- `/workspace/vaults/Climate/Reading Log.md` — items delivered + reactions
- `/workspace/vaults/Climate/Thesis.md` — starts empty; drafted ~2 weeks in

## Capture Hooks

Three small handlers added to homebot and jbot message processing. These are independent of the briefing but feed state the briefing can reference.

### 1. Link capture (homebot + jbot)

Any URL in a message to homebot or jbot is appended to `/workspace/vaults/Reading List.md`, with:

- date received
- URL
- fetched title (if `agent-browser`/web-fetch can resolve it quickly)
- originating channel (homebot / jbot) and any text context from the message

Dedupe by URL. Homebot/jbot replies to the message normally; a terse "saved" or equivalent confirms the capture.

If the link looks climate-flavored, today's climate block prefers items from the reading list over the source list. If the reading list is stacking up unread (~8+ unread), the closing prompt may nudge: "8 items unread in reading list — want me to pick one for tomorrow?"

### 2. File capture — jbot

Files sent to jbot are saved to `~/Dropbox/John/Medical/To File/` (existing pattern; folder already exists). Jbot applies whatever processing the `Medical/CLAUDE.md` already documents — this spec does not change that logic.

### 3. File capture — homebot

Files sent to homebot are saved to `/workspace/vaults/To Be Filed/`. Homebot replies with a terse confirm and, if it can infer a reasonable landing location, suggests one (e.g., "looks like a Duolingo board doc — suggest `Duolingo/board/`?"). Homebot does not auto-move.

### 4. Briefing archive

Each morning's homebot briefing is saved to `/workspace/vaults/Briefings/YYYY-MM-DD.md`. Light frontmatter:

```yaml
---
date: 2026-04-16
experiment_skipped: false
followups_count: 3
---
```

Full briefing body follows. No cross-linking in v1 — Obsidian full-text search handles "find that thing from two weeks ago."

Jbot's sleep briefings are not archived in v1.

## State Files Summary

| Path | Purpose |
|------|---------|
| `/workspace/group/experiment-log.md` | Block 1: pitches, skips, reactions |
| `/workspace/group/watchlist.md` | Block 2: companies + closeness signals |
| `/workspace/group/followup-ledger.md` | Block 2: open threads + drafts, aged |
| `/workspace/vaults/Climate/Reading Log.md` | Block 3: items + reactions |
| `/workspace/vaults/Climate/Thesis.md` | Block 3: drafted ~2 weeks in (empty in Phase 1) |
| `/workspace/vaults/Reading List.md` | Link capture (homebot + jbot) |
| `/workspace/vaults/To Be Filed/` | File capture (homebot) |
| `~/Dropbox/John/Medical/To File/` | File capture (jbot) — existing |
| `/workspace/vaults/Briefings/YYYY-MM-DD.md` | Archived briefings |

## Testing / Rollout

1. Update the prompt on `task-1774794467414-6all7p` and deploy the state-file initialization (empty files, seeded watchlist).
2. Implement capture hooks in the message handlers.
3. Observe 3–5 mornings. Iterate on the prompt and source list based on which blocks land and which feel weak.
4. After ~2 weeks, evaluate reaction signal and decide whether to trigger the thesis-doc graduation.

## Open Items for Implementation Planning

- Confirm with John any already-subscribed climate sources he wants weighted heavily
- Confirm whether the "closeness weighting" should also apply to people (not just companies) — e.g., certain founders whose email should always surface
- Decide concrete thresholds for aged follow-ups (e.g., surface after 3 days of silence, drop after 30)
- Decide how homebot verifies a follow-up is "closed" (John replied to the draft, John said "send it," or John said "skip")
- Decide whether the experiment pitch should ever propose a *jbot* experiment (and if so, how jbot gets notified)

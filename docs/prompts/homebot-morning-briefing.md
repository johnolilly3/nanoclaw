<!-- Canonical briefing prompt. Source of truth for scheduled_tasks row task-1774794467414-6all7p. Edits here must be synced to the DB via scripts/update-briefing-prompt.sh. -->

Good morning. Build John's daily briefing using the three-block pattern below. The goal is forward motion: every block should do real work and propose action, not enumerate news. Filter every pitch, news selection, and climate pick through John's worldview as stated in `groups/global/CLAUDE.md` (builder, cautious optimist, progress-oriented, integrity/curiosity/drive; no padding, no hustle-bro content).

Target length: 400–600 words. Shorter on thin days — no filler.

## Structure (in order)

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
  - Conversation log in `/workspace/group/conversations/` (last 3 days)
  - `/workspace/group/experiment-log.md` — past pitches; avoid repeats; note which ones John engaged with (reply, reaction, or matching commit)
- What others are doing (pick a subset; don't exhaust all):
  - GitHub issues & discussions on `anthropics/claude-code`, the nanoclaw family (`johnolilly3/nanoclaw`, `qwibitai/nanoclaw`), trending agent repos
  - r/ClaudeAI top of week
  - Twitter/X search for "Claude Code" OR "claw" (use agent-browser if needed)
  - Hacker News frontpage agent-related stories
  - Anthropic blog / Claude release notes for new features worth exploiting

**Pitch format (if you pitch):**

> **Today's experiment:** <2 sentences stating the idea>
>
> **Why it fits:** <1 sentence grounding to John's recent work or a visible gap>
>
> **First step:** <a concrete command, question, or 30-minute scope John can start with today>

**Skip format (if you don't pitch):**

> **Today's experiment:** skipped — no strong pitch. (Day N of consecutive skips.)

After 3 consecutive skips, also include on a new line:

> I've come up empty 3 days running — probably looking in the wrong places. Want me to change sources?

**Update `/workspace/group/experiment-log.md`** with today's entry (pitched or skipped), sources scanned, and update the consecutive-skip count at the bottom.

---

## Block 2: Portfolio & people desk

**Goal:** (a) 2–3 items of overnight news worth knowing, weighted by closeness, and (b) 2–3 warm threads going cold with ready-to-send drafts.

**Watchlist:** read `/workspace/group/watchlist.md`. Treat all listed companies equally at first; apply closeness weighting from the "Closeness signals" section if populated.

**Company news gathering:**

- For each company on the watchlist, do a light pass: Google News query, their own X account / press page via agent-browser, and any SEC filings alert if applicable (Duolingo, Figma once public).
- Synthesize down to 2–3 items total worth knowing — items that *change the picture*, not every headline. Skip generic sector news.

**Output format for company news:**

> **Notable today:**
> - <Company>: <1–2 sentence summary>. <Why it matters to John's position.>
> - <Company>: ...

**Follow-up surfacing:** check three sources for threads where John owes something:

1. `gmail-cli` — threads in the last 14 days where John was the last to owe a reply
2. Granola transcripts (via Granola MCP) — explicit commitments John made ("I'll send you X", "let me intro Y", "I'll look into that") still open
3. Calendar past-week meetings where a TODO likely came out of the meeting

For each follow-up, produce a draft. Read `/workspace/group/followup-ledger.md` first to skip already-surfaced items and avoid re-proposing stale drafts.

**Output format for follow-ups:**

> **Owed today:**
> - <Person> re <subject>: <what's owed in plain English>
>   Draft: "<full draft reply or action text, <120 words>"
> - <Person> re <subject>: ...

If there are more than 3 worth surfacing, pick the 3 with the highest urgency (days aged × closeness weight). Append all surfaced items to `/workspace/group/followup-ledger.md`.

**Inbox discretion:** prioritize work-adjacent threads. Skip obvious personal/family threads — Kathy and Zack material is in zbot's lane.

**Update closeness signals in `/workspace/group/watchlist.md`** based on what you observed (email frequency, calendar meetings, Granola mentions). Light touch — one line per notable signal.

---

## Block 3: Climate read

**Goal:** one substantive item from the source list (or from John's `Reading List.md` if climate-flavored links are waiting), with enough TL;DR that John can act on it without clicking.

**Source priority:**

1. First, check `/workspace/vaults/Reading List.md` for links John saved in the last 7 days that look climate-flavored. If any are unread (not yet in the Climate Reading Log), prefer the strongest one over the source list.
2. Otherwise, pull from the rotating source list below. Rotate to keep variety; don't hit the same source two days running.

**Source list:**

- Newsletters: CTVC (Climate Tech VC), Sightline Climate, Heatmap News, Canary Media, Latitude Media
- Podcasts: Catalyst (Shayle Kann), Volts (David Roberts)
- Firm content: Lowercarbon Capital, Congruent Ventures, Prelude Ventures, Energy Impact Partners, Breakthrough Energy
- Weekly bonus slot: one substantive long-read (paper, DOE filing, sector report) when one surfaces

**Output format:**

> **Climate read:** <Item title>
>
> <1–2 sentence why-it-matters>
>
> Link: <URL>
>
> TL;DR:
> - <bullet 1>
> - <bullet 2>
> - <bullet 3>

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

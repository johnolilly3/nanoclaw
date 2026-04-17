# Gather → Store → Dispatch Architecture

**Date:** 2026-04-17
**Owner:** John
**Status:** Design

## Context

Today every scheduled task in NanoClaw does gather + reason + package + send in a single agent run. The morning briefing task is the most acute example: one run scans gmail, gcal, Granola, the watchlist, GitHub, HN, climate newsletters, then synthesizes three blocks, then writes to the vault, then sends to WhatsApp. A single long run is:

- **Fragile** — the 2026-04-17 AM briefing first died mid-run with `Container exited with code 137` (OOM), succeeded only on retry ~12 min later. One failure in one source kills the whole send.
- **Inflexible** — information gathered at 6:05 AM is already stale relative to what passed through overnight feeds; a content-worthy story at 3 AM waits until 6:05 to surface.
- **Time-coupled** — delivery cadence is locked to a cron. There's no way to trigger a send on *what the world did* (Figma S-1 dropped, Nuro announced, a thread crossed N days aged) rather than *what time it is*.

## Goal

A general pattern that decouples three concerns — **gathering information**, **storing it**, and **deciding when/how to send a message about it** — so we can:

1. Gather continuously across the day (news, filings, transcripts, emails, GitHub, climate feeds, etc.), cheaply.
2. Send messages on mixed triggers: time-of-day, content-match (new item crossing a threshold), user command, external webhook.
3. Reuse the same primitives for a dozen future use cases without re-architecting each one.

## Non-goals (Phase 1)

- Generic workflow engine. Four trigger types, not arbitrary DAGs.
- Replacing every existing scheduled task at once. Coexists with current `scheduled_tasks` during migration.
- Cross-group delivery fan-out. Each dispatcher targets one chat_jid.
- Real-time streaming. The evaluator tick (currently ~60s) is the minimum latency.

## Primitives

### 1. Gatherer

A scheduled job whose only job is to write items to the store. Never sends a message.

- Runs on a cron (e.g. `*/30 * * * *` for news scans, `0 */2 * * *` for gmail owed-reply scan).
- Two flavors:
  - **Script gatherer** — a bash/python/node script that hits an API and upserts rows. No agent, no LLM. Cheap and fast.
  - **Agent gatherer** — a short agent run for judgment-required gathers (e.g. "which Granola commitments from the last 24h are still open?"). More expensive; use only when a script can't answer.
- Must be idempotent. Re-running produces the same rows (dedupe by `source_key`).
- Writes structured items, not prose. Prose lives in the vault if needed, via `body_ref`.

### 2. Item store

A single SQLite table holding everything any gatherer has collected.

```sql
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,                    -- uuid
  source TEXT NOT NULL,                   -- 'news:figma', 'gmail:owed_reply', 'granola:commitment'
  source_key TEXT NOT NULL,               -- stable id from source, for dedupe
  group_folder TEXT NOT NULL,             -- scopes to whatsapp_main, jbot, zbot, etc.
  title TEXT NOT NULL,                    -- one-line headline or summary
  body TEXT,                              -- short prose; long content → body_ref
  body_ref TEXT,                          -- optional vault path
  url TEXT,
  tags TEXT NOT NULL,                     -- JSON array: ['figma', 'board', 'ipo']
  urgency INTEGER NOT NULL DEFAULT 1,     -- 0=info, 1=normal, 2=notable, 3=breaking
  gathered_at TEXT NOT NULL,              -- iso timestamp
  expires_at TEXT,                        -- iso; null = no expiry
  delivered_to TEXT NOT NULL DEFAULT '[]', -- JSON array of dispatcher ids that fired on this
  metadata TEXT                           -- JSON blob for source-specific fields
);

CREATE UNIQUE INDEX idx_items_dedupe ON knowledge_items(source, source_key);
CREATE INDEX idx_items_gathered ON knowledge_items(gathered_at);
CREATE INDEX idx_items_urgency ON knowledge_items(urgency, gathered_at);
```

Retention: a small cron job deletes rows past `expires_at` or older than 30 days if `expires_at` is null and `tags` doesn't include `keep`.

### 3. Dispatcher = trigger + packager

A dispatcher binds a trigger to a packager and a destination chat.

```sql
CREATE TABLE dispatchers (
  id TEXT PRIMARY KEY,
  group_folder TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  trigger_type TEXT NOT NULL,             -- 'time' | 'content' | 'threshold' | 'command'
  trigger_config TEXT NOT NULL,           -- JSON, shape depends on trigger_type
  packager TEXT NOT NULL,                 -- name of a packager (script or agent prompt id)
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'paused'
  last_fired_at TEXT,
  last_evaluated_at TEXT,
  created_at TEXT NOT NULL
);
```

**Trigger types** — uniform interface: given the current time, the dispatcher row, and a read-only view of `knowledge_items`, return `fires?: bool` and a `context` object passed to the packager.

| Type | `trigger_config` | Fires when |
|------|------------------|------------|
| `time` | `{ cron: "5 6 * * *" }` | cron says so |
| `content` | `{ query: { tags_any: [...], tags_all: [...], urgency_min: N, sources: [...] } }` | any item matching the query has `gathered_at > last_fired_at` and dispatcher id not in its `delivered_to` |
| `threshold` | `{ query: {...}, min_count: N, window_hours: H }` | ≥N matching items in last H hours and not yet fired |
| `command` | `{ keyword: "/brief" }` | user sent keyword in target chat since last fire (evaluated by IPC, not scheduler) |

**Packager** — small and focused. Gets:

- The dispatcher row (including trigger context — which items triggered it).
- A query API against `knowledge_items`.

Produces a message (string). On success, the dispatcher framework:

1. Sends the message via existing `sendMessage(chat_jid, text)`.
2. Updates `delivered_to` on every item the packager referenced (packager returns a list of item ids it used).
3. Sets `last_fired_at = now`.

Packagers can be:

- **Template packagers** — Python/node script that renders from a template. Fast, deterministic, no LLM.
- **Agent packagers** — short agent run with the triggering items pre-loaded. For anything that needs synthesis (the morning briefing falls here).

Packagers should be an order of magnitude shorter than today's monolithic briefing prompt, because gathering + filtering already happened upstream.

### Evaluator loop

Adds one new loop alongside `startSchedulerLoop` in `src/task-scheduler.ts`:

```
every SCHEDULER_POLL_INTERVAL:
  for each active dispatcher:
    fires, context = evaluate_trigger(dispatcher, now, store)
    if fires:
      enqueue_packager(dispatcher, context)
      update last_fired_at, last_evaluated_at
```

`command` triggers are evaluated inline on IPC (not in the loop), so the keyword → send latency is the same as a normal chat reply.

## Use cases this unlocks

1. **Morning briefing** (`time` trigger, agent packager). Today's monolithic task becomes: gatherers run overnight, packager at 6:05 AM reads last-24h items by tag and renders the three-block format. Expected packager runtime: <90s vs. today's 8–10 min.

2. **Breaking news push** (`content` trigger, template packager). `{tags_any: ['figma', 'duolingo', 'nuro'], urgency_min: 3}` → one-item WhatsApp message the moment a gatherer flags a breaking story. Zero wait.

3. **Weekly portfolio roll-up** (`time` + `threshold`, agent packager). Monday 9 AM, but skip if <5 new items in the last 7 days — no filler Mondays.

4. **On-demand `/brief`** (`command` trigger). Same packager as morning briefing, fired by keyword.

5. **Upstream-lag reminder** (`threshold` on a `git:upstream_lag` gatherer). Replaces the current ad-hoc cron task with the same primitives.

6. **Granola commitment follow-ups** (`content` trigger). Agent gatherer scans Granola transcripts every 2h for "I'll send you X." Packager fires when ≥1 commitment is 3+ days old without a gmail follow-up.

## Migration path

Five phases, each independently valuable and shippable:

### Phase 1 — Item store, no behavior change

- Add `knowledge_items` table + a thin writer API (`writeItem`, `queryItems`) in a new `src/knowledge-store.ts`.
- Existing briefing agent keeps its monolithic prompt but is instructed (in-prompt) to persist what it finds as items as a side effect. No reads yet.
- Retention cron shipped.

### Phase 2 — Extract one gatherer

- Move the watchlist news scan out of the briefing prompt into a standalone agent gatherer scheduled 3×/day (7 AM, 1 PM, 10 PM local).
- Briefing prompt is shortened: instead of "scan Google News for each watchlist company," it reads items from the store.

### Phase 3 — Introduce dispatchers and first content trigger

- Add `dispatchers` table + evaluator loop.
- Split the morning briefing: `dispatcher(time: 5 6 * * *) → packager('morning_brief')` reads from store. The prompt shrinks from ~2500 words to ~600 words of pure synthesis.
- Add one content-trigger dispatcher (breaking news push) as proof.

### Phase 4 — Migrate remaining gatherers

- Calendar, gmail (owed-reply scan), climate sources, Granola commitments each become their own gatherer.
- Morning packager is now almost entirely a template + short LLM pass.

### Phase 5 — Retire monolithic tasks

- Any `scheduled_tasks` row that was a gather+package+send monolith is replaced by (gatherer + dispatcher) or deleted if the work is fully subsumed.
- `scheduled_tasks` continues to exist for genuinely one-off or non-messaging work.

## Open questions

1. **Notability oracle.** Content triggers need `urgency` on each item. I'd start with rules in each gatherer (source, keyword, author) and tag an item `urgency=3` only when the gatherer is confident. LLM-scored-on-write is expensive at volume; add it only where rules underperform.

2. **Idempotency on retry.** If a packager run crashes after `sendMessage` but before `last_fired_at` updates, we'd re-send on the next tick. Needs a message-level idempotency key (e.g., `dispatcher_id + fire_timestamp` hashed into the send).

3. **Multi-group scoping.** `group_folder` is on both items and dispatchers. A homebot gatherer never feeds a jbot dispatcher. Correct default; no cross-group opt-in yet.

4. **Where long-form lives.** Vault files, referenced by `body_ref`. The store holds headlines + tags; bodies that are >1KB go to the vault. Avoids bloating the SQLite DB.

5. **Observability.** Reuse `task_run_logs` shape for dispatcher fires and gatherer runs. One unified log table is fine for now.

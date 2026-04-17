# Gather → Store → Dispatch, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `knowledge_items` store and a writer path, with the existing morning briefing dual-writing items as a side effect. No behavior change on the send side. Reads happen in Phase 2.

**Spec reference:** `docs/superpowers/specs/2026-04-17-gather-store-dispatch-design.md`

**Non-goals:** Dispatchers, evaluator loop, content triggers, store-backed packagers, breaking-news push. All Phase 3+.

**Acceptance criteria for Phase 1:**

1. `knowledge_items` table exists in `store/messages.db` with the schema in the spec.
2. `src/knowledge-store.ts` exports `writeItem`, `queryItems`, `markDelivered` with passing unit tests.
3. Container exposes an MCP tool `store_item` that writes to IPC; host IPC watcher picks up `type: 'store_item'` files and persists to the DB.
4. After one morning briefing run, ≥3 items appear in `knowledge_items` from the briefing's gather work.
5. A retention cron deletes rows past `expires_at` (or older than 30 days without `keep` tag). Verified by inserting a stale row and watching it get purged.
6. No regression in briefing output shape — same length window, same blocks, same sends.

---

### Task 1: Add `knowledge_items` schema migration

**Files:**
- Modify: `src/db.ts`
- Add: `src/db-migration.test.ts` case

- [ ] **Step 1: Write a failing migration test**

In `src/db-migration.test.ts`, add a test: open a temp DB, run migrations, assert that `knowledge_items` table exists with columns `id, source, source_key, group_folder, title, body, body_ref, url, tags, urgency, gathered_at, expires_at, delivered_to, metadata` and the three indexes from the spec.

- [ ] **Step 2: Add the migration**

In `src/db.ts`, add a migration step that creates the table + indexes exactly as in the spec. Follow the existing migration pattern (look at how the `script` and `context_mode` columns on `scheduled_tasks` were added). Migration must be idempotent.

- [ ] **Step 3: Run test, confirm green**

```bash
npm test -- db-migration
```

---

### Task 2: Writer/query API in `src/knowledge-store.ts`

**Files:**
- Create: `src/knowledge-store.ts`
- Create: `src/knowledge-store.test.ts`

- [ ] **Step 1: Failing tests for `writeItem`**

Cover: insert, upsert-on-duplicate `(source, source_key)` (second call updates, doesn't error or double-insert), tags/metadata roundtrip through JSON.

- [ ] **Step 2: Implement `writeItem`**

Shape:
```ts
writeItem({
  source: string,
  source_key: string,
  group_folder: string,
  title: string,
  body?: string,
  body_ref?: string,
  url?: string,
  tags?: string[],
  urgency?: 0 | 1 | 2 | 3,  // default 1
  expires_at?: string | null,
  metadata?: Record<string, unknown>,
}): { id: string, inserted: boolean }
```

`INSERT ... ON CONFLICT(source, source_key) DO UPDATE ...` so re-runs of a gatherer are safe.

- [ ] **Step 3: Failing tests for `queryItems`**

Cover filters: `tags_any`, `tags_all`, `urgency_min`, `sources`, `group_folder` (required), `gathered_since`, `exclude_delivered_to` (dispatcher id not in `delivered_to`). Order by `gathered_at DESC`. Limit.

- [ ] **Step 4: Implement `queryItems`**

- [ ] **Step 5: Failing test for `markDelivered`**

Takes `(item_ids: string[], dispatcher_id: string)`. Appends `dispatcher_id` to the JSON array without duplicates.

- [ ] **Step 6: Implement `markDelivered`**

- [ ] **Step 7: Full test run green**

```bash
npm test -- knowledge-store
```

---

### Task 3: IPC plumbing for `store_item`

**Files:**
- Modify: `container/agent-runner/src/ipc-mcp-stdio.ts` — add `store_item` MCP tool
- Modify: `src/ipc.ts` — handle `type: 'store_item'` IPC files
- Add: `src/ipc-store-item.test.ts`

- [ ] **Step 1: Add `store_item` MCP tool in the container**

Mirror the `send_message` pattern. Tool accepts the `writeItem` shape above. Writes an IPC file to a new `STORE_DIR = path.join(IPC_DIR, 'store')`. The agent should treat this as fire-and-forget — no return value beyond "stored."

Description copy for the tool:
> Persist a structured item to the knowledge store — a headline, a filing, a follow-up, a climate read, anything future briefings or dispatchers might want to query. Fire-and-forget. Dedupes on (source, source_key), so re-running a gatherer is safe. Never send messages with this — use `send_message` for that.

- [ ] **Step 2: Failing host-side test**

In `src/ipc-store-item.test.ts`, drop a valid `store_item` JSON into a temp IPC dir, tick the watcher, assert the row appears via `queryItems`. Include a malformed-file case (missing required field → logged and skipped, no crash).

- [ ] **Step 3: Wire the handler in `src/ipc.ts`**

Add a `STORE_DIR` watcher next to the existing `MESSAGES_DIR` watcher. On each JSON file:
- Validate shape via zod (or existing validation helper).
- Call `writeItem` from `knowledge-store.ts` with `group_folder` resolved from the container's group (same way `type: 'message'` resolves it).
- On success, delete the IPC file (same pattern as messages).
- On failure, log + move to a `store.rejected/` dir.

- [ ] **Step 4: Integration test**

Run a minimal container agent (or mock the container) that calls the `store_item` MCP tool once; assert the item lands in the DB.

---

### Task 4: Retention cron

**Files:**
- Add: `scripts/knowledge-store-retention.ts` (or `.js`)
- Modify: scheduled_tasks row via a new migration/seed

- [ ] **Step 1: Write the retention script**

Deletes rows where:
- `expires_at IS NOT NULL AND expires_at < now`, OR
- `expires_at IS NULL AND gathered_at < now - 30 days AND tags NOT LIKE '%"keep"%'`

Prints JSON summary: `{ deleted_count, oldest_remaining }`.

- [ ] **Step 2: Schedule it**

Add a `scheduled_tasks` row with `schedule_type='cron'`, `schedule_value='0 3 * * *'` (3 AM local), `group_folder='whatsapp_main'`, no agent wake-up (use `script` only so it runs headless — see `Task Scripts` in `groups/global/CLAUDE.md`). Script returns `{ wakeAgent: false, data: {...} }` — agent never wakes.

- [ ] **Step 3: Verify**

Insert a row with `gathered_at = '2026-01-01'` and no `keep` tag. Wait for one tick (or manually invoke the script). Confirm the row is gone and the fresh rows remain.

---

### Task 5: Teach the morning briefing to dual-write

**Files:**
- Modify: `docs/prompts/homebot-morning-briefing.md`
- Run: `scripts/update-briefing-prompt.sh`

- [ ] **Step 1: Add a "Persist what you find" section to the prompt**

One block, instructing the agent to call `mcp__nanoclaw__store_item` for each significant item it surfaces (watchlist news, follow-up draft, climate read, experiment pitch), with tag conventions.

Tag conventions for Phase 1:
- Watchlist news: `source='news:<company>'`, tags `['watchlist', '<company>', topic tags]`, urgency `1`–`3` per the spec's rules.
- Follow-ups: `source='gmail:owed_reply' | 'granola:commitment' | 'calendar:owed'`, tags `['followup', <person slug>]`, urgency `1`.
- Climate: `source='climate:<source_slug>'`, tags `['climate', <topic tags>]`, urgency `1`.
- Experiment pitch: `source='experiment:pitch'`, tags `['experiment', <domain>]`, urgency `1`, `expires_at = now + 7 days`.
- Dedupe is the agent's responsibility via `source_key` — for news, the canonical URL; for follow-ups, the gmail thread id or granola meeting id; for climate, the canonical URL.

This is additive — the agent still produces the full three-block briefing and sends it. `store_item` calls happen alongside.

- [ ] **Step 2: Sync the prompt to the DB**

```bash
./scripts/update-briefing-prompt.sh
```

Verify the DB row length grew as expected.

- [ ] **Step 3: Dry-run one briefing**

Manually fire the morning briefing task (or wait for the next 6:05 AM run). After:
- `sqlite3 store/messages.db "SELECT source, title FROM knowledge_items ORDER BY gathered_at DESC LIMIT 20;"` — confirm ≥3 items across at least 2 sources.
- Confirm the WhatsApp briefing still arrived in the expected shape.
- Confirm `/workspace/vaults/Briefings/YYYY-MM-DD.md` was archived as before.

---

### Task 6: Update memory + docs

**Files:**
- Modify: `/Users/homebot/.claude/projects/-Users-homebot-nanoclaw/memory/project_daily_briefings.md` — note Phase 1 landed, briefing now dual-writes items.
- Add: `/Users/homebot/.claude/projects/-Users-homebot-nanoclaw/memory/project_knowledge_store.md` — brief pointer to the spec + phase plan + current phase status.
- Update `MEMORY.md` index with the new file.

- [ ] **Step 1: Update memory files after the phase is green**

- [ ] **Step 2: Commit with a message that links the spec**

No PR yet — see GitHub sequencing note below.

---

## Before starting: GitHub housekeeping

Per John's call, sort out GitHub before we land significant new code. Proposed sequence (separate short plan; not part of Phase 1 tasks):

1. Verify this morning's 9 AM push reminder fired and local is fully pushed to `origin/main`.
2. Set up auto-push (hourly launchd job running `git push origin main` in `~/nanoclaw`) — run from launchd context where macOS keychain works, unlike the agent context that hit `-25308`. Test end-to-end before trusting it.
3. Run `/update-nanoclaw` to review the ~193-commit gap vs `qwibitai/nanoclaw` and cherry-pick whatever should come in before we layer Phase 1 changes on top of drift.
4. Confirm the weekly upstream-lag reminder task is correctly scheduled (`0 9 * * 1` → Monday 9 AM PT) and will actually ping.

Only after those four land do we start Task 1. This avoids building on a branch that's hard to recover if the laptop dies, and avoids stacking Phase 1 diffs on top of upstream churn that'd force an ugly merge later.

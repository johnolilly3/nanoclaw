# Shadow Copy Mount

**Date:** 2026-04-04  
**Status:** Approved

## Problem

Containers mounting Dropbox folders via virtiofs hit file locking deadlocks (EDEADLK). `cp` fails because it uses `lseek`; SQLite WAL mode fails; any write-heavy workload on the mount is unreliable. This affects jbot (2GB health.db + config.json with token refresh) but not zbot (small DB, mostly reads).

## Solution

Add an opt-in `shadowCopy` flag to `AdditionalMount`. When enabled, container-runner copies the mount contents to a local staging directory before spawning the container, mounts the staging dir instead of the original path, syncs changes back periodically, and does a final sync on container exit.

## Data Flow

```
Dropbox (source of truth)
  ↓ full copy at container start (host-side, ~3s for 2GB)
data/shadow/{group}/{mountBasename}/
  ↓ mounted into container as /workspace/extra/{name}
Container reads/writes freely (no locking issues)
  ↓ sync-back every 5min (host-side, mtime check, changed files only)
  ↓ final sync-back on container exit
Dropbox (updated)
```

## Config Change

Add `shadowCopy?: boolean` to `AdditionalMount` in `types.ts`:

```ts
export interface AdditionalMount {
  hostPath: string;
  containerPath?: string;
  readonly?: boolean;
  shadowCopy?: boolean; // Copy to local staging dir, sync back periodically
}
```

Group config in DB becomes:
```json
{"additionalMounts":[{"hostPath":"~/Dropbox/John/Medical","readonly":false,"shadowCopy":true}]}
```

## Files Changed

1. **`src/types.ts`** — Add `shadowCopy?: boolean` to `AdditionalMount`
2. **`src/container-runner.ts`** — Shadow copy logic:
   - In `buildVolumeMounts`: when `shadowCopy` is true, copy source to `data/shadow/{group}/{basename}/` and substitute the mount hostPath to the staging dir
   - In `runContainerAgent`: after spawn, start a 5-min interval that checks file mtimes in the staging dir vs last-known mtimes, copies changed files back to the original Dropbox path
   - On container close: final sync-back, clear the interval, optionally clean up staging dir (or leave it for faster next startup)
3. **DB update** — Set `shadowCopy: true` on jbot's Medical mount
4. **`groups/jbot/CLAUDE.md`** — Remove virtiofs workaround section and `dd bs=1` instructions

## Sync-Back Details

- **Interval:** 5 minutes
- **Trigger:** mtime comparison — only copy files whose mtime in the staging dir is newer than the last sync
- **Mechanism:** `fs.cpSync` on the host side (no virtiofs involvement)
- **Scope:** Walk the staging dir, compare mtimes, copy changed files back. For large files like health.db, copy the whole file (not incremental). 3s for 2GB is acceptable.
- **On exit:** Final sync-back before resolving the container promise

## Edge Cases

- **Container crash:** Data loss window is at most 5 minutes (last sync interval). Acceptable.
- **Concurrent host edits:** Sync-back overwrites Dropbox version. This is fine — user doesn't edit Medical files while the agent is running.
- **First startup:** Full copy takes ~3s for 2GB. Subsequent starts reuse the staging dir if it exists (with a fresh copy from Dropbox to pick up any external changes).
- **Staging dir reuse:** Always do a fresh copy-in from Dropbox at startup to pick up changes made outside the container (e.g., from another machine via Dropbox sync).

## Rollback

Set `shadowCopy: false` (or remove the field) in the group's container config. Container-runner falls back to direct mount. Shadow copy code is inert when the flag is off. Staging dir can be cleaned up manually or left in place.

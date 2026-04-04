# Shadow Copy Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate virtiofs file locking deadlocks by transparently copying mount contents to a local staging dir before container launch and syncing changes back periodically.

**Architecture:** When an `AdditionalMount` has `shadowCopy: true`, `buildVolumeMounts` copies the source to `data/shadow/{group}/{basename}/` and substitutes the mount path. A host-side `setInterval` (5 min) compares mtimes and copies changed files back. Final sync runs on container close.

**Tech Stack:** Node.js fs, vitest

---

### File Structure

| File | Role |
|------|------|
| `src/types.ts` | Add `shadowCopy?: boolean` to `AdditionalMount` |
| `src/shadow-copy.ts` | New — all shadow copy logic: `prepareShadowCopy`, `syncBack`, `startSyncLoop`, `stopSyncLoop` |
| `src/shadow-copy.test.ts` | New — tests for shadow-copy module |
| `src/container-runner.ts` | Wire shadow copy into mount building and container lifecycle |
| `src/container-runner.test.ts` | Add test for shadow copy mount substitution |
| `groups/jbot/CLAUDE.md` | Remove virtiofs workaround section |

---

### Task 1: Add `shadowCopy` to `AdditionalMount` type

**Files:**
- Modify: `src/types.ts:1-5`

- [ ] **Step 1: Add the field**

In `src/types.ts`, add `shadowCopy` to `AdditionalMount`:

```ts
export interface AdditionalMount {
  hostPath: string;
  containerPath?: string;
  readonly?: boolean;
  shadowCopy?: boolean; // Copy to local staging dir, sync back periodically
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shadowCopy flag to AdditionalMount type"
```

---

### Task 2: Create `shadow-copy.ts` with `prepareShadowCopy`

**Files:**
- Create: `src/shadow-copy.ts`
- Create: `src/shadow-copy.test.ts`

- [ ] **Step 1: Write the failing test for `prepareShadowCopy`**

Create `src/shadow-copy.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { prepareShadowCopy } from './shadow-copy.js';

describe('prepareShadowCopy', () => {
  let tmpSource: string;
  let tmpStaging: string;

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-test-'));
    tmpSource = path.join(base, 'source');
    tmpStaging = path.join(base, 'staging');
    fs.mkdirSync(tmpSource, { recursive: true });
  });

  afterEach(() => {
    // Clean up is best-effort
    try {
      fs.rmSync(path.dirname(tmpSource), { recursive: true, force: true });
    } catch {}
  });

  it('copies source files to staging directory', () => {
    fs.writeFileSync(path.join(tmpSource, 'test.txt'), 'hello');
    fs.mkdirSync(path.join(tmpSource, 'subdir'));
    fs.writeFileSync(path.join(tmpSource, 'subdir', 'nested.txt'), 'world');

    const stagingPath = prepareShadowCopy(tmpSource, tmpStaging);

    expect(stagingPath).toBe(tmpStaging);
    expect(fs.readFileSync(path.join(tmpStaging, 'test.txt'), 'utf-8')).toBe('hello');
    expect(fs.readFileSync(path.join(tmpStaging, 'subdir', 'nested.txt'), 'utf-8')).toBe('world');
  });

  it('overwrites existing staging dir with fresh copy', () => {
    fs.mkdirSync(tmpStaging, { recursive: true });
    fs.writeFileSync(path.join(tmpStaging, 'stale.txt'), 'old');
    fs.writeFileSync(path.join(tmpSource, 'fresh.txt'), 'new');

    prepareShadowCopy(tmpSource, tmpStaging);

    expect(fs.existsSync(path.join(tmpStaging, 'stale.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(tmpStaging, 'fresh.txt'), 'utf-8')).toBe('new');
  });

  it('returns the staging path', () => {
    const result = prepareShadowCopy(tmpSource, tmpStaging);
    expect(result).toBe(tmpStaging);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shadow-copy.test.ts`
Expected: FAIL — module `./shadow-copy.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/shadow-copy.ts`:

```ts
/**
 * Shadow Copy Module for NanoClaw
 *
 * Copies mount contents to a local staging directory before container launch.
 * Syncs changes back periodically and on container exit.
 * This eliminates virtiofs file locking deadlocks on Dropbox-synced folders.
 */
import fs from 'fs';

import { logger } from './logger.js';

/**
 * Copy source directory to staging directory.
 * Removes existing staging contents first to ensure a clean copy.
 * Returns the staging path.
 */
export function prepareShadowCopy(
  sourcePath: string,
  stagingPath: string,
): string {
  if (fs.existsSync(stagingPath)) {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingPath, { recursive: true });
  fs.cpSync(sourcePath, stagingPath, { recursive: true });

  logger.info(
    { source: sourcePath, staging: stagingPath },
    'Shadow copy prepared',
  );

  return stagingPath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shadow-copy.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shadow-copy.ts src/shadow-copy.test.ts
git commit -m "feat: add prepareShadowCopy for staging mount contents"
```

---

### Task 3: Add `syncBack` function

**Files:**
- Modify: `src/shadow-copy.ts`
- Modify: `src/shadow-copy.test.ts`

- [ ] **Step 1: Write the failing tests for `syncBack`**

Append to `src/shadow-copy.test.ts`:

```ts
import { prepareShadowCopy, syncBack } from './shadow-copy.js';

// ... existing tests ...

describe('syncBack', () => {
  let tmpSource: string;
  let tmpStaging: string;

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-sync-'));
    tmpSource = path.join(base, 'source');
    tmpStaging = path.join(base, 'staging');
    fs.mkdirSync(tmpSource, { recursive: true });
    fs.mkdirSync(tmpStaging, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(path.dirname(tmpSource), { recursive: true, force: true });
    } catch {}
  });

  it('copies changed files back to source', () => {
    // Set up source with an old file
    fs.writeFileSync(path.join(tmpSource, 'data.txt'), 'original');
    const oldTime = Date.now() - 60000;
    fs.utimesSync(path.join(tmpSource, 'data.txt'), oldTime / 1000, oldTime / 1000);

    // Staging has a newer version
    fs.writeFileSync(path.join(tmpStaging, 'data.txt'), 'modified');

    const count = syncBack(tmpStaging, tmpSource);

    expect(count).toBe(1);
    expect(fs.readFileSync(path.join(tmpSource, 'data.txt'), 'utf-8')).toBe('modified');
  });

  it('skips files that have not changed', () => {
    const now = Date.now() / 1000;
    fs.writeFileSync(path.join(tmpSource, 'same.txt'), 'content');
    fs.writeFileSync(path.join(tmpStaging, 'same.txt'), 'content');
    // Make staging file older than source
    fs.utimesSync(path.join(tmpStaging, 'same.txt'), now - 120, now - 120);
    fs.utimesSync(path.join(tmpSource, 'same.txt'), now, now);

    const count = syncBack(tmpStaging, tmpSource);

    expect(count).toBe(0);
  });

  it('copies new files created in staging', () => {
    fs.writeFileSync(path.join(tmpStaging, 'new-file.txt'), 'brand new');

    const count = syncBack(tmpStaging, tmpSource);

    expect(count).toBe(1);
    expect(fs.readFileSync(path.join(tmpSource, 'new-file.txt'), 'utf-8')).toBe('brand new');
  });

  it('handles nested directories', () => {
    fs.mkdirSync(path.join(tmpStaging, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpStaging, 'sub', 'deep.txt'), 'nested');

    const count = syncBack(tmpStaging, tmpSource);

    expect(count).toBe(1);
    expect(fs.readFileSync(path.join(tmpSource, 'sub', 'deep.txt'), 'utf-8')).toBe('nested');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shadow-copy.test.ts`
Expected: FAIL — `syncBack` is not exported.

- [ ] **Step 3: Implement `syncBack`**

Add to `src/shadow-copy.ts`:

```ts
/**
 * Walk a directory recursively, yielding relative paths of all files.
 */
function walkFiles(dir: string, base: string = dir): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, base));
    } else {
      results.push(path.relative(base, fullPath));
    }
  }
  return results;
}

/**
 * Sync changed files from staging back to source.
 * Only copies files whose mtime in staging is newer than in source.
 * Returns the number of files copied.
 */
export function syncBack(stagingPath: string, sourcePath: string): number {
  let copied = 0;

  for (const relPath of walkFiles(stagingPath)) {
    const stagingFile = path.join(stagingPath, relPath);
    const sourceFile = path.join(sourcePath, relPath);

    const stagingMtime = fs.statSync(stagingFile).mtimeMs;

    let sourceMtime = 0;
    try {
      sourceMtime = fs.statSync(sourceFile).mtimeMs;
    } catch {
      // File doesn't exist in source — it's new
    }

    if (stagingMtime > sourceMtime) {
      const dir = path.dirname(sourceFile);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(stagingFile, sourceFile);
      copied++;
    }
  }

  if (copied > 0) {
    logger.info(
      { staging: stagingPath, source: sourcePath, filesCopied: copied },
      'Shadow copy synced back',
    );
  }

  return copied;
}
```

Also add the `path` import at the top of `shadow-copy.ts`:

```ts
import fs from 'fs';
import path from 'path';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shadow-copy.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shadow-copy.ts src/shadow-copy.test.ts
git commit -m "feat: add syncBack for mtime-based sync from staging to source"
```

---

### Task 4: Add `startSyncLoop` and `stopSyncLoop`

**Files:**
- Modify: `src/shadow-copy.ts`
- Modify: `src/shadow-copy.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/shadow-copy.test.ts`:

```ts
import {
  prepareShadowCopy,
  syncBack,
  startSyncLoop,
  stopSyncLoop,
} from './shadow-copy.js';

// ... existing tests ...

describe('startSyncLoop / stopSyncLoop', () => {
  let tmpSource: string;
  let tmpStaging: string;

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-loop-'));
    tmpSource = path.join(base, 'source');
    tmpStaging = path.join(base, 'staging');
    fs.mkdirSync(tmpSource, { recursive: true });
    fs.mkdirSync(tmpStaging, { recursive: true });
  });

  afterEach(() => {
    stopSyncLoop(tmpStaging);
    try {
      fs.rmSync(path.dirname(tmpSource), { recursive: true, force: true });
    } catch {}
  });

  it('starts and stops a sync loop', () => {
    const handle = startSyncLoop(tmpStaging, tmpSource, 100);
    expect(handle).toBeDefined();
    stopSyncLoop(tmpStaging);
  });

  it('stopSyncLoop is safe to call when no loop exists', () => {
    expect(() => stopSyncLoop('/nonexistent')).not.toThrow();
  });

  it('sync loop copies changed files on interval', async () => {
    startSyncLoop(tmpStaging, tmpSource, 50);

    // Create a file in staging after the loop starts
    fs.writeFileSync(path.join(tmpStaging, 'delayed.txt'), 'hello');

    // Wait for at least one tick
    await new Promise((r) => setTimeout(r, 120));

    stopSyncLoop(tmpStaging);

    expect(fs.readFileSync(path.join(tmpSource, 'delayed.txt'), 'utf-8')).toBe('hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shadow-copy.test.ts`
Expected: FAIL — `startSyncLoop` and `stopSyncLoop` not exported.

- [ ] **Step 3: Implement the sync loop**

Add to `src/shadow-copy.ts`:

```ts
/** Active sync loops keyed by staging path. */
const activeSyncLoops = new Map<string, NodeJS.Timeout>();

/** Default sync interval: 5 minutes. */
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Start a periodic sync-back loop from staging to source.
 * Returns the interval handle. Use stopSyncLoop to clean up.
 */
export function startSyncLoop(
  stagingPath: string,
  sourcePath: string,
  intervalMs: number = DEFAULT_SYNC_INTERVAL_MS,
): NodeJS.Timeout {
  // Stop any existing loop for this staging path
  stopSyncLoop(stagingPath);

  const handle = setInterval(() => {
    try {
      syncBack(stagingPath, sourcePath);
    } catch (err) {
      logger.warn(
        { staging: stagingPath, source: sourcePath, err },
        'Shadow sync-back failed',
      );
    }
  }, intervalMs);

  // Don't let the sync loop keep the process alive
  handle.unref();

  activeSyncLoops.set(stagingPath, handle);

  logger.info(
    { staging: stagingPath, source: sourcePath, intervalMs },
    'Shadow sync loop started',
  );

  return handle;
}

/**
 * Stop a sync loop for the given staging path.
 * Does a final sync-back before stopping.
 * Safe to call even if no loop exists.
 */
export function stopSyncLoop(stagingPath: string): void {
  const handle = activeSyncLoops.get(stagingPath);
  if (handle) {
    clearInterval(handle);
    activeSyncLoops.delete(stagingPath);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shadow-copy.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shadow-copy.ts src/shadow-copy.test.ts
git commit -m "feat: add startSyncLoop and stopSyncLoop for periodic sync-back"
```

---

### Task 5: Wire shadow copy into container-runner

**Files:**
- Modify: `src/container-runner.ts:62-228` (buildVolumeMounts)
- Modify: `src/container-runner.ts:290-676` (runContainerAgent)

- [ ] **Step 1: Import shadow copy module in container-runner**

Add to the imports at the top of `src/container-runner.ts`:

```ts
import {
  prepareShadowCopy,
  syncBack,
  startSyncLoop,
  stopSyncLoop,
} from './shadow-copy.js';
```

- [ ] **Step 2: Modify `buildVolumeMounts` to return shadow copy metadata**

Change `buildVolumeMounts` to also return shadow copy pairs that need sync loops. After the `validateAdditionalMounts` block (around line 218-224), add shadow copy handling.

Replace the existing additional mounts block:

```ts
  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
```

With:

```ts
  // Additional mounts validated against external allowlist (tamper-proof from containers)
  const shadowPairs: ShadowCopyPair[] = [];
  if (group.containerConfig?.additionalMounts) {
    const rawMounts = group.containerConfig.additionalMounts;
    const validatedMounts = validateAdditionalMounts(
      rawMounts,
      group.name,
      isMain,
    );

    for (let i = 0; i < validatedMounts.length; i++) {
      const validated = validatedMounts[i];
      const raw = rawMounts[i];

      if (raw.shadowCopy && !validated.readonly) {
        const basename = path.basename(validated.hostPath);
        const stagingDir = path.join(DATA_DIR, 'shadow', group.folder, basename);
        const sourcePath = validated.hostPath;

        logger.info(
          { group: group.name, source: sourcePath, staging: stagingDir },
          'Preparing shadow copy for mount',
        );
        prepareShadowCopy(sourcePath, stagingDir);

        mounts.push({
          hostPath: stagingDir,
          containerPath: validated.containerPath,
          readonly: false,
        });
        shadowPairs.push({ stagingPath: stagingDir, sourcePath });
      } else {
        mounts.push(validated);
      }
    }
  }

  return { mounts, shadowPairs };
```

- [ ] **Step 3: Add the `ShadowCopyPair` interface and update return type**

Add above `buildVolumeMounts`:

```ts
export interface ShadowCopyPair {
  stagingPath: string;
  sourcePath: string;
}
```

Update the function signature:

```ts
function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
): { mounts: VolumeMount[]; shadowPairs: ShadowCopyPair[] } {
```

- [ ] **Step 4: Update `runContainerAgent` to use the new return shape and manage sync loops**

In `runContainerAgent`, update the line that calls `buildVolumeMounts` (around line 301):

Change:
```ts
  const mounts = buildVolumeMounts(group, input.isMain);
```

To:
```ts
  const { mounts, shadowPairs } = buildVolumeMounts(group, input.isMain);
```

After the `onProcess(container, containerName)` call (around line 337), start sync loops:

```ts
    onProcess(container, containerName);

    // Start shadow copy sync loops for any shadow-copied mounts
    for (const pair of shadowPairs) {
      startSyncLoop(pair.stagingPath, pair.sourcePath);
    }
```

In the `container.on('close', ...)` handler, add cleanup at the very beginning (right after `clearTimeout(timeout)`):

```ts
    container.on('close', (code) => {
      clearTimeout(timeout);

      // Final sync-back and cleanup for shadow-copied mounts
      for (const pair of shadowPairs) {
        stopSyncLoop(pair.stagingPath);
        try {
          syncBack(pair.stagingPath, pair.sourcePath);
          logger.info(
            { staging: pair.stagingPath, source: pair.sourcePath },
            'Final shadow sync-back completed',
          );
        } catch (err) {
          logger.error(
            { staging: pair.stagingPath, source: pair.sourcePath, err },
            'Final shadow sync-back failed',
          );
        }
      }

      const duration = Date.now() - startTime;
      // ... rest of the handler unchanged
```

- [ ] **Step 5: Build and verify no type errors**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 6: Run existing tests to verify nothing broke**

Run: `npx vitest run src/container-runner.test.ts`
Expected: PASS — existing tests still pass (they use mocked `validateAdditionalMounts` returning `[]`, so `shadowPairs` will be empty).

- [ ] **Step 7: Commit**

```bash
git add src/container-runner.ts
git commit -m "feat: wire shadow copy into container-runner mount building and lifecycle"
```

---

### Task 6: Add container-runner test for shadow copy integration

**Files:**
- Modify: `src/container-runner.test.ts`

- [ ] **Step 1: Write a test that verifies shadow copy mount substitution**

Add a new describe block to `src/container-runner.test.ts`:

```ts
import { validateAdditionalMounts } from './mount-security.js';

// ... existing code ...

describe('shadow copy mount integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();

    // Mock fs to allow shadow copy operations
    const mockFs = vi.mocked(await import('fs')).default;
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockReturnValue(undefined as any);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.readdirSync.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses staging dir when shadowCopy is enabled', async () => {
    const { spawn } = await import('child_process');
    const mockSpawn = vi.mocked(spawn);

    // Mock validateAdditionalMounts to return a writable mount
    vi.mocked(validateAdditionalMounts).mockReturnValueOnce([
      {
        hostPath: '/Users/test/Dropbox/Medical',
        containerPath: '/workspace/extra/Medical',
        readonly: false,
      },
    ]);

    const groupWithShadow: RegisteredGroup = {
      ...testGroup,
      containerConfig: {
        additionalMounts: [
          {
            hostPath: '~/Dropbox/Medical',
            readonly: false,
            shadowCopy: true,
          },
        ],
      },
    };

    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      groupWithShadow,
      testInput,
      () => {},
      onOutput,
    );

    // Check that spawn was called with a staging path, not the original Dropbox path
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    const mountArgs = spawnArgs.join(' ');

    // Should contain the shadow staging path, not the original
    expect(mountArgs).toContain('/shadow/');
    expect(mountArgs).not.toContain('/Dropbox/Medical:/workspace');

    // Clean up: emit output and close
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'done',
    });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run src/container-runner.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/container-runner.test.ts
git commit -m "test: add shadow copy mount integration test"
```

---

### Task 7: Update jbot config and CLAUDE.md

**Files:**
- Modify: DB `registered_groups` table (jbot row)
- Modify: `groups/jbot/CLAUDE.md`

- [ ] **Step 1: Update jbot's container config in the database**

```bash
sqlite3 store/messages.db "UPDATE registered_groups SET container_config = json_set(container_config, '$.additionalMounts[0].shadowCopy', json('true')) WHERE folder = 'jbot';"
```

Verify:
```bash
sqlite3 store/messages.db "SELECT container_config FROM registered_groups WHERE folder = 'jbot';"
```

Expected output should include `"shadowCopy":true`.

- [ ] **Step 2: Remove virtiofs workaround from jbot CLAUDE.md**

In `groups/jbot/CLAUDE.md`, remove the entire "Virtiofs workaround" section (the block starting with `## Virtiofs workaround` through the end of that section, including all the `dd bs=1` instructions). Also remove the "SQLite in container" section about WAL mode / journal_mode since the shadow copy eliminates the virtiofs locking issue.

The file should still have: the intro, primary workspace section, and the `npm install` warning.

- [ ] **Step 3: Rebuild and restart**

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

- [ ] **Step 4: Verify shadow copy in logs**

```bash
sleep 15 && grep -i shadow logs/nanoclaw.log | tail -5
```

Expected: Log lines showing "Shadow copy prepared" and "Shadow sync loop started" for jbot.

- [ ] **Step 5: Commit**

```bash
git add groups/jbot/CLAUDE.md
git commit -m "feat: enable shadow copy for jbot Medical mount, remove virtiofs workarounds"
```

---

### Task 8: Manual smoke test

- [ ] **Step 1: Send a message to jbot on WhatsApp**

Trigger jbot with a simple question. Verify it responds without any EDEADLK or locking errors.

- [ ] **Step 2: Check container can read/write normally**

Look at container logs to verify no `lseek` errors, no `Resource deadlock avoided` messages:

```bash
container list | grep jbot
container logs <jbot-container-name> 2>&1 | tail -20
```

- [ ] **Step 3: Verify sync-back works**

After the agent modifies a file (e.g., writes to the DB), wait 5 minutes or stop the container, then check the original Dropbox file was updated:

```bash
ls -la ~/Dropbox/John/Medical/health.db
```

Compare the mtime to before the test.

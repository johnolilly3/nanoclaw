import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export function prepareShadowCopy(
  sourcePath: string,
  stagingPath: string,
): string {
  if (fs.existsSync(stagingPath)) {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingPath, { recursive: true });
  // Use rsync instead of fs.cpSync — Dropbox files have locks that cause
  // EDEADLK with Node's cpSync (which uses lseek). rsync handles most
  // files fine; we ignore partial failures (exit code != 0) since a few
  // locked files (e.g., .gitignore) are non-critical.
  try {
    execSync(
      `rsync -a --delete --exclude='.venv' --exclude='.git' --exclude='node_modules' "${sourcePath}/" "${stagingPath}/"`,
      { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err: unknown) {
    // rsync returns non-zero even for partial failures. Log but continue
    // as long as critical files were copied.
    const stderr =
      err instanceof Error && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr)
        : '';
    logger.warn(
      { source: sourcePath, staging: stagingPath, stderr: stderr.slice(-500) },
      'Shadow copy rsync had partial failures (continuing)',
    );
  }
  logger.info(
    { source: sourcePath, staging: stagingPath },
    'Shadow copy prepared',
  );
  return stagingPath;
}

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

export function syncBack(stagingPath: string, sourcePath: string): number {
  let copied = 0;
  for (const relPath of walkFiles(stagingPath)) {
    const stagingFile = path.join(stagingPath, relPath);
    const sourceFile = path.join(sourcePath, relPath);
    const stagingMtime = fs.statSync(stagingFile).mtimeMs;
    let sourceMtime = 0;
    try {
      sourceMtime = fs.statSync(sourceFile).mtimeMs;
    } catch {}
    if (stagingMtime > sourceMtime) {
      fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
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

const activeSyncLoops = new Map<string, NodeJS.Timeout>();
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function startSyncLoop(
  stagingPath: string,
  sourcePath: string,
  intervalMs: number = DEFAULT_SYNC_INTERVAL_MS,
): NodeJS.Timeout {
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
  handle.unref();
  activeSyncLoops.set(stagingPath, handle);
  logger.info(
    { staging: stagingPath, source: sourcePath, intervalMs },
    'Shadow sync loop started',
  );
  return handle;
}

export function stopSyncLoop(stagingPath: string): void {
  const handle = activeSyncLoops.get(stagingPath);
  if (handle) {
    clearInterval(handle);
    activeSyncLoops.delete(stagingPath);
  }
}

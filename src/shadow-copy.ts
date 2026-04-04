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
  fs.cpSync(sourcePath, stagingPath, { recursive: true });
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
      logger.warn({ staging: stagingPath, source: sourcePath, err }, 'Shadow sync-back failed');
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

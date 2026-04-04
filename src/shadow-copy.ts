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

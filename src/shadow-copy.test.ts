import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { prepareShadowCopy, syncBack, startSyncLoop, stopSyncLoop } from './shadow-copy.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-copy-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- prepareShadowCopy ---

describe('prepareShadowCopy', () => {
  it('copies source files to staging', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'hello.txt'), 'hello');

    prepareShadowCopy(source, staging);

    expect(fs.existsSync(path.join(staging, 'hello.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(staging, 'hello.txt'), 'utf8')).toBe(
      'hello',
    );
  });

  it('copies nested directories to staging', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(path.join(source, 'subdir'), { recursive: true });
    fs.writeFileSync(path.join(source, 'subdir', 'nested.txt'), 'nested');

    prepareShadowCopy(source, staging);

    expect(fs.existsSync(path.join(staging, 'subdir', 'nested.txt'))).toBe(
      true,
    );
    expect(
      fs.readFileSync(path.join(staging, 'subdir', 'nested.txt'), 'utf8'),
    ).toBe('nested');
  });

  it('overwrites existing staging dir with fresh copy', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.mkdirSync(staging);
    fs.writeFileSync(path.join(staging, 'stale.txt'), 'stale');
    fs.writeFileSync(path.join(source, 'fresh.txt'), 'fresh');

    prepareShadowCopy(source, staging);

    expect(fs.existsSync(path.join(staging, 'stale.txt'))).toBe(false);
    expect(fs.existsSync(path.join(staging, 'fresh.txt'))).toBe(true);
  });

  it('returns the staging path', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);

    const result = prepareShadowCopy(source, staging);

    expect(result).toBe(staging);
  });
});

// --- syncBack ---

describe('syncBack', () => {
  it('copies files where staging mtime > source mtime', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.mkdirSync(staging);

    const sourceFile = path.join(source, 'file.txt');
    const stagingFile = path.join(staging, 'file.txt');

    fs.writeFileSync(sourceFile, 'original');
    fs.writeFileSync(stagingFile, 'modified');

    // Set staging mtime to be newer than source
    const now = Date.now();
    fs.utimesSync(sourceFile, now / 1000, (now - 2000) / 1000);
    fs.utimesSync(stagingFile, now / 1000, now / 1000);

    const count = syncBack(staging, source);

    expect(count).toBe(1);
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('modified');
  });

  it('skips files where staging mtime <= source mtime', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.mkdirSync(staging);

    const sourceFile = path.join(source, 'file.txt');
    const stagingFile = path.join(staging, 'file.txt');

    fs.writeFileSync(sourceFile, 'newer-source');
    fs.writeFileSync(stagingFile, 'older-staging');

    // Set source mtime to be newer than staging
    const now = Date.now();
    fs.utimesSync(sourceFile, now / 1000, now / 1000);
    fs.utimesSync(stagingFile, now / 1000, (now - 2000) / 1000);

    const count = syncBack(staging, source);

    expect(count).toBe(0);
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('newer-source');
  });

  it('copies new files that exist in staging but not source', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.mkdirSync(staging);

    fs.writeFileSync(path.join(staging, 'new-file.txt'), 'brand new');

    const count = syncBack(staging, source);

    expect(count).toBe(1);
    expect(fs.existsSync(path.join(source, 'new-file.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(source, 'new-file.txt'), 'utf8')).toBe(
      'brand new',
    );
  });

  it('handles nested directories', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.mkdirSync(path.join(staging, 'subdir'), { recursive: true });

    fs.writeFileSync(
      path.join(staging, 'subdir', 'nested.txt'),
      'nested content',
    );

    const count = syncBack(staging, source);

    expect(count).toBe(1);
    expect(fs.existsSync(path.join(source, 'subdir', 'nested.txt'))).toBe(true);
    expect(
      fs.readFileSync(path.join(source, 'subdir', 'nested.txt'), 'utf8'),
    ).toBe('nested content');
  });
});

// --- startSyncLoop / stopSyncLoop ---

describe('startSyncLoop / stopSyncLoop', () => {
  it('starts and stops without error', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.mkdirSync(staging);

    const handle = startSyncLoop(staging, source, 50);
    expect(handle).toBeDefined();
    stopSyncLoop(staging);
  });

  it('stopSyncLoop is safe to call when no loop exists', () => {
    expect(() => stopSyncLoop('/nonexistent/path')).not.toThrow();
  });

  it('sync loop copies changed files on interval', async () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(source);
    fs.mkdirSync(staging);

    // Write a file to staging that is newer than source
    const sourceFile = path.join(source, 'watched.txt');
    const stagingFile = path.join(staging, 'watched.txt');

    fs.writeFileSync(sourceFile, 'before');
    fs.writeFileSync(stagingFile, 'after');

    const now = Date.now();
    fs.utimesSync(sourceFile, now / 1000, (now - 2000) / 1000);
    fs.utimesSync(stagingFile, now / 1000, now / 1000);

    startSyncLoop(staging, source, 50);

    await new Promise((resolve) => setTimeout(resolve, 120));

    stopSyncLoop(staging);

    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('after');
  });
});

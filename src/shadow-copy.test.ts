import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { prepareShadowCopy } from './shadow-copy.js';

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
    expect(fs.readFileSync(path.join(staging, 'hello.txt'), 'utf8')).toBe('hello');
  });

  it('copies nested directories to staging', () => {
    const source = path.join(tmpDir, 'source');
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(path.join(source, 'subdir'), { recursive: true });
    fs.writeFileSync(path.join(source, 'subdir', 'nested.txt'), 'nested');

    prepareShadowCopy(source, staging);

    expect(fs.existsSync(path.join(staging, 'subdir', 'nested.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(staging, 'subdir', 'nested.txt'), 'utf8')).toBe('nested');
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

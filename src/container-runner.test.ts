import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Sentinel markers must match container-runner.ts
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// Mock config
vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanoclaw-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 1800000, // 30min
  CREDENTIAL_PROXY_PORT: 3001,
  DATA_DIR: '/tmp/nanoclaw-test-data',
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
  IDLE_TIMEOUT: 1800000, // 30min
  TIMEZONE: 'America/Los_Angeles',
}));

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false })),
      copyFileSync: vi.fn(),
    },
  };
});

// Mock mount-security
vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

// Mock container-runtime (Apple Container)
vi.mock('./container-runtime.js', () => ({
  CONTAINER_HOST_GATEWAY: '192.168.64.1',
  CONTAINER_RUNTIME_BIN: 'container',
  hostGatewayArgs: () => [],
  readonlyMountArgs: (h: string, c: string) => [
    '--mount',
    `type=bind,source=${h},target=${c},readonly`,
  ],
  stopContainer: vi.fn(),
}));

// Mock credential-proxy
vi.mock('./credential-proxy.js', () => ({
  detectAuthMode: vi.fn(() => 'api-key'),
}));

// Mock shadow-copy
vi.mock('./shadow-copy.js', () => ({
  prepareShadowCopy: vi.fn(),
  syncBack: vi.fn(),
  startSyncLoop: vi.fn(),
  stopSyncLoop: vi.fn(),
}));

// Create a controllable fake ChildProcess
function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

// Mock child_process.spawn
vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(() => fakeProc),
    exec: vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        return new EventEmitter();
      },
    ),
  };
});

import { runContainerAgent, ContainerOutput } from './container-runner.js';
import { validateAdditionalMounts } from './mount-security.js';
import { prepareShadowCopy, startSyncLoop, stopSyncLoop, syncBack } from './shadow-copy.js';
import type { RegisteredGroup } from './types.js';

const testGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@Andy',
  added_at: new Date().toISOString(),
};

const testInput = {
  prompt: 'Hello',
  groupFolder: 'test-group',
  chatJid: 'test@g.us',
  isMain: false,
};

function emitOutputMarker(
  proc: ReturnType<typeof createFakeProcess>,
  output: ContainerOutput,
) {
  const json = JSON.stringify(output);
  proc.stdout.push(`${OUTPUT_START_MARKER}\n${json}\n${OUTPUT_END_MARKER}\n`);
}

describe('container-runner timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timeout after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output with a result
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Here is my response',
      newSessionId: 'session-123',
    });

    // Let output processing settle
    await vi.advanceTimersByTimeAsync(10);

    // Fire the hard timeout (IDLE_TIMEOUT + 30s = 1830000ms)
    await vi.advanceTimersByTimeAsync(1830000);

    // Emit close event (as if container was stopped by the timeout)
    fakeProc.emit('close', 137);

    // Let the promise resolve
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-123');
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'Here is my response' }),
    );
  });

  it('timeout with no output resolves as error', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // No output emitted — fire the hard timeout
    await vi.advanceTimersByTimeAsync(1830000);

    // Emit close event
    fakeProc.emit('close', 137);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('shadow copy mount substitutes staging dir and manages sync lifecycle', async () => {
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
          { hostPath: '~/Dropbox/Medical', readonly: false, shadowCopy: true },
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

    // Verify prepareShadowCopy was called with correct paths
    expect(vi.mocked(prepareShadowCopy)).toHaveBeenCalledWith(
      '/Users/test/Dropbox/Medical',
      expect.stringContaining('/shadow/test-group/Medical'),
    );

    // Verify startSyncLoop was called
    expect(vi.mocked(startSyncLoop)).toHaveBeenCalledWith(
      expect.stringContaining('/shadow/test-group/Medical'),
      '/Users/test/Dropbox/Medical',
    );

    // Verify spawn was called with staging path, not Dropbox path
    const spawnArgs = (mockSpawn.mock.calls[0][1] as string[]).join(' ');
    expect(spawnArgs).toContain('/shadow/');
    expect(spawnArgs).not.toContain('Dropbox/Medical:/workspace');

    // Clean up: emit output and close
    emitOutputMarker(fakeProc, { status: 'success', result: 'done' });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;

    // Verify cleanup: stopSyncLoop and final syncBack were called
    expect(vi.mocked(stopSyncLoop)).toHaveBeenCalled();
    expect(vi.mocked(syncBack)).toHaveBeenCalledWith(
      expect.stringContaining('/shadow/test-group/Medical'),
      '/Users/test/Dropbox/Medical',
    );
  });

  it('normal exit after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
      newSessionId: 'session-456',
    });

    await vi.advanceTimersByTimeAsync(10);

    // Normal exit (no timeout)
    fakeProc.emit('close', 0);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-456');
  });
});

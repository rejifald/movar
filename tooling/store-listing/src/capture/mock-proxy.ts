/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { PACKAGE_ROOT } from './build';
import { parseProxyLog } from './gates';
import type { ProxyLogSummary } from './gates';

export interface MockProxy {
  readonly port: number;
  readonly caCertPath: string;
  readonly logFile: string;
  stop(): Promise<void>;
  summary(): ProxyLogSummary;
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * Start `src/mock/serve.ts` and wait for its one JSON line `{port, caCertPath}`.
 * Contract owned by the mock agent: `--port <p> --log <file>`.
 */
export async function startMockProxy(port: number, logFile: string): Promise<MockProxy> {
  const entry = path.join(PACKAGE_ROOT, 'src/mock/serve.ts');
  if (!existsSync(entry)) throw new Error(`mock proxy not found at ${entry}`);
  const child: ChildProcess = spawn(
    'pnpm',
    ['exec', 'tsx', entry, '--port', String(port), '--log', logFile],
    { cwd: PACKAGE_ROOT, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const ready = await new Promise<{ port: number; caCertPath: string }>((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error('mock proxy did not print its ready line in 60s'));
    }, 60_000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`mock proxy exited early (${code})`));
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      for (const line of buffer.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const parsed = JSON.parse(line) as { port: number; caCertPath: string };
          clearTimeout(timer);
          resolve(parsed);
          return;
        } catch {
          // partial line; wait for more
        }
      }
    });
  });
  return {
    port: ready.port,
    caCertPath: ready.caCertPath,
    logFile,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.removeAllListeners('exit');
      child.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 300));
    },
    summary: () => parseProxyLog(existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''),
  };
}

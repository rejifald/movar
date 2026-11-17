import { appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { startMockProxy } from './proxy';

/**
 * CLI: `tsx src/mock/serve.ts --port 8899 [--log requests.jsonl] [--cert-dir dir]`
 * Prints `{port, caCertPath}` as one JSON line, then serves until SIGINT/SIGTERM.
 * With `--log`, every request is appended to it as one JSON line as it happens.
 */
const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    log: { type: 'string' },
    'cert-dir': { type: 'string' },
  },
});

// The log is JSON lines, appended as each request is recorded: the capture run
// reads it (src/capture/gates.ts parseProxyLog) while this process still runs.
const logFile = values.log;
if (logFile !== undefined) writeFileSync(logFile, '');
const proxy = await startMockProxy({
  port: values.port === undefined ? 0 : Number(values.port),
  ...(logFile === undefined
    ? {}
    : {
        onRecord: (line: string) => {
          appendFileSync(logFile, `${line}\n`);
        },
      }),
  ...(values['cert-dir'] === undefined ? {} : { certDir: values['cert-dir'] }),
});
process.stdout.write(`${JSON.stringify({ port: proxy.port, caCertPath: proxy.caCertPath })}\n`);

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await proxy.close();
  // CLI entry point: exit explicitly once the log is flushed and sockets are closed.
  // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point exits after flushing
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { startMockProxy } from './proxy';

/**
 * CLI: `tsx src/mock/serve.ts --port 8899 [--log requests.json] [--cert-dir dir]`
 * Prints `{port, caCertPath}` as one JSON line, then serves until SIGINT/SIGTERM,
 * when it writes the request log (if `--log` was given) and exits.
 */
const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    log: { type: 'string' },
    'cert-dir': { type: 'string' },
  },
});

const proxy = await startMockProxy({
  port: values.port === undefined ? 0 : Number(values.port),
  ...(values['cert-dir'] === undefined ? {} : { certDir: values['cert-dir'] }),
});
process.stdout.write(`${JSON.stringify({ port: proxy.port, caCertPath: proxy.caCertPath })}\n`);

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  if (values.log !== undefined) {
    writeFileSync(
      values.log,
      `${JSON.stringify({ requests: proxy.requests(), misses: proxy.misses() }, null, 2)}\n`,
    );
  }
  await proxy.close();
  // CLI entry point: exit explicitly once the log is flushed and sockets are closed.
  // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point exits after flushing
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

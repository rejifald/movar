/**
 * The run's pass/fail gates, as pure functions so they are unit-tested rather
 * than trusted. Anything returned here fails the run and no output is kept.
 */

export interface ProxyLogSummary {
  readonly requests: number;
  readonly misses: readonly string[];
}

/** One recorded shot, as the run measured it. */
export interface ShotRecord {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly appVersion: string;
  readonly appBuild: string;
}

/**
 * Parse the mock proxy's log (JSON lines). A line is a MISS when it says so in
 * any of the shapes the proxy may use: `miss: true`, or `kind|type|outcome|result`
 * equal to "miss" (case-insensitive). Non-JSON lines are ignored: they are
 * diagnostics, not requests.
 */
export function parseProxyLog(text: string): ProxyLogSummary {
  let requests = 0;
  const misses: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    requests += 1;
    if (isMiss(entry)) {
      const where = [
        entry['method'],
        entry['host'],
        entry['url'],
        entry['target'],
        entry['path'],
      ].filter((part): part is string => typeof part === 'string');
      misses.push(where.join(' ') || trimmed);
    }
  }
  return { requests, misses };
}

function isMiss(entry: Record<string, unknown>): boolean {
  if (entry['miss'] === true) return true;
  return ['kind', 'type', 'outcome', 'result', 'status'].some((key) => {
    const value = entry[key];
    return typeof value === 'string' && value.toLowerCase() === 'miss';
  });
}

export interface GateInput {
  readonly proxy: ProxyLogSummary | null;
  readonly shots: readonly ShotRecord[];
  readonly expectedIds: readonly string[];
  readonly size: { readonly width: number; readonly height: number };
}

/** Every reason the run must fail; empty means it passed. */
export function evaluateGates(input: GateInput): string[] {
  const failures: string[] = [];
  const { proxy, shots, expectedIds, size } = input;

  if (proxy) {
    if (proxy.requests === 0) {
      failures.push(
        'mock proxy recorded no requests: its log never reached the gate, or Safari bypassed it',
      );
    }
    for (const miss of proxy.misses) failures.push(`mock proxy miss: ${miss}`);
  }

  const taken = new Set(shots.map((shot) => shot.id));
  for (const id of expectedIds) {
    if (!taken.has(id)) failures.push(`shot "${id}" was not captured`);
  }

  for (const shot of shots) {
    if (shot.width !== size.width || shot.height !== size.height) {
      failures.push(
        `shot "${shot.id}" is ${shot.width}x${shot.height}, expected ${size.width}x${size.height}`,
      );
    }
  }

  const versions = new Set(shots.map((shot) => `${shot.appVersion} (${shot.appBuild})`));
  if (versions.size > 1) {
    failures.push(`app version/build differs between shots: ${[...versions].join(' vs ')}`);
  }
  return failures;
}

/**
 * The two host-app values that decide whether curtains appear, read out of a
 * App Group plist dump, as plutil JSON or a `defaults read` (settings are a JSON string, so
 * quotes may be escaped). `?` when absent: a diagnostic, never a gate.
 */
/** How much of an unparsed dump the log shows. */
const RAW_DUMP_CHARS = 300;

export function hostSettingsSummary(dump: string): string {
  const hiding = /contentModification\\?"\s*:\s*(true|false)/.exec(dump)?.[1] ?? '?';
  // `settingsRev = 3;` in a defaults dump, `"settingsRev" : 3` in plutil JSON.
  const rev = /settingsRev"?\s*[=:]\s*(\d+)/.exec(dump)?.[1] ?? '?';
  const summary = `contentModification=${hiding} rev=${rev}`;
  // An unparsed dump is shown, never hidden behind a '?'.
  return hiding === '?' || rev === '?'
    ? `${summary} (raw: ${dump.trim().slice(0, RAW_DUMP_CHARS)})`
    : summary;
}

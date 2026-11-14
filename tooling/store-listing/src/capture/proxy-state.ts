/**
 * System-proxy handling for CI runs. The simulator shares the Mac's network
 * configuration, so on an ephemeral CI runner the Mac's HTTP/HTTPS proxy is
 * pointed at the mock proxy. This module only PLANS: it parses what
 * `networksetup` reports and produces the exact commands to set and to restore.
 * Executing them is `run.ts`'s job, and it only does so when `CI === 'true'`.
 */

export interface ProxySetting {
  readonly enabled: boolean;
  readonly server: string;
  readonly port: number;
}

/** Parse `networksetup -getwebproxy|-getsecurewebproxy <service>` output. */
export function parseProxyGet(output: string): ProxySetting {
  const field = (name: string): string | undefined =>
    new RegExp(String.raw`^${name}:[ \t]*(.*)$`, 'm').exec(output)?.[1]?.trim();
  return {
    enabled: field('Enabled')?.toLowerCase() === 'yes',
    server: field('Server') ?? '',
    port: Number.parseInt(field('Port') ?? '0', 10) || 0,
  };
}

/** Pick the network service that owns `interfaceName` from `-listnetworkserviceorder`. */
export function serviceForInterface(listing: string, interfaceName: string): string | null {
  const lines = listing.split('\n');
  let current: string | null = null;
  for (const line of lines) {
    const header = line.trimStart();
    if (header.startsWith('(') && header.includes(') ') && !header.startsWith('(Hardware')) {
      current = header.slice(header.indexOf(') ') + 2).trim();
    } else if (current !== null && header.includes(`Device: ${interfaceName})`)) {
      return current;
    } else if (current !== null && header.includes(`Device: ${interfaceName},`)) {
      return current;
    }
  }
  return null;
}

/** Interface name from `route -n get default` output (`interface: en0`). */
export function defaultInterface(routeOutput: string): string | null {
  return /interface:\s*(\S+)/.exec(routeOutput)?.[1] ?? null;
}

/** The network service behind the default route, or null when it cannot be told. */
export function activeService(routeOutput: string, serviceOrder: string): string | null {
  const iface = defaultInterface(routeOutput);
  return iface === null ? null : serviceForInterface(serviceOrder, iface);
}

export interface ProxyPlan {
  readonly service: string;
  readonly apply: readonly (readonly string[])[];
  readonly restore: readonly (readonly string[])[];
}

interface Previous {
  readonly web: ProxySetting;
  readonly secure: ProxySetting;
}

/** Commands (argv for `networksetup`) that point the proxy at `host:port`, and undo them. */
export function planProxy(
  service: string,
  host: string,
  port: number,
  previous: Previous,
): ProxyPlan {
  const apply = [
    ['-setwebproxy', service, host, String(port)],
    ['-setsecurewebproxy', service, host, String(port)],
  ];
  return { service, apply, restore: restoreCommands(service, previous) };
}

export function restoreCommands(service: string, previous: Previous): string[][] {
  const one = (setting: ProxySetting, set: string, state: string): string[][] =>
    setting.server === ''
      ? [[state, service, 'off']]
      : [
          [set, service, setting.server, String(setting.port)],
          [state, service, setting.enabled ? 'on' : 'off'],
        ];
  return [
    ...one(previous.web, '-setwebproxy', '-setwebproxystate'),
    ...one(previous.secure, '-setsecurewebproxy', '-setsecurewebproxystate'),
  ];
}

/** What the owner runs by hand for a local run. Printed, never executed. */
export function manualProxyInstructions(service: string, host: string, port: number): string {
  return [
    `Local runs never touch network settings. To capture the proxied shots here, run`,
    `by hand (service "${service}"), then pass --local-proxy-already-set:`,
    ``,
    `  networksetup -setwebproxy "${service}" ${host} ${port}`,
    `  networksetup -setsecurewebproxy "${service}" ${host} ${port}`,
    ``,
    `and when done, restore (or turn them off):`,
    ``,
    `  networksetup -setwebproxystate "${service}" off`,
    `  networksetup -setsecurewebproxystate "${service}" off`,
    ``,
    `The proxy port is chosen per run; pass --proxy-port <p> to pin it so the`,
    `commands above stay valid (default ${port}).`,
  ].join('\n');
}

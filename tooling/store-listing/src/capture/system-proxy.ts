/* eslint-disable sonarjs/no-os-command-from-path -- shells out to route/networksetup by name */
import { activeService, parseProxyGet, planProxy } from './proxy-state';
import { log, out } from './sh';

/** Point the active service's HTTP/HTTPS proxy at the mock proxy; returns the restore. */
export function pointSystemProxyAt(port: number): () => void {
  const service = activeService(
    out('route', ['-n', 'get', 'default']),
    out('networksetup', ['-listnetworkserviceorder']),
  );
  if (service === null) throw new Error('cannot find the active network service');
  const plan = planProxy(service, '127.0.0.1', port, {
    web: parseProxyGet(out('networksetup', ['-getwebproxy', service])),
    secure: parseProxyGet(out('networksetup', ['-getsecurewebproxy', service])),
  });
  const restore = (): void => {
    for (const cmd of plan.restore) out('sudo', ['-n', 'networksetup', ...cmd]);
    log(`▸ system proxy restored on "${plan.service}"`);
  };
  try {
    for (const cmd of plan.apply) out('sudo', ['-n', 'networksetup', ...cmd]);
  } catch (error) {
    restore();
    throw error;
  }
  log(`▸ system proxy on "${plan.service}" → 127.0.0.1:${port}`);
  return restore;
}

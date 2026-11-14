import { rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import tls from 'node:tls';
import { createCertAuthority } from './certs';
import { mockRoutes } from './routes';
import type { MockRoutes } from './routes';

const HTTPS_PORT = 443;
const STATUS_BAD_REQUEST = 400;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;

export type RequestOutcome = 'served' | 'miss' | 'passthroughRefused';

export interface RequestRecord {
  /** ISO timestamp. */
  at: string;
  scheme: 'http' | 'https' | 'connect';
  method: string;
  host: string;
  /** Path + query (empty for a refused CONNECT). */
  target: string;
  status: number;
  outcome: RequestOutcome;
}

export interface StartMockProxyOptions {
  /** Listen port; 0 (default) picks a free one. */
  port?: number;
  /** Listen address. Defaults to loopback, which the iOS Simulator shares. */
  listenHost?: string;
  routes?: MockRoutes;
  /** Persist/reuse the CA in this directory (install it once into a simulator).
   *  Omit for a throwaway directory removed on close. */
  certDir?: string;
}

export interface MockProxy {
  port: number;
  caCertPath: string;
  requests(): RequestRecord[];
  /** Requests to a mocked host that no route answered. */
  misses(): RequestRecord[];
  close(): Promise<void>;
}

function splitHostPort(authority: string, defaultPort: number): { host: string; port: number } {
  const url = new URL(`http://${authority}`);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port === '' ? defaultPort : Number(url.port),
  };
}

async function closeServer(server: http.Server | https.Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

export async function startMockProxy(options: StartMockProxyOptions = {}): Promise<MockProxy> {
  const routes = options.routes ?? mockRoutes;
  const hosts = new Set(routes.hosts.map((h) => h.toLowerCase()));
  const ca = createCertAuthority(options.certDir);
  const log: RequestRecord[] = [];
  const sockets = new Set<net.Socket>();

  const record = (r: Omit<RequestRecord, 'at'>): void => {
    log.push({ at: new Date().toISOString(), ...r });
  };

  /** Answer one request that was addressed to `host` over `scheme`. */
  const serve = (
    scheme: 'http' | 'https',
    host: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void => {
    const method = req.method ?? 'GET';
    const target = req.url ?? '/';
    const hit = hosts.has(host) ? routes.resolve(host, target) : null;
    if (!hosts.has(host)) {
      record({
        scheme,
        method,
        host,
        target,
        status: STATUS_FORBIDDEN,
        outcome: 'passthroughRefused',
      });
      res.writeHead(STATUS_FORBIDDEN, { 'content-type': 'text/plain' }).end('not a mocked host');
      return;
    }
    if (hit === null) {
      record({ scheme, method, host, target, status: STATUS_NOT_FOUND, outcome: 'miss' });
      res
        .writeHead(STATUS_NOT_FOUND, { 'content-type': 'text/plain; charset=utf-8' })
        .end('no mock route');
      return;
    }
    record({ scheme, method, host, target, status: hit.status, outcome: 'served' });
    res.writeHead(hit.status, { ...hit.headers, 'content-length': Buffer.byteLength(hit.body) });
    res.end(method === 'HEAD' ? undefined : hit.body);
  };

  // TLS terminator: connections are handed to it after a CONNECT is accepted.
  const tlsServer = https.createServer(
    {
      SNICallback: (servername, cb) => {
        const name = servername.toLowerCase();
        try {
          const leaf = ca.leafFor(hosts.has(name) ? name : ([...hosts][0] ?? 'localhost'));
          cb(null, tls.createSecureContext(leaf));
        } catch (error) {
          cb(error instanceof Error ? error : new Error(String(error)));
        }
      },
    },
    (req, res) => {
      const authority = req.headers.host ?? '';
      serve('https', splitHostPort(authority, HTTPS_PORT).host, req, res);
    },
  );
  tlsServer.on('tlsClientError', () => {
    /* a client that rejects our CA aborts the handshake; nothing to serve */
  });

  const proxy = http.createServer((req, res) => {
    // Plain-HTTP proxy request: the request line carries an absolute URL.
    let url: URL;
    try {
      url = new URL(req.url ?? '');
    } catch {
      res.writeHead(STATUS_BAD_REQUEST).end('absolute-form request target expected');
      return;
    }
    req.url = `${url.pathname}${url.search}`;
    serve('http', url.hostname.toLowerCase(), req, res);
  });

  proxy.on('connect', (req, clientSocket: net.Socket, head) => {
    const { host } = splitHostPort(req.url ?? '', HTTPS_PORT);
    if (!hosts.has(host)) {
      // Background traffic (Apple services etc.): refuse, don't count as a miss.
      record({
        scheme: 'connect',
        method: 'CONNECT',
        host,
        target: '',
        status: STATUS_FORBIDDEN,
        outcome: 'passthroughRefused',
      });
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) clientSocket.unshift(head);
    tlsServer.emit('connection', clientSocket);
  });

  for (const server of [proxy, tlsServer]) {
    server.on('connection', (socket: net.Socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
  }

  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(options.port ?? 0, options.listenHost ?? '127.0.0.1', resolve);
  });
  const address = proxy.address();
  if (address === null || typeof address === 'string') throw new Error('proxy has no TCP address');

  return {
    port: address.port,
    caCertPath: ca.caCertPath,
    requests: () => [...log],
    misses: () => log.filter((r) => r.outcome === 'miss'),
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await Promise.all([closeServer(proxy), closeServer(tlsServer)]);
      if (ca.ephemeral) rmSync(ca.dir, { recursive: true, force: true });
    },
  };
}

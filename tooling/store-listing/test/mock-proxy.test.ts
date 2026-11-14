import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockProxy } from '../src/mock/proxy';
import type { MockProxy } from '../src/mock/proxy';

let proxy: MockProxy;

beforeAll(async () => {
  proxy = await startMockProxy();
}, 60_000);

afterAll(async () => {
  await proxy.close();
});

/** CONNECT through the proxy; resolves with the proxy's status line + the live socket. */
function connect(authority: string): Promise<{ status: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, '127.0.0.1');
    socket.once('error', reject);
    socket.once('connect', () =>
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`),
    );
    let buf = '';
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('latin1');
      const end = buf.indexOf('\r\n\r\n');
      if (end === -1) return;
      socket.off('data', onData);
      resolve({ status: Number(/^HTTP\/1\.1 (\d{3})/.exec(buf)?.[1]), socket });
    };
    socket.on('data', onData);
  });
}

interface TlsResult {
  status: number;
  body: string;
  cert: X509Certificate;
}

async function httpsGet(host: string, target: string): Promise<TlsResult> {
  const { status, socket } = await connect(`${host}:443`);
  expect(status).toBe(200);
  return new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket,
      servername: host,
      ca: readFileSync(proxy.caCertPath),
    });
    secure.once('error', reject);
    let raw = '';
    secure.on('data', (d: Buffer) => (raw += d.toString('utf8')));
    secure.once('secureConnect', () => {
      secure.write(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    secure.once('end', () => {
      const cert = secure.getPeerX509Certificate();
      if (cert === undefined) return reject(new Error('no peer certificate'));
      const [head = '', ...rest] = raw.split('\r\n\r\n');
      resolve({
        status: Number(/^HTTP\/1\.1 (\d{3})/.exec(head)?.[1]),
        body: rest.join('\r\n\r\n'),
        cert,
      });
      secure.destroy();
    });
  });
}

describe('mock proxy', () => {
  it('terminates TLS for a mocked host and serves its page', async () => {
    const res = await httpsGet('tochka24.example', '/uk/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('<html lang="uk">');
  }, 60_000);

  it('issues leaf certs iOS accepts: SAN, serverAuth EKU, short validity, signed by the CA', async () => {
    const { cert } = await httpsGet('www.google.com', '/favicon.ico');
    expect(cert.subjectAltName).toBe('DNS:www.google.com');
    expect(cert.keyUsage).toContain('1.3.6.1.5.5.7.3.1');
    const days =
      (new Date(cert.validTo).getTime() - new Date(cert.validFrom).getTime()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(825);
    expect(cert.ca).toBe(false);
    const ca = new X509Certificate(readFileSync(proxy.caCertPath));
    expect(ca.ca).toBe(true);
    expect(cert.verify(ca.publicKey)).toBe(true);
  }, 60_000);

  it('records a request to a mocked host with no route as a miss', async () => {
    const before = proxy.misses().length;
    const res = await httpsGet('tochka24.example', '/definitely-not-routed');
    expect(res.status).toBe(404);
    const misses = proxy.misses();
    expect(misses).toHaveLength(before + 1);
    expect(misses.at(-1)).toMatchObject({
      host: 'tochka24.example',
      target: '/definitely-not-routed',
      outcome: 'miss',
    });
  }, 60_000);

  it('refuses CONNECT to a non-mocked host without counting a miss', async () => {
    const before = proxy.misses().length;
    const { status, socket } = await connect('gateway.icloud.example:443');
    socket.destroy();
    expect(status).toBe(403);
    expect(proxy.misses()).toHaveLength(before);
    expect(proxy.requests().at(-1)).toMatchObject({
      scheme: 'connect',
      host: 'gateway.icloud.example',
      outcome: 'passthroughRefused',
    });
  });

  it('serves plain-HTTP proxy requests for mocked hosts', async () => {
    const body = await new Promise<string>((resolve, reject) => {
      http
        .get(
          {
            host: '127.0.0.1',
            port: proxy.port,
            path: 'http://tochka24.example/uk/',
            headers: { Host: 'tochka24.example' },
          },
          (res) => {
            let data = '';
            res.on('data', (d: Buffer) => (data += d.toString('utf8')));
            res.on('end', () => resolve(data));
          },
        )
        .on('error', reject);
    });
    expect(body).toContain('<html lang="uk">');
    expect(proxy.requests().at(-1)).toMatchObject({ scheme: 'http', outcome: 'served' });
  });
});

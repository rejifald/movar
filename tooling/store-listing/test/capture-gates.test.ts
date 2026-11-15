import { describe, expect, it } from 'vitest';
import { evaluateGates, parseProxyLog, type ShotRecord } from '../src/capture/gates';
import {
  activeService,
  defaultInterface,
  manualProxyInstructions,
  parseProxyGet,
  planProxy,
  restoreCommands,
  serviceForInterface,
} from '../src/capture/proxy-state';

const SIZE = { width: 1320, height: 2868 };
const shot = (id: string, over: Partial<ShotRecord> = {}): ShotRecord => ({
  id,
  ...SIZE,
  appVersion: '1.9.3',
  appBuild: '1',
  ...over,
});
const base = { proxy: { requests: 3, misses: [] }, expectedIds: ['a', 'b'], size: SIZE };

describe('parseProxyLog', () => {
  it('counts JSON lines and collects misses in any shape', () => {
    const log = [
      'listening',
      JSON.stringify({ outcome: 'served', host: 'x' }),
      JSON.stringify({ outcome: 'miss', method: 'GET', host: 'tochka24.example', target: '/nope' }),
      JSON.stringify({ miss: true, url: '/y' }),
      '{broken',
    ].join('\n');
    const summary = parseProxyLog(log);
    expect(summary.requests).toBe(3);
    expect(summary.misses).toEqual(['GET tochka24.example /nope', '/y']);
  });
});

describe('evaluateGates', () => {
  it('passes a clean run', () => {
    expect(evaluateGates({ ...base, shots: [shot('a'), shot('b')] })).toEqual([]);
  });
  it('fails on a proxy miss', () => {
    const proxy = { requests: 1, misses: ['GET h /p'] };
    expect(evaluateGates({ ...base, proxy, shots: [shot('a'), shot('b')] })).toHaveLength(1);
  });
  it('fails on a wrong PNG size and a missing shot', () => {
    const failures = evaluateGates({ ...base, shots: [shot('a', { width: 1290 })] });
    expect(failures.join('|')).toMatch(/1290x2868/);
    expect(failures.join('|')).toMatch(/"b" was not captured/);
  });
  it('fails when the app version or build differs between shots', () => {
    const failures = evaluateGates({ ...base, shots: [shot('a'), shot('b', { appBuild: '2' })] });
    expect(failures.join('|')).toMatch(/differs between shots/);
  });
  // A proxied run whose proxy saw nothing means the log never reached the gate
  // (or Safari bypassed the proxy): every miss would pass unseen.
  it('fails a proxied run whose proxy recorded no requests', () => {
    const proxy = { requests: 0, misses: [] };
    const failures = evaluateGates({ ...base, proxy, shots: [shot('a'), shot('b')] });
    expect(failures.join('|')).toMatch(/recorded no requests/);
  });
  it('skips the proxy gate when there is no proxy (smoke)', () => {
    expect(evaluateGates({ ...base, proxy: null, shots: [shot('a'), shot('b')] })).toEqual([]);
  });
});

describe('proxy state planning', () => {
  const on = 'Enabled: Yes\nServer: 10.0.0.1\nPort: 3128\nAuthenticated Proxy Enabled: 0';
  const off = 'Enabled: No\nServer: \nPort: 0\nAuthenticated Proxy Enabled: 0';

  it('parses networksetup output', () => {
    expect(parseProxyGet(on)).toEqual({ enabled: true, server: '10.0.0.1', port: 3128 });
    expect(parseProxyGet(off)).toEqual({ enabled: false, server: '', port: 0 });
  });

  it('finds the service owning an interface', () => {
    const listing = [
      'An asterisk (*) denotes that a network service is disabled.',
      '(1) USB 10/100 LAN',
      '(Hardware Port: USB 10/100 LAN, Device: en5)',
      '',
      '(2) Wi-Fi',
      '(Hardware Port: Wi-Fi, Device: en0)',
    ].join('\n');
    expect(serviceForInterface(listing, 'en0')).toBe('Wi-Fi');
    expect(serviceForInterface(listing, 'en9')).toBeNull();
  });

  it('restores exactly the previous state', () => {
    const plan = planProxy('Wi-Fi', '127.0.0.1', 8877, {
      web: parseProxyGet(on),
      secure: parseProxyGet(off),
    });
    expect(plan.apply).toEqual([
      ['-setwebproxy', 'Wi-Fi', '127.0.0.1', '8877'],
      ['-setsecurewebproxy', 'Wi-Fi', '127.0.0.1', '8877'],
    ]);
    expect(plan.restore).toEqual([
      ['-setwebproxy', 'Wi-Fi', '10.0.0.1', '3128'],
      ['-setwebproxystate', 'Wi-Fi', 'on'],
      ['-setsecurewebproxystate', 'Wi-Fi', 'off'],
    ]);
    expect(
      restoreCommands('X', { web: parseProxyGet(off), secure: parseProxyGet(off) }),
    ).toHaveLength(2);
  });

  it('prints manual instructions instead of acting', () => {
    expect(manualProxyInstructions('Wi-Fi', '127.0.0.1', 8877)).toMatch(
      /setsecurewebproxy "Wi-Fi"/,
    );
  });
});

describe('activeService', () => {
  const order = [
    '(1) Wi-Fi',
    '(Hardware Port: Wi-Fi, Device: en0)',
    '(2) USB 10/100/1000 LAN',
    '(Hardware Port: USB, Device: en5)',
  ].join('\n');
  it('reads the default interface', () => {
    expect(defaultInterface('   route to: default\n  interface: en0\n')).toBe('en0');
    expect(defaultInterface('no route')).toBeNull();
  });
  it('maps the default route to its service', () => {
    expect(activeService('interface: en5', order)).toBe('USB 10/100/1000 LAN');
  });
  it('is null without an interface or a matching service', () => {
    expect(activeService('no route', order)).toBeNull();
    expect(activeService('interface: en9', order)).toBeNull();
  });
});

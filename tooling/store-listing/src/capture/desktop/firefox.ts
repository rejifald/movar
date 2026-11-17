/* eslint-disable @typescript-eslint/no-magic-numbers, sonarjs/no-os-command-from-path -- launch flags/timeouts inline on purpose; certutil is looked up on PATH */
/**
 * Real Firefox (a Mozilla release build, not Playwright's patched one), driven
 * over WebDriver BiDi, which Firefox speaks natively: no geckodriver.
 *
 * The profile is throwaway and prepared before launch: prefs (proxy, language,
 * first-run answers) in `user.js`, the mock CA in the profile's own NSS
 * database (`certutil`, nothing system-wide), and a userChrome.css that drops
 * the automated-session stripes from the address bar. Movar is installed as a
 * temporary add-on (`webExtension.install`) from a copy of the build whose
 * manifest pins its button to the toolbar; its settings are seeded through its
 * own options page at a fixed moz-extension:// UUID.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultSettings } from '@movar/settings';
import { freePort } from '../mock-proxy';
import { out } from '../sh';
import type { DomDriver } from './dom-shots';
import { WINDOW } from './geometry';
import type { DesktopLocale } from './locale';
import {
  FIREFOX_EXTENSION_UUID,
  FIREFOX_USER_CHROME_CSS,
  firefoxPrefs,
  geckoIdOf,
  userJs,
  withNavbarAction,
} from './profiles';

// ── a minimal WebDriver BiDi client ─────────────────────────────────────────

interface BidiMessage {
  id?: number;
  type?: 'success' | 'error' | 'event';
  result?: unknown;
  error?: string;
  message?: string;
}

export class Bidi {
  private next = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as BidiMessage;
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (waiter === undefined) return;
      this.pending.delete(message.id);
      if (message.type === 'error') {
        waiter.reject(new Error(`${message.error ?? 'error'}: ${message.message ?? ''}`));
      } else {
        waiter.resolve(message.result);
      }
    });
    socket.addEventListener('close', () => {
      for (const waiter of this.pending.values()) waiter.reject(new Error('BiDi socket closed'));
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<Bidi> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => {
        resolve();
      });
      socket.addEventListener('error', () => {
        reject(new Error(`cannot connect to ${url}`));
      });
    });
    return new Bidi(socket);
  }

  async send<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 60_000,
  ): Promise<T> {
    const id = this.next;
    this.next += 1;
    const result = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`BiDi ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close(): void {
    this.socket.close();
  }
}

/** Wrap an expression so its (awaited) value comes back as one JSON string. */
export function jsonExpression(expression: string): string {
  return `(async () => JSON.stringify(await (${expression})))()`;
}

interface EvaluateResult {
  type: 'success' | 'exception';
  result?: { type: string; value?: unknown };
  exceptionDetails?: { text?: string };
}

// ── launch ──────────────────────────────────────────────────────────────────

export interface FirefoxLaunch {
  readonly binary: string;
  readonly locale: DesktopLocale;
  readonly proxyPort: number;
  readonly caCertPath: string;
  /** Built firefox-mv3 directory, or null for the before pass (not installed). */
  readonly extension: string | null;
}

/** Default binary: $FIREFOX_BIN, else the platform's usual install path. */
export function defaultFirefoxBinary(): string {
  const fromEnv = process.env['FIREFOX_BIN'];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  return process.platform === 'darwin'
    ? '/Applications/Firefox.app/Contents/MacOS/firefox'
    : 'firefox';
}

function prepareProfile(dir: string, opts: FirefoxLaunch, geckoId: string | null): void {
  mkdirSync(path.join(dir, 'chrome'), { recursive: true });
  writeFileSync(
    path.join(dir, 'user.js'),
    userJs(firefoxPrefs({ locale: opts.locale, proxyPort: opts.proxyPort, geckoId })),
  );
  writeFileSync(path.join(dir, 'chrome/userChrome.css'), FIREFOX_USER_CHROME_CSS);
  out('certutil', ['-N', '-d', `sql:${dir}`, '--empty-password']);
  out('certutil', [
    '-A',
    '-d',
    `sql:${dir}`,
    '-n',
    'Movar store-listing mock CA',
    '-t',
    'C,,',
    '-i',
    opts.caCertPath,
  ]);
}

/** Copy of the build with the toolbar button pinned; returns its directory and gecko id. */
function stageExtension(source: string, into: string): { dir: string; geckoId: string } {
  const dir = path.join(into, 'extension');
  cpSync(source, dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  writeFileSync(manifestPath, JSON.stringify(withNavbarAction(manifest), null, 2));
  return { dir, geckoId: geckoIdOf(manifest) };
}

async function waitForBidiUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error(`firefox printed no BiDi endpoint in 60s:\n${buffer.slice(-2000)}`));
    }, 60_000);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const match = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(buffer);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stderr?.on('data', onData);
    child.stdout?.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`firefox exited early (${String(code)}):\n${buffer.slice(-2000)}`));
    });
  });
}

type Tree = (scope?: 'chrome') => Promise<{ context: string; url: string }[]>;
type EvaluateIn = <T>(context: string, expression: string) => Promise<T>;

/**
 * Seed Movar's settings from its own options page. WebDriver BiDi refuses to
 * navigate a tab to moz-extension://, so the browser window (chrome realm)
 * opens it, as the add-ons manager would; the page itself is then scripted
 * like any other.
 */
async function seedFirefoxSettings(bidi: Bidi, tree: Tree, evaluateIn: EvaluateIn): Promise<void> {
  const optionsUrl = `moz-extension://${FIREFOX_EXTENSION_UUID}/options.html`;
  const [window] = await tree('chrome');
  if (window === undefined) throw new Error('firefox has no browser window context');
  await evaluateIn(
    window.context,
    `(() => { gBrowser.selectedTab = gBrowser.addTab(${JSON.stringify(optionsUrl)}, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return true; })()`,
  );
  let options: string | undefined;
  for (let i = 0; i < 100 && options === undefined; i += 1) {
    options = (await tree()).find((c) => c.url === optionsUrl)?.context;
    if (options === undefined) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (options === undefined) throw new Error('firefox: Movar options page did not open');
  const settings = { ...defaultSettings, contentModification: true };
  const seeded = await evaluateIn<{ hosts: boolean; saved: boolean }>(
    options,
    `(async () => {
      for (let i = 0; i < 200 && document.readyState !== 'complete'; i++) await new Promise((r) => setTimeout(r, 25));
      const hosts = await browser.permissions.contains({ origins: ['<all_urls>'] });
      const s = ${JSON.stringify(settings)};
      await browser.storage.sync.clear();
      await browser.storage.sync.set({ settings: s });
      await new Promise((r) => setTimeout(r, 150));
      await browser.storage.sync.set({ settings: s });
      const back = await browser.storage.sync.get('settings');
      return { hosts, saved: back.settings?.contentModification === true };
    })()`,
  );
  await bidi.send('browsingContext.close', { context: options });
  if (!seeded.hosts)
    throw new Error('firefox: Movar was installed without its <all_urls> host permission');
  if (!seeded.saved) throw new Error('firefox: Movar settings did not persist');
}

export async function launchFirefox(opts: FirefoxLaunch): Promise<DomDriver> {
  const root = mkdtempSync(path.join(tmpdir(), 'movar-desktop-firefox-'));
  const profile = path.join(root, 'profile');
  mkdirSync(profile, { recursive: true });
  const staged = opts.extension === null ? null : stageExtension(opts.extension, root);
  prepareProfile(profile, opts, staged?.geckoId ?? null);

  const port = await freePort();
  const child = spawn(
    opts.binary,
    [
      '--remote-debugging-port',
      String(port),
      '--profile',
      profile,
      '--no-remote',
      '--new-instance',
      '--width',
      String(WINDOW.width),
      '--height',
      String(WINDOW.height),
      'about:blank',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MOZ_CRASHREPORTER_DISABLE: '1',
        MOZ_ENABLE_WAYLAND: '0',
        // BiDi may not navigate to moz-extension://; the options tab is opened from
        // the browser (chrome) realm instead, which needs system access.
        MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1',
      },
    },
  );
  const kill = (): void => {
    if (child.exitCode === null) child.kill('SIGTERM');
  };
  try {
    const endpoint = await waitForBidiUrl(child);
    const bidi = await Bidi.connect(`${endpoint.replace(/\/$/, '')}/session`);
    const session = await bidi.send<{ capabilities: { browserVersion?: string } }>('session.new', {
      capabilities: {},
    });
    const version = `firefox ${session.capabilities.browserVersion ?? '?'}`;

    const tree = async (scope?: 'chrome'): Promise<{ context: string; url: string }[]> =>
      (
        await bidi.send<{ contexts: { context: string; url: string }[] }>(
          'browsingContext.getTree',
          {
            maxDepth: 0,
            ...(scope === undefined ? {} : { 'moz:scope': scope }),
          },
        )
      ).contexts;
    const [first] = await tree();
    if (first === undefined) throw new Error('firefox has no browsing context');
    const main = first.context;

    const evaluateIn = async <T>(context: string, expression: string): Promise<T> => {
      const reply = await bidi.send<EvaluateResult>('script.evaluate', {
        expression: jsonExpression(expression),
        target: { context },
        awaitPromise: true,
        resultOwnership: 'none',
      });
      if (reply.type === 'exception') {
        throw new Error(`page script threw: ${reply.exceptionDetails?.text ?? '?'}`);
      }
      const raw = reply.result?.value;
      return (typeof raw === 'string' ? JSON.parse(raw) : undefined) as T;
    };
    const evaluate = async <T>(expression: string): Promise<T> => evaluateIn<T>(main, expression);
    const navigate = async (url: string): Promise<void> => {
      try {
        await bidi.send('browsingContext.navigate', { context: main, url, wait: 'interactive' });
      } catch (error) {
        // Movar redirecting mid-load aborts the original navigation: not an error.
        if (!/abort|cancel/i.test(error instanceof Error ? error.message : '')) throw error;
      }
    };
    const closeOthers = async (): Promise<void> => {
      for (const { context } of await tree()) {
        if (context !== main) await bidi.send('browsingContext.close', { context });
      }
    };

    if (staged !== null) {
      await bidi.send('webExtension.install', {
        extensionData: { type: 'path', path: staged.dir },
      });
      await seedFirefoxSettings(bidi, tree, evaluateIn);
      // Movar's onboarding tab opens on install; give it a moment, then close it.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await closeOthers();
    await bidi.send('browsingContext.activate', { context: main });

    return {
      browser: 'firefox',
      version,
      async goto(url) {
        await closeOthers();
        await navigate(url);
      },
      evaluate,
      async clickAt(x, y) {
        await bidi.send('input.performActions', {
          context: main,
          actions: [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                { type: 'pointerMove', x, y },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ],
        });
      },
      async screenshotViewport(file) {
        const shot = await bidi.send<{ data: string }>('browsingContext.captureScreenshot', {
          context: main,
        });
        writeFileSync(file, Buffer.from(shot.data, 'base64'));
      },
      async close() {
        await bidi.send('session.end').catch(() => null); // the browser may already be gone
        bidi.close();
        kill();
        await new Promise((resolve) => setTimeout(resolve, 500));
        rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    kill();
    throw error;
  }
}

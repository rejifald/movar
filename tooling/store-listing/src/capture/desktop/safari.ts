/* eslint-disable @typescript-eslint/no-magic-numbers, sonarjs/no-os-command-from-path, no-console -- orchestration: shells out to open/screencapture/security/defaults by name; waits are inline on purpose */
/**
 * Real Safari on a macOS runner, with the real Movar.app.
 *
 * Safari offers no page-script channel we can open unattended (`safaridriver`
 * sessions fail on the runner; "Allow JavaScript from Apple Events" is a
 * protected Safari setting), so everything goes through the accessibility API,
 * like the phone set: a small Swift helper (`safari/ax.swift`, compiled per run)
 * reads the window's web-area texts and frames and presses controls; AppleScript
 * navigates and sizes the window; `screencapture -l` grabs the window alone.
 *
 * Everything that changes the machine (display mode, System keychain trust,
 * system proxy, AppleLanguages, /Applications) happens ONLY under CI=true on an
 * ephemeral runner, is registered for restore before it is applied, and is
 * refused anywhere else (run.ts).
 */
import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { defaultSettings } from '@movar/settings';
import { PACKAGE_ROOT } from '../build';
import { hostSettingsSummary } from '../gates';
import { sleepSync } from '../retry';
import { log, out } from '../sh';
import type { Locale, ShotExpectation } from '../shots';
import type { PhaseResult } from './dom-shots';
import {
  assertCaptureSize,
  captureScale,
  chromeTopFromFrames,
  largestWindow,
  WINDOW,
} from './geometry';
import type { Rect } from './geometry';
import type { DesktopLocale } from './locale';
import type { DesktopPhase } from './plan';

const SAFARI = 'com.apple.Safari';
const HOST_APP_BUNDLE = 'fyi.movar.safari';
const APP_GROUP = 'group.fyi.movar.safari';
/** Host app UI labels, read in English (the host app is launched with `-AppleLanguages (en)`). */
const HOST_SIDEBAR_HIDE_CONTENT = 'sidebar.hideContent';
const HOST_CONTENT_TOGGLE = 'Hide content in blocked languages';
/** Buttons that close a sheet or alert without granting anything. */
const DISMISS_LABELS = String.raw`^(Not Now|Cancel|Close|OK|Later|Don.t Allow|Done)$`;
/** Buttons that confirm turning Movar on. */
const CONFIRM_LABELS = String.raw`^(Turn On|Enable|Allow|Always Allow.*|OK|Continue)$`;
/** Menu items, matched in English or Ukrainian (Safari's UI follows AppleLanguages). */
const SAFARI_QUIT = '^(Quit Safari|Вийти з Safari)$';
const HOST_QUIT = '^(Quit Movar|Вийти з Movar)$';
const SETTINGS_ITEM = '^(Settings…|Preferences…|Параметри…|Налаштування…)$';
/** Processes whose on-screen window is a system prompt that blocks automation. */
const SYSTEM_PROMPT_OWNERS = new Set([
  'UserNotificationCenter',
  'SecurityAgent',
  'CoreServicesUIAgent',
  'tccd',
]);

/** The system-prompt owners among on-screen windows. */
export function systemPromptOwners(windows: readonly { owner: string }[]): string[] {
  return [...new Set(windows.map((w) => w.owner).filter((o) => SYSTEM_PROMPT_OWNERS.has(o)))];
}

/** Top of the Safari window, below the menu bar (points). */
const WINDOW_TOP = 40;

type Cleanup = () => void;

// ── machine setup (CI only; the caller enforces that) ───────────────────────

/** 1920×1080 on the runner's virtual display (it boots at 1024×768). */
export function setDisplayMode(): void {
  let listing: string;
  try {
    listing = out('displayplacer', ['list']);
  } catch {
    throw new Error('displayplacer is not installed (the workflow installs it)');
  }
  const id = /Persistent screen id:\s*(\S+)/.exec(listing)?.[1];
  if (id === undefined) throw new Error(`displayplacer lists no screen:\n${listing}`);
  for (const mode of ['res:1920x1080 hz:60 color_depth:8 scaling:off', 'res:1920x1080']) {
    try {
      out('displayplacer', [`id:${id} ${mode}`]);
      log(`▸ display ${id} → ${mode}`);
      sleepSync(2000);
      return;
    } catch {
      // try the next spelling
    }
  }
  throw new Error('could not set the display to 1920x1080');
}

/** Trust the mock CA in the System keychain; returns the removal. */
export function trustCa(caCertPath: string): Cleanup {
  const sha1 = new X509Certificate(readFileSync(caCertPath)).fingerprint.replaceAll(':', '');
  out('sudo', [
    '-n',
    'security',
    'add-trusted-cert',
    '-d',
    '-r',
    'trustRoot',
    '-k',
    '/Library/Keychains/System.keychain',
    caCertPath,
  ]);
  log('▸ mock CA trusted in the System keychain');
  return () => {
    out('sudo', [
      '-n',
      'security',
      'delete-certificate',
      '-Z',
      sha1,
      '/Library/Keychains/System.keychain',
    ]);
    log('▸ mock CA removed from the System keychain');
  };
}

/** Set the user's AppleLanguages (Safari UI, Accept-Language, the extension's locale); returns the restore. */
export function setAppleLanguages(locale: DesktopLocale): Cleanup {
  let previous: string | null = null;
  try {
    previous = out('defaults', ['export', '-g', '-']);
  } catch {
    previous = null;
  }
  const hadLanguages = previous?.includes('<key>AppleLanguages</key>') ?? false;
  const before = hadLanguages ? out('defaults', ['read', '-g', 'AppleLanguages']) : null;
  out('defaults', ['write', '-g', 'AppleLanguages', '-array', ...locale.appleLanguages]);
  log(`▸ AppleLanguages → ${locale.appleLanguages.join(', ')}`);
  return () => {
    if (before === null) {
      out('defaults', ['delete', '-g', 'AppleLanguages']);
    } else {
      // `defaults read` prints a plist array: ( "uk-UA", en ).
      const values = before
        .replaceAll(/[()",]/g, ' ')
        .split(/\s+/)
        .filter((v) => v !== '');
      out('defaults', ['write', '-g', 'AppleLanguages', '-array', ...values]);
    }
    log('▸ AppleLanguages restored');
  };
}

/** Copy the app into /Applications (Safari only lists extensions of registered apps). */
export function installApp(appPath: string): string {
  const target = '/Applications/Movar.app';
  if (path.resolve(appPath) !== target) {
    out('sudo', ['-n', 'rm', '-rf', target]);
    out('sudo', ['-n', 'ditto', appPath, target]);
  }
  out(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', target],
  );
  const appex = path.join(target, 'Contents/PlugIns');
  if (existsSync(appex)) {
    for (const plugin of out('ls', [appex]).split('\n').filter(Boolean)) {
      out('pluginkit', ['-a', path.join(appex, plugin)]);
    }
  }
  log(`▸ ${target} registered`);
  return target;
}

// ── accessibility helper ────────────────────────────────────────────────────

/** Compile `safari/ax.swift` once per run into the package cache. */
export function buildAxHelper(): string {
  const source = path.join(import.meta.dirname, 'safari/ax.swift');
  const binary = path.join(PACKAGE_ROOT, '.cache/movar-ax');
  mkdirSync(path.dirname(binary), { recursive: true });
  out('xcrun', ['swiftc', '-O', source, '-o', binary]);
  return binary;
}

interface Snapshot {
  window: Rect | null;
  webArea: Rect | null;
  /** The web area's AXURL: the page Safari shows. */
  url: string | null;
  texts: string[];
}

interface ActResult {
  labels: string[];
  performed: boolean;
  before: number | null;
  after: number | null;
}

/** Full-match test, Maestro semantics (the phone set's expectations are full-match regexes). */
export function fullMatch(pattern: string, text: string): boolean {
  return new RegExp(`^(?:${pattern})$`, 's').test(text);
}

/** Visible matches some text; absent matches none. */
export function axHolds(texts: readonly string[], expect: ShotExpectation): string[] {
  const failures: string[] = [];
  if (!texts.some((t) => fullMatch(expect.visible, t)))
    failures.push(`nothing reads /${expect.visible}/`);
  const bad = texts.find((t) => fullMatch(expect.absent, t));
  if (bad !== undefined) failures.push(`"${bad}" is on screen (must be absent)`);
  return failures;
}

export class SafariUi {
  constructor(
    private readonly ax: string,
    private readonly debugDir: string,
  ) {}

  private run(args: string[]): string {
    return out(this.ax, args);
  }

  act(bundle: string, flags: string[]): ActResult {
    return JSON.parse(this.run(['act', bundle, ...flags])) as ActResult;
  }

  snapshot(): Snapshot {
    return JSON.parse(this.run(['snapshot', SAFARI])) as Snapshot;
  }

  private shots = 0;

  /**
   * Evidence of what is on screen right now: a full-screen screenshot and the
   * AX tree of `bundle`, numbered in step order in the debug dir. Never throws.
   */
  evidence(name: string, bundle: string = SAFARI): void {
    this.shots += 1;
    const stem = `${String(this.shots).padStart(2, '0')}-${name}`;
    try {
      mkdirSync(this.debugDir, { recursive: true });
      out('screencapture', ['-x', path.join(this.debugDir, `${stem}.png`)]);
    } catch (error) {
      console.error(`  (no screenshot: ${String(error)})`);
    }
    this.dump(bundle, stem);
  }

  /**
   * Close any sheet or alert Safari raised on its own (a new-extension notice,
   * a first-run sheet): a modal blocks every AppleEvent to Safari (CI run
   * 44086919439: `set bounds` timed out, -1712). `labels` picks the button.
   */
  answerDialogs(labels: string = DISMISS_LABELS): void {
    for (let i = 0; i < 4; i += 1) {
      const pressed = ['AXSheet', 'AXDialog', 'AXSystemDialog'].some((container) => {
        try {
          const r = this.act(SAFARI, [
            '--action',
            'press',
            '--in-role',
            container,
            '--role',
            'AXButton',
            '--match',
            labels,
          ]);
          log(`▸ Safari ${container}: pressed ${r.labels.join(' / ')}`);
          return true;
        } catch {
          return false;
        }
      });
      if (!pressed) return;
      sleepSync(1000);
    }
  }

  /** Save the AX tree of `bundle` next to the run, for a failed step. */
  dump(bundle: string, name: string): void {
    try {
      const { tree } = JSON.parse(this.run(['dump', bundle])) as { tree: string };
      mkdirSync(this.debugDir, { recursive: true });
      const file = path.join(this.debugDir, `${name}.txt`);
      writeFileSync(file, tree);
      console.error(`  AX tree saved: ${file}`);
    } catch (error) {
      console.error(`  (no AX dump: ${String(error)})`);
    }
  }

  /** Retry an AX step (the UI may still be animating), dumping the tree on the last failure. */
  step<T>(name: string, bundle: string, fn: () => T, attempts = 8): T {
    let last: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return fn();
      } catch (error) {
        last = error;
        sleepSync(1000);
      }
    }
    this.evidence(`failed-${name}`, bundle);
    const prompts = this.systemPrompts();
    const blocked = prompts.length > 0 ? ` (system prompt on screen: ${prompts.join(', ')})` : '';
    throw new Error(`${name}: ${last instanceof Error ? last.message : String(last)}${blocked}`);
  }

  // ── Safari process ──

  /**
   * Quit `bundle` through its own menu (AX, no AppleEvent), else SIGTERM.
   * `quitLabel` matches the Quit menu item in the app's UI language.
   */
  private quitApp(bundle: string, processName: string, quitLabel: string): void {
    if (!isRunning(processName)) return;
    try {
      this.act(bundle, ['--action', 'press', '--role', 'AXMenuItem', '--match', quitLabel]);
    } catch {
      // no menu (a modal is up): fall through to the signal
    }
    for (let i = 0; i < 20 && isRunning(processName); i += 1) sleepSync(500);
    if (isRunning(processName)) {
      out('killall', [processName]);
      for (let i = 0; i < 20 && isRunning(processName); i += 1) sleepSync(500);
    }
  }

  quitSafari(): void {
    this.quitApp(SAFARI, 'Safari', SAFARI_QUIT);
  }

  /**
   * Launch Safari fresh, optionally straight at `url`; `languages` overrides
   * AppleLanguages for this launch only. Nothing here (or anywhere in this
   * file) sends Safari an AppleEvent: the runner's process has no Automation
   * consent for Safari, and the consent prompt blocks every event (CI run
   * 44103936330, -1712). Navigation is a fresh launch at the URL; the window is
   * placed through the accessibility API.
   */
  launchSafari(languages?: readonly string[], url?: string): void {
    this.quitSafari();
    const override =
      languages === undefined ? [] : ['--args', '-AppleLanguages', `(${languages.join(',')})`];
    out('open', ['-a', 'Safari', ...(url === undefined ? [] : [url]), ...override]);
    for (let i = 0; i < 40 && !isRunning('Safari'); i += 1) sleepSync(500);
    sleepSync(3000);
    this.checkForSystemPrompt('safari-launched');
    this.answerDialogs();
  }

  /**
   * A system prompt (TCC consent, keychain) on screen: evidence, and a warning;
   * the step that it blocks then fails naming it rather than hanging.
   */
  private checkForSystemPrompt(name: string): void {
    const prompts = this.systemPrompts();
    this.evidence(prompts.length > 0 ? `${name}-system-prompt` : name);
    if (prompts.length > 0) log(`▸ WARNING: system prompt on screen: ${prompts.join(', ')}`);
  }

  /** Owners of on-screen system prompt windows (empty when none). */
  systemPrompts(): string[] {
    try {
      const { windows } = JSON.parse(this.run(['onscreen'])) as {
        windows: { owner: string; layer: number }[];
      };
      return systemPromptOwners(windows);
    } catch {
      return [];
    }
  }

  /** The one Safari window at WINDOW size and position, other windows closed (AX). */
  fitWindow(): void {
    const bounds = [0, WINDOW_TOP, WINDOW.width, WINDOW.height].map(String);
    this.step('fit-window', SAFARI, () => {
      const { window } = JSON.parse(this.run(['fit', SAFARI, ...bounds])) as {
        window: Rect | null;
      };
      if (window?.width !== WINDOW.width || window.height !== WINDOW.height) {
        throw new Error(`window is ${JSON.stringify(window)}`);
      }
    });
    this.evidence('window-ready');
  }

  /** Open `url` in a fresh Safari window at WINDOW size. */
  openAt(url: string): void {
    this.launchSafari(undefined, url);
    this.fitWindow();
  }

  currentUrl(): string {
    return this.snapshot().url ?? '';
  }

  // ── Safari settings ──

  private openSettings(pane: string): void {
    this.step('settings-open', SAFARI, () =>
      this.act(SAFARI, ['--action', 'press', '--role', 'AXMenuItem', '--match', SETTINGS_ITEM]),
    );
    sleepSync(1500);
    this.step(`settings-${pane}`, SAFARI, () =>
      this.act(SAFARI, ['--action', 'press', '--role', 'AXButton', '--match', `^${pane}$`]),
    );
    sleepSync(1500);
    this.evidence(`settings-${pane}`);
  }

  private closeSettings(): void {
    this.quitSafari();
  }

  /** Tick or untick Movar in Settings ▸ Extensions (idempotent). Safari must run in English. */
  setExtensionEnabled(on: boolean): void {
    this.openSettings('Extensions');
    const result = this.step(`extension-${on ? 'on' : 'off'}`, SAFARI, () => {
      const r = this.act(SAFARI, [
        '--action',
        on ? 'ensure-on' : 'ensure-off',
        '--in-role',
        'AXRow',
        '--in-match',
        'Movar',
        '--role',
        'AXCheckBox',
      ]);
      // Enabling can raise a confirmation sheet; the box only reads 1 once it is answered.
      if (on) {
        sleepSync(800);
        this.answerDialogs(CONFIRM_LABELS);
      }
      const now = this.act(SAFARI, [
        '--action',
        'read',
        '--in-role',
        'AXRow',
        '--in-match',
        'Movar',
        '--role',
        'AXCheckBox',
      ]);
      if (now.after !== (on ? 1 : 0)) throw new Error(`checkbox reads ${String(now.after)}`);
      return { ...r, after: now.after };
    });
    this.evidence(`extension-${on ? 'on' : 'off'}`);
    log(`▸ Safari ▸ Extensions ▸ Movar: ${String(result.before)} → ${String(result.after)}`);
    if (on) {
      // Website access: Websites ▸ Movar ▸ "When visiting other websites" → Allow.
      this.step('websites-pane', SAFARI, () =>
        this.act(SAFARI, ['--action', 'press', '--role', 'AXButton', '--match', '^Websites$']),
      );
      sleepSync(1500);
      this.step('websites-movar-row', SAFARI, () =>
        this.act(SAFARI, [
          '--action',
          'select',
          '--in-role',
          'AXRow',
          '--in-match',
          'Movar',
          '--role',
          'AXRow',
        ]),
      );
      sleepSync(800);
      this.step('websites-other-popup', SAFARI, () =>
        this.act(SAFARI, ['--action', 'press', '--role', 'AXPopUpButton', '--last']),
      );
      sleepSync(600);
      this.step('websites-allow', SAFARI, () =>
        this.act(SAFARI, ['--action', 'press', '--role', 'AXMenuItem', '--match', '^Allow$']),
      );
      log('▸ Safari ▸ Websites ▸ Movar ▸ other websites: Allow');
      this.evidence('websites-allow');
    }
    this.closeSettings();
  }

  // ── host app ──

  /** Turn content hiding on in the host app (its real toggle); falls back to the App Group store. */
  enableContentHiding(appPath: string): void {
    out('open', ['-a', appPath, '--args', '-AppleLanguages', '(en)']);
    sleepSync(5000);
    try {
      this.step('host-sidebar', HOST_APP_BUNDLE, () => {
        try {
          return this.act(HOST_APP_BUNDLE, [
            '--action',
            'press',
            '--identifier',
            HOST_SIDEBAR_HIDE_CONTENT,
          ]);
        } catch {
          return this.act(HOST_APP_BUNDLE, [
            '--action',
            'select',
            '--identifier',
            HOST_SIDEBAR_HIDE_CONTENT,
          ]);
        }
      });
      sleepSync(1500);
      const r = this.step('host-toggle', HOST_APP_BUNDLE, () => {
        const res = this.act(HOST_APP_BUNDLE, [
          '--action',
          'ensure-on',
          '--role',
          'AXCheckBox',
          '--match',
          HOST_CONTENT_TOGGLE,
        ]);
        if (res.after !== 1) throw new Error(`toggle reads ${String(res.after)}`);
        return res;
      });
      log(`▸ host app ▸ ${HOST_CONTENT_TOGGLE}: ${String(r.before)} → ${String(r.after)}`);
      this.evidence('host-content-hiding', HOST_APP_BUNDLE);
    } catch (error) {
      log(
        `▸ host app toggle not reachable (${String(error)}); writing the App Group store instead`,
      );
      writeAppGroupContentHiding();
    }
    this.quitApp(HOST_APP_BUNDLE, 'Movar', HOST_QUIT);
    sleepSync(1500);
    log(`▸ host settings: ${hostSettingsSummary(readAppGroup())}`);
  }

  // ── shots ──

  /** Open the phase, assert its state over AX + URL, press if asked, capture the window. */
  capturePhase(phase: DesktopPhase, locale: Locale, file: string, what: string): PhaseResult {
    this.openAt(phase.url);
    const url = new RegExp(phase.urlPattern);
    if (phase.click !== undefined) {
      const press = [
        '--action',
        'press',
        '--in-role',
        'AXWebArea',
        '--role',
        'AXButton',
        '--match',
        phase.click.axLabel,
      ];
      this.waitFor(what, phase, locale, false);
      this.step(`${what}-press`, SAFARI, () => this.act(SAFARI, press));
      sleepSync(800);
    }
    this.waitFor(what, phase, locale, true);
    sleepSync(900);
    const snap = this.snapshot();
    const late = [
      ...axHolds(snap.texts, phase.ax[locale]),
      ...(url.test(this.currentUrl()) ? [] : ['URL changed']),
    ];
    if (late.length > 0)
      throw new Error(`${what}: state lost before the shutter: ${late.join('; ')}`);
    if (snap.window === null || snap.webArea === null)
      throw new Error(`${what}: no Safari web area`);

    const windows = (
      JSON.parse(out(this.ax, ['windows', SAFARI])) as { windows: (Rect & { id: number })[] }
    ).windows;
    const window = largestWindow(windows);
    out('screencapture', ['-o', '-x', '-l', String(window.id), file]);
    const size = pngSize(file);
    const scale = captureScale(size.width, window.width);
    assertCaptureSize(size, scale);
    return { ...size, chromeTop: chromeTopFromFrames(snap.window, snap.webArea, scale) };
  }

  private waitFor(what: string, phase: DesktopPhase, locale: Locale, final: boolean): void {
    const url = new RegExp(phase.urlPattern);
    const deadline = Date.now() + 60_000;
    let last: string[] = [];
    while (Date.now() < deadline) {
      try {
        const current = this.currentUrl();
        const snap = this.snapshot();
        last = [
          ...(url.test(current) ? [] : [`URL ${current} !~ /${phase.urlPattern}/`]),
          ...phaseAxFailures(snap.texts, phase, locale, final),
        ];
        if (last.length === 0) return;
      } catch (error) {
        last = [String(error)];
      }
      sleepSync(1000);
    }
    this.dump(SAFARI, `${what}-${final ? 'final' : 'ready'}`);
    throw new Error(`${what}: state not reached: ${last.join('; ')}`);
  }
}

/** What the accessibility texts say is still wrong: before a press (its control is there) or at the end. */
export function phaseAxFailures(
  texts: readonly string[],
  phase: DesktopPhase,
  locale: Locale,
  final: boolean,
): string[] {
  const reads = (pattern: string): boolean => texts.some((t) => fullMatch(pattern, t));
  if (!final) {
    const label = phase.click?.axLabel;
    return label === undefined || reads(label) ? [] : [`no control reads /${label}/`];
  }
  const effect = phase.click?.axEffect;
  return [
    ...axHolds(texts, phase.ax[locale]),
    ...(effect === undefined || reads(effect) ? [] : [`after the press nothing reads /${effect}/`]),
  ];
}

function isRunning(name: string): boolean {
  try {
    out('pgrep', ['-x', name]);
    return true;
  } catch {
    return false;
  }
}

function pngSize(file: string): { width: number; height: number } {
  // sharp is async; the Safari run is a sequential script, so read the IHDR directly.
  const header = readFileSync(file).subarray(16, 24);
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

function appGroupPlist(): string {
  return path.join(
    homedir(),
    'Library/Group Containers',
    APP_GROUP,
    'Library/Preferences',
    APP_GROUP,
  );
}

function readAppGroup(): string {
  try {
    return out('defaults', ['read', appGroupPlist()]);
  } catch (error) {
    return `unreadable (${String(error)})`;
  }
}

/** The extension adopts host-app settings when `settingsRev` moves (MovarAppGroup contract). */
function writeAppGroupContentHiding(): void {
  const plist = appGroupPlist();
  let current: Record<string, unknown> = { ...defaultSettings };
  let rev = 0;
  try {
    current = JSON.parse(out('defaults', ['read', plist, 'settings'])) as Record<string, unknown>;
    rev = Number.parseInt(out('defaults', ['read', plist, 'settingsRev']).trim(), 10) || 0;
  } catch {
    // nothing stored yet
  }
  out('defaults', [
    'write',
    plist,
    'settings',
    '-string',
    JSON.stringify({ ...current, contentModification: true }),
  ]);
  out('defaults', ['write', plist, 'settingsRev', '-int', String(rev + 1)]);
}

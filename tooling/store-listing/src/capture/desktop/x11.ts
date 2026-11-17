/* eslint-disable @typescript-eslint/no-magic-numbers, sonarjs/no-os-command-from-path -- shells out to Xvfb/xdotool/ImageMagick by name; waits are inline on purpose */
/**
 * Linux display plumbing: a private Xvfb screen exactly the size of the capture
 * window (started here when no DISPLAY is set, so a run needs no wrapper), and
 * the capture itself. There is no window manager, so a client window's own grab
 * is unreliable; instead the browser is pinned to (0,0) at WINDOW size, which
 * fills the screen, and the screen is grabbed. dom-shots.ts then proves from the
 * page (`outerWidth`/`screenX`…) that the browser really filled it.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { WindowCapturer } from './dom-shots';
import {
  firstFreeDisplay,
  hasDisplay,
  needsFit,
  pickBrowserWindow,
  pollFor,
  x11LockPath,
  x11SocketPath,
  xvfbArgs,
} from './decisions';
import { LINUX_SCALE, parseXdotoolGeometry, XVFB_SCREEN } from './geometry';
import type { Rect } from './geometry';
import { out } from '../sh';

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/** Start Xvfb on the first free display number and export DISPLAY; returns its stopper. */
export async function ensureDisplay(): Promise<() => void> {
  if (hasDisplay(process.env))
    return () => {
      /* DISPLAY was already set: nothing was started */
    };
  const display = firstFreeDisplay(
    (n) => existsSync(x11SocketPath(n)) || existsSync(x11LockPath(n)),
  );
  const xvfb: ChildProcess = spawn('Xvfb', xvfbArgs(display), { stdio: 'ignore' });
  const socket = x11SocketPath(display);
  await pollFor(() => (existsSync(socket) ? true : null), 50, 100, sleep);
  if (!existsSync(socket)) throw new Error('Xvfb did not come up');
  process.env['DISPLAY'] = `:${display}`;
  return () => {
    xvfb.kill('SIGTERM');
  };
}

function visibleWindows(): (Rect & { id: number })[] {
  let ids: string[];
  try {
    ids = out('xdotool', ['search', '--onlyvisible', '--name', '.*']).split('\n').filter(Boolean);
  } catch {
    return []; // xdotool exits 1 when nothing matches
  }
  return ids.flatMap((id) => {
    try {
      return [parseXdotoolGeometry(out('xdotool', ['getwindowgeometry', '--shell', id]))];
    } catch {
      return []; // the window went away between search and geometry
    }
  });
}

/** Grab the whole (WINDOW-sized) screen. */
export function grabScreen(file: string): void {
  out('import', ['-window', 'root', `png:${file}`]);
}

/** `xwininfo -root -tree`: every window on the display, for a failed run's debug dir. */
export function windowTree(): string {
  return out('xwininfo', ['-root', '-tree']);
}

/**
 * Capturer for the browser: every big visible window pinned to (0,0) filling
 * the screen (WINDOW × LINUX_SCALE device px), the largest focused (so the toolbar is drawn active, not greyed out),
 * then the screen grabbed.
 */
export function x11Capturer(): WindowCapturer {
  return {
    scale: LINUX_SCALE,
    async capture(file: string): Promise<void> {
      const window = await pollFor(() => pickBrowserWindow(visibleWindows()), 50, 200, sleep);
      if (window === null) throw new Error('no browser window on the X display');
      const big = visibleWindows().filter((w) => w.width > 400 && w.height > 300);
      const misplaced = big.filter((w) => needsFit(w));
      for (const w of misplaced) {
        const id = String(w.id);
        out('xdotool', ['windowsize', id, String(XVFB_SCREEN.width), String(XVFB_SCREEN.height)]);
        out('xdotool', ['windowmove', id, '0', '0']);
      }
      if (misplaced.length > 0) await sleep(800); // let the browser relayout at the new size
      out('xdotool', ['windowfocus', String(window.id)]);
      await sleep(200);
      grabScreen(file);
    },
  };
}

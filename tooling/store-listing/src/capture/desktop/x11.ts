/* eslint-disable @typescript-eslint/no-magic-numbers, sonarjs/no-os-command-from-path -- shells out to Xvfb/xdotool/ImageMagick by name; waits are inline on purpose */
/**
 * Linux display plumbing: a private Xvfb screen (started here when no DISPLAY
 * is set, so a run needs no wrapper), and window capture of the browser's one
 * top-level window with xdotool + ImageMagick `import`. There is no window
 * manager on the screen, so nothing but the browser's own frame is drawn.
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
import { parseXdotoolGeometry, WINDOW } from './geometry';
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

/**
 * Capturer for the browser's main window: found as the largest visible window,
 * pinned at (0,0) and WINDOW size, focused (so the toolbar is drawn active, not
 * greyed out), then grabbed with `import -window`, which reads only that window.
 */
export function x11Capturer(): WindowCapturer {
  return {
    async capture(file: string): Promise<void> {
      const window = await pollFor(() => pickBrowserWindow(visibleWindows()), 50, 200, sleep);
      if (window === null) throw new Error('no browser window on the X display');
      const id = String(window.id);
      if (needsFit(window)) {
        out('xdotool', ['windowsize', '--sync', id, String(WINDOW.width), String(WINDOW.height)]);
        out('xdotool', ['windowmove', '--sync', id, '0', '0']);
        await sleep(600); // let the browser relayout at the new size
      }
      out('xdotool', ['windowfocus', '--sync', id]);
      await sleep(200);
      out('import', ['-window', id, `png:${file}`]);
    },
  };
}

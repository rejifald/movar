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
import { largestWindow, parseXdotoolGeometry, WINDOW, XVFB_SCREEN } from './geometry';
import type { Rect } from './geometry';
import { out } from '../sh';

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/** Start Xvfb on the first free display number and export DISPLAY; returns its stopper. */
export async function ensureDisplay(): Promise<() => void> {
  if (process.env['DISPLAY'] !== undefined && process.env['DISPLAY'] !== '')
    return () => {
      /* DISPLAY was already set: nothing was started */
    };
  let display = 99;
  while (existsSync(`/tmp/.X11-unix/X${display}`) || existsSync(`/tmp/.X${display}-lock`))
    display += 1;
  const { width, height, depth } = XVFB_SCREEN;
  const xvfb: ChildProcess = spawn(
    'Xvfb',
    [
      `:${display}`,
      '-screen',
      '0',
      `${width}x${height}x${depth}`,
      '-nolisten',
      'tcp',
      '-dpi',
      '96',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 50 && !existsSync(`/tmp/.X11-unix/X${display}`); i += 1) await sleep(100);
  if (!existsSync(`/tmp/.X11-unix/X${display}`)) throw new Error('Xvfb did not come up');
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
      let window: (Rect & { id: number }) | null = null;
      for (let i = 0; i < 50 && window === null; i += 1) {
        const all = visibleWindows().filter((w) => w.width > 400 && w.height > 300);
        window = all.length > 0 ? largestWindow(all) : null;
        if (window === null) await sleep(200);
      }
      if (window === null) throw new Error('no browser window on the X display');
      const id = String(window.id);
      if (
        window.width !== WINDOW.width ||
        window.height !== WINDOW.height ||
        window.x !== 0 ||
        window.y !== 0
      ) {
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

// scripts/lib/asc-screenshots.mjs
//
// App Store screenshots, from committed PNGs to a version's screenshot sets.
// Zero npm dependencies; Node 22 built-ins only. Used by scripts/apple-submit.mjs.
//
// Two halves, kept apart so the logic is testable without a network:
//
//   1. LOCAL — `discoverScreenshots` reads
//      apps/extension/store-assets/screenshots/app-store/<display>/<locale>/*.png,
//      checks every PNG's pixel size against what Apple accepts for that display
//      type, and computes the MD5 + size App Store Connect asks for.
//   2. REMOTE — `replaceScreenshotSet` makes one localization's set for one
//      display type hold exactly those files, in filename order. Every ASC call
//      goes through an injected `api`, and every write through an injected
//      `write` that is a no-op under DRY_RUN — the same safety model as the rest
//      of apple-submit.mjs.
//
// The asset flow is Apple's documented one ("Uploading assets to App Store
// Connect"): reserve (POST /v1/appScreenshots) → PUT each uploadOperation's
// byte range to its pre-signed URL (no JWT) → commit (PATCH uploaded: true +
// the MD5 of the whole file) → poll assetDeliveryState until COMPLETE.
//
// NOTE: Apple marks the appScreenshots / appScreenshotSets resources deprecated
// (API 4.5) in favour of the App Asset Library and placements. They still work;
// this is the place to port when they stop.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import nodePath from 'node:path';

/** App Store Connect's per-set limit. */
export const MAX_PER_SET = 10;

/** Both orientations of each portrait size. */
const bothWays = (sizes) => sizes.flatMap(([w, h]) => [`${w}x${h}`, `${h}x${w}`]);

/**
 * Folder name → ASC display type, the platform it belongs to, and the pixel
 * sizes Apple accepts for it. A folder not listed here is an error, not
 * something to skip — a typo would otherwise silently publish nothing.
 */
export const DISPLAYS = {
  'iphone-6.9': {
    displayType: 'APP_IPHONE_67',
    platform: 'IOS',
    sizes: bothWays([
      [1320, 2868],
      [1290, 2796],
      [1260, 2736],
    ]),
  },
  'ipad-13': {
    displayType: 'APP_IPAD_PRO_3GEN_129',
    platform: 'IOS',
    sizes: bothWays([
      [2064, 2752],
      [2048, 2732],
    ]),
  },
  mac: {
    displayType: 'APP_DESKTOP',
    platform: 'MAC_OS',
    sizes: ['1280x800', '1440x900', '2560x1600', '2880x1800'],
  },
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height from a PNG's IHDR chunk. Throws on anything not a PNG. */
export function pngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.toString('latin1', 12, 16) !== 'IHDR'
  ) {
    throw new Error('not a PNG (bad signature or no IHDR chunk)');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** ASC localization locale → screenshot folder name: its language subtag. */
export const localeFolder = (ascLocale) =>
  String(ascLocale ?? '')
    .split(/[-_]/)[0]
    .toLowerCase();

const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

const subdirs = (dir) =>
  readdirSync(dir)
    .filter((name) => !name.startsWith('.') && statSync(nodePath.join(dir, name)).isDirectory())
    .toSorted();

/**
 * Read every committed screenshot under `root`.
 *
 * @returns {Array<{folder: string, displayType: string, platform: string,
 *   locales: Map<string, Array<{fileName: string, bytes: Buffer, fileSize: number, md5: string}>>}>}
 *   one entry per display folder that exists; a missing folder is skipped.
 */
export function discoverScreenshots(root) {
  if (!existsSync(root)) return [];
  const unknown = subdirs(root).filter((name) => !Object.hasOwn(DISPLAYS, name));
  if (unknown.length > 0) {
    throw new Error(
      `unknown screenshot display folder(s) ${unknown.join(', ')} in ${root} — expected one of ${Object.keys(DISPLAYS).join(', ')}`,
    );
  }

  const found = [];
  for (const [folder, spec] of Object.entries(DISPLAYS)) {
    const dir = nodePath.join(root, folder);
    if (!existsSync(dir)) continue;
    const locales = new Map();
    for (const locale of subdirs(dir)) {
      const localeDir = nodePath.join(dir, locale);
      const names = readdirSync(localeDir)
        .filter((n) => n.toLowerCase().endsWith('.png'))
        .toSorted();
      if (names.length === 0) continue;
      if (names.length > MAX_PER_SET) {
        throw new Error(
          `${folder}/${locale} has ${names.length} screenshots; App Store Connect takes at most ${MAX_PER_SET} per set`,
        );
      }
      locales.set(
        locale,
        names.map((fileName) => {
          const bytes = readFileSync(nodePath.join(localeDir, fileName));
          let size;
          try {
            const { width, height } = pngDimensions(bytes);
            size = `${width}x${height}`;
          } catch (error) {
            throw new Error(`${folder}/${locale}/${fileName}: ${error.message}`, { cause: error });
          }
          if (!spec.sizes.includes(size)) {
            throw new Error(
              `${folder}/${locale}/${fileName} is ${size}; ${spec.displayType} accepts ${spec.sizes.join(', ')}`,
            );
          }
          return { fileName, bytes, fileSize: bytes.length, md5: md5(bytes) };
        }),
      );
    }
    found.push({ folder, displayType: spec.displayType, platform: spec.platform, locales });
  }
  return found;
}

/**
 * Does the remote set already hold exactly these files, in this order?
 *
 * @param {Array<{attributes?: {sourceFileChecksum?: string|null,
 *   assetDeliveryState?: {state?: string}}}>} existing  the set's screenshots, in set order
 * @param {Array<{md5: string}>} local  the committed files, in upload order
 * @returns {{action: 'skip'|'replace', reason: string}}
 */
export function planScreenshotSet(existing, local) {
  if (existing.length !== local.length) {
    return {
      action: 'replace',
      reason: `set holds ${existing.length}, repo has ${local.length}`,
    };
  }
  const unfinished = existing.filter(
    (s) => s.attributes?.assetDeliveryState?.state !== 'COMPLETE',
  ).length;
  if (unfinished > 0) {
    return { action: 'replace', reason: `${unfinished} screenshot(s) never finished processing` };
  }
  const differs = local.findIndex((f, i) => existing[i].attributes?.sourceFileChecksum !== f.md5);
  if (differs !== -1) {
    return { action: 'replace', reason: `position ${differs + 1} differs` };
  }
  return { action: 'skip', reason: `already holds these ${local.length}, in order` };
}

const ok = (res, what) => {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${what} → ${res.status}${res.detail ? ` — ${res.detail}` : ''}`);
  }
  return res.body;
};

const describeAssetErrors = (state) =>
  (state?.errors ?? [])
    .map((e) => [e?.code, e?.description].filter(Boolean).join(': '))
    .join('; ') || 'no reason given';

/** Wait for every screenshot to finish processing at Apple. */
async function waitForDelivery(api, ids, { timeoutMs, pollMs }) {
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(ids);
  for (;;) {
    for (const id of pending) {
      const body = ok(await api.request(`/v1/appScreenshots/${id}`), `GET screenshot ${id}`);
      const state = body?.data?.attributes?.assetDeliveryState;
      if (state?.state === 'COMPLETE') pending.delete(id);
      else if (state?.state === 'FAILED') {
        const name = body?.data?.attributes?.fileName ?? id;
        throw new Error(`Apple failed to process ${name}: ${describeAssetErrors(state)}`);
      }
    }
    if (pending.size === 0) return;
    if (Date.now() > deadline) {
      throw new Error(
        `${pending.size} screenshot(s) still processing after ${Math.round(timeoutMs / 1000)}s — re-run; a rerun replaces the set again`,
      );
    }
    await api.sleep(pollMs);
  }
}

/** PUT each byte range Apple asked for to its pre-signed URL. */
async function uploadParts(api, file, operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error(`reservation for ${file.fileName} came back with no upload operations`);
  }
  for (const op of operations) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
    const res = await api.upload(op.url, {
      method: op.method ?? 'PUT',
      headers,
      body: file.bytes.subarray(op.offset, op.offset + op.length),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`uploading ${file.fileName} bytes ${op.offset}+${op.length} → ${res.status}`);
    }
  }
}

/**
 * Make one localization's screenshot set for one display type hold exactly
 * `files`, in order. Idempotent: a set that already matches is left alone.
 *
 * @param {object} args
 * @param {{request: (path: string, options?: object) => Promise<{status: number, detail: string, body: any}>,
 *   upload: (url: string, init: {method: string, headers: object, body: Buffer}) => Promise<{status: number}>,
 *   sleep: (ms: number) => Promise<void>}} args.api  ASC reads, raw blob uploads, and the poll delay
 * @param {(description: string, path: string, options: object) => Promise<any>} args.write
 *   performs an ASC write and returns its body — or logs "would …" and returns null in a dry run
 * @param {(msg: string) => void} [args.log]
 * @returns {Promise<{action: 'skip'|'replaced'|'dry-run', reason: string}>}
 */
export async function replaceScreenshotSet({
  api,
  write,
  log = () => {},
  localizationId,
  displayType,
  files,
  timeoutMs = 10 * 60_000,
  pollMs = 5_000,
}) {
  if (files.length === 0 || files.length > MAX_PER_SET) {
    throw new Error(`${displayType}: ${files.length} files; a set takes 1–${MAX_PER_SET}`);
  }

  const sets = ok(
    await api.request(
      `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?${new URLSearchParams({
        'filter[screenshotDisplayType]': displayType,
        limit: '10',
      })}`,
    ),
    `list ${displayType} screenshot sets`,
  );
  let set = (sets?.data ?? []).find((s) => s.attributes?.screenshotDisplayType === displayType);

  const existing = set
    ? (ok(
        await api.request(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`),
        `list ${displayType} screenshots`,
      )?.data ?? [])
    : [];

  const plan = planScreenshotSet(existing, files);
  if (plan.action === 'skip') {
    log(`  ${displayType}: ${plan.reason} — unchanged`);
    return plan;
  }
  log(`  ${displayType}: replacing (${plan.reason})`);

  if (!set) {
    const created = await write(`create ${displayType} screenshot set`, '/v1/appScreenshotSets', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: displayType },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: 'appStoreVersionLocalizations', id: localizationId },
            },
          },
        },
      },
    });
    set = created?.data;
  }

  for (const old of existing) {
    await write(
      `delete old screenshot ${old.attributes?.fileName ?? old.id}`,
      `/v1/appScreenshots/${old.id}`,
      { method: 'DELETE' },
    );
  }

  const ids = [];
  for (const file of files) {
    if (!set) {
      // Dry run with no set yet: nothing to reserve against.
      log(`  [dry-run] would upload ${file.fileName} (${file.fileSize} bytes)`);
      continue;
    }
    const reserved = await write(`reserve ${file.fileName}`, '/v1/appScreenshots', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshots',
          attributes: { fileName: file.fileName, fileSize: file.fileSize },
          relationships: {
            appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } },
          },
        },
      },
    });
    if (!reserved) continue; // dry run
    const shot = reserved.data;
    await uploadParts(api, file, shot?.attributes?.uploadOperations);
    await write(`commit ${file.fileName}`, `/v1/appScreenshots/${shot.id}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appScreenshots',
          id: shot.id,
          attributes: { uploaded: true, sourceFileChecksum: file.md5 },
        },
      },
    });
    ids.push(shot.id);
  }

  if (ids.length === 0) return { action: 'dry-run', reason: plan.reason };

  await waitForDelivery(api, ids, { timeoutMs, pollMs });
  await write(
    `order ${displayType} screenshots`,
    `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`,
    { method: 'PATCH', body: { data: ids.map((id) => ({ type: 'appScreenshots', id })) } },
  );
  return { action: 'replaced', reason: plan.reason };
}

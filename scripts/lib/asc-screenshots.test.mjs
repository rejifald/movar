#!/usr/bin/env node
// Tests for the App Store screenshot sync. No network: the ASC API and the
// blob uploads are a fake that records every call, so each case asserts the
// exact writes a real run would make — or, for the idempotent rerun and the
// dry run, that it makes none.
import { deepStrictEqual as deep, strictEqual as eq, throws } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { after, describe, it } from 'node:test';
import {
  discoverScreenshots,
  localeFolder,
  planScreenshotSet,
  pngDimensions,
  replaceScreenshotSet,
} from './asc-screenshots.mjs';

/** The first 24+ bytes of a PNG: signature + IHDR with the given size. */
function png(width, height, extra = 'x') {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return Buffer.concat([b, Buffer.from(extra)]);
}

const scratch = mkdtempSync(nodePath.join(tmpdir(), 'asc-screenshots-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
/** A fresh screenshots root populated from `{ 'iphone-6.9/uk/01.png': bytes }`. */
function tree(files) {
  const root = nodePath.join(scratch, String((n += 1)));
  mkdirSync(root, { recursive: true });
  for (const [rel, bytes] of Object.entries(files)) {
    mkdirSync(nodePath.dirname(nodePath.join(root, rel)), { recursive: true });
    writeFileSync(nodePath.join(root, rel), bytes);
  }
  return root;
}

describe('pngDimensions', () => {
  it('reads width and height from IHDR', () => {
    deep(pngDimensions(png(1320, 2868)), { width: 1320, height: 2868 });
  });
  it('throws on a file that is not a PNG', () => {
    throws(() => pngDimensions(Buffer.from('GIF89a and then some more bytes')), /not a PNG/);
  });
});

describe('localeFolder', () => {
  it('maps an ASC locale to its language subtag', () => {
    eq(localeFolder('uk'), 'uk');
    eq(localeFolder('en-US'), 'en');
    eq(localeFolder('en-GB'), 'en');
  });
});

describe('discoverScreenshots', () => {
  it('lists display folders and locales, files in name order, with md5 and size', () => {
    const root = tree({
      'iphone-6.9/uk/02-b.png': png(1320, 2868, 'b'),
      'iphone-6.9/uk/01-a.png': png(1320, 2868, 'a'),
      'iphone-6.9/en/01-a.png': png(1320, 2868, 'c'),
      'iphone-6.9/en/notes.txt': 'ignored',
      'README.md': 'ignored',
    });
    const found = discoverScreenshots(root);
    eq(found.length, 1);
    eq(found[0].displayType, 'APP_IPHONE_67');
    eq(found[0].platform, 'IOS');
    deep([...found[0].locales.keys()], ['en', 'uk']);
    const uk = found[0].locales.get('uk');
    deep(
      uk.map((f) => f.fileName),
      ['01-a.png', '02-b.png'],
    );
    eq(uk[0].fileSize, 34);
    eq(uk[0].md5.length, 32);
  });

  it('skips a display folder that does not exist, and a missing root entirely', () => {
    deep(discoverScreenshots(nodePath.join(scratch, 'nope')), []);
    const root = tree({ 'mac/en/01.png': png(2880, 1800) });
    deep(
      discoverScreenshots(root).map((d) => d.displayType),
      ['APP_DESKTOP'],
    );
  });

  it('fails loudly on a PNG of the wrong size for its display type', () => {
    const root = tree({ 'iphone-6.9/uk/01.png': png(1280, 800) });
    throws(() => discoverScreenshots(root), /iphone-6\.9\/uk\/01\.png is 1280x800; APP_IPHONE_67/);
  });

  it('fails loudly on a .png that is not a PNG', () => {
    const root = tree({ 'ipad-13/en/01.png': Buffer.from('definitely not a png file, no') });
    throws(() => discoverScreenshots(root), /ipad-13\/en\/01\.png: not a PNG/);
  });

  it('fails on more than 10 files in one set', () => {
    const files = {};
    for (let i = 1; i <= 11; i += 1)
      files[`iphone-6.9/uk/${String(i).padStart(2, '0')}.png`] = png(1320, 2868);
    throws(() => discoverScreenshots(tree(files)), /11 screenshots; .* at most 10/);
  });

  it('fails on an unknown display folder instead of silently skipping a typo', () => {
    throws(
      () => discoverScreenshots(tree({ 'iphone-69/uk/01.png': png(1320, 2868) })),
      /unknown screenshot display folder\(s\) iphone-69/,
    );
  });
});

const shot = (md5, state = 'COMPLETE', id = md5) => ({
  id,
  attributes: { sourceFileChecksum: md5, fileName: `${md5}.png`, assetDeliveryState: { state } },
});

describe('planScreenshotSet', () => {
  it('skips when the set already holds the same files in the same order', () => {
    eq(planScreenshotSet([shot('a'), shot('b')], [{ md5: 'a' }, { md5: 'b' }]).action, 'skip');
  });
  it('replaces on a reorder', () => {
    eq(planScreenshotSet([shot('b'), shot('a')], [{ md5: 'a' }, { md5: 'b' }]).action, 'replace');
  });
  it('replaces on a different count, including an empty set', () => {
    eq(planScreenshotSet([shot('a')], [{ md5: 'a' }, { md5: 'b' }]).action, 'replace');
    eq(planScreenshotSet([], [{ md5: 'a' }]).action, 'replace');
  });
  it('replaces when a matching screenshot never finished processing', () => {
    const plan = planScreenshotSet([shot('a', 'FAILED')], [{ md5: 'a' }]);
    eq(plan.action, 'replace');
    eq(plan.reason, '1 screenshot(s) never finished processing');
  });
});

/**
 * A fake App Store Connect: routes reads by path, records every write and
 * upload. `state` is what each screenshot reports when polled.
 */
function fakeAsc({ sets = [], shots = [], deliveryStates = [] } = {}) {
  const calls = [];
  let nextId = 0;
  const polls = new Map();
  const api = {
    async request(path, options = {}) {
      calls.push(['GET', path, options]);
      if (path.includes('/appScreenshotSets?'))
        return { status: 200, detail: '', body: { data: sets } };
      if (/\/appScreenshotSets\/[^/]+\/appScreenshots/.test(path))
        return { status: 200, detail: '', body: { data: shots } };
      const m = path.match(/^\/v1\/appScreenshots\/(.+)$/);
      if (m) {
        const count = (polls.get(m[1]) ?? 0) + 1;
        polls.set(m[1], count);
        const states = deliveryStates.length > 0 ? deliveryStates : ['COMPLETE'];
        const state = states[Math.min(count, states.length) - 1];
        return {
          status: 200,
          detail: '',
          body: {
            data: {
              id: m[1],
              attributes: {
                fileName: `${m[1]}.png`,
                assetDeliveryState: {
                  state,
                  errors:
                    state === 'FAILED' ? [{ code: 'IMAGE_BAD', description: 'too blue' }] : [],
                },
              },
            },
          },
        };
      }
      return { status: 404, detail: 'not routed', body: {} };
    },
    async upload(url, init) {
      calls.push(['UPLOAD', url, init]);
      return { status: 200 };
    },
    async sleep() {},
  };
  const write = async (description, path, options) => {
    calls.push([options.method, path, options.body]);
    if (options.method === 'POST' && path === '/v1/appScreenshotSets')
      return { data: { id: 'set-new' } };
    if (options.method === 'POST' && path === '/v1/appScreenshots') {
      nextId += 1;
      return {
        data: {
          id: `s${nextId}`,
          attributes: {
            uploadOperations: [
              {
                method: 'PUT',
                url: `https://blob/s${nextId}/1`,
                offset: 0,
                length: 4,
                requestHeaders: [{ name: 'Content-Type', value: 'image/png' }],
              },
              {
                method: 'PUT',
                url: `https://blob/s${nextId}/2`,
                offset: 4,
                length: 3,
                requestHeaders: [],
              },
            ],
          },
        },
      };
    }
    return {};
  };
  const writes = () => calls.filter(([m]) => m !== 'GET').map(([m, p]) => `${m} ${p}`);
  return { api, write, calls, writes };
}

const file = (name, md5) => ({
  fileName: name,
  bytes: Buffer.from('1234567'),
  fileSize: 7,
  md5,
});

describe('replaceScreenshotSet', () => {
  it('creates a missing set, reserves → uploads each byte range → commits, then orders', async () => {
    const asc = fakeAsc();
    const result = await replaceScreenshotSet({
      api: asc.api,
      write: asc.write,
      localizationId: 'loc1',
      displayType: 'APP_IPHONE_67',
      files: [file('01.png', 'aa'), file('02.png', 'bb')],
    });
    eq(result.action, 'replaced');
    deep(asc.writes(), [
      'POST /v1/appScreenshotSets',
      'POST /v1/appScreenshots',
      'UPLOAD https://blob/s1/1',
      'UPLOAD https://blob/s1/2',
      'PATCH /v1/appScreenshots/s1',
      'POST /v1/appScreenshots',
      'UPLOAD https://blob/s2/1',
      'UPLOAD https://blob/s2/2',
      'PATCH /v1/appScreenshots/s2',
      'PATCH /v1/appScreenshotSets/set-new/relationships/appScreenshots',
    ]);

    const createSet = asc.calls.find(([m, p]) => m === 'POST' && p === '/v1/appScreenshotSets')[2];
    deep(createSet.data.attributes, { screenshotDisplayType: 'APP_IPHONE_67' });
    deep(createSet.data.relationships.appStoreVersionLocalization.data, {
      type: 'appStoreVersionLocalizations',
      id: 'loc1',
    });

    const reserve = asc.calls.find(([m, p]) => m === 'POST' && p === '/v1/appScreenshots')[2];
    deep(reserve.data.attributes, { fileName: '01.png', fileSize: 7 });
    deep(reserve.data.relationships.appScreenshotSet.data, {
      type: 'appScreenshotSets',
      id: 'set-new',
    });

    const part1 = asc.calls.find(([m, p]) => m === 'UPLOAD' && p === 'https://blob/s1/1')[2];
    eq(part1.method, 'PUT');
    deep(part1.headers, { 'Content-Type': 'image/png' });
    eq(part1.body.toString(), '1234');
    eq(
      asc.calls.find(([m, p]) => m === 'UPLOAD' && p === 'https://blob/s1/2')[2].body.toString(),
      '567',
    );

    const commit = asc.calls.find(([m, p]) => m === 'PATCH' && p === '/v1/appScreenshots/s1')[2];
    deep(commit.data.attributes, { uploaded: true, sourceFileChecksum: 'aa' });

    const order = asc.calls.at(-1)[2];
    deep(order, {
      data: [
        { type: 'appScreenshots', id: 's1' },
        { type: 'appScreenshots', id: 's2' },
      ],
    });
  });

  it('reuses an existing set and deletes what it held before uploading', async () => {
    const asc = fakeAsc({
      sets: [{ id: 'set1', attributes: { screenshotDisplayType: 'APP_IPHONE_67' } }],
      shots: [shot('old', 'COMPLETE', 'x1')],
    });
    await replaceScreenshotSet({
      api: asc.api,
      write: asc.write,
      localizationId: 'loc1',
      displayType: 'APP_IPHONE_67',
      files: [file('01.png', 'aa')],
    });
    deep(asc.writes().slice(0, 2), ['DELETE /v1/appScreenshots/x1', 'POST /v1/appScreenshots']);
    eq(asc.writes().includes('POST /v1/appScreenshotSets'), false);
    eq(asc.writes().at(-1), 'PATCH /v1/appScreenshotSets/set1/relationships/appScreenshots');
  });

  it('is idempotent: a set that already matches gets no writes at all', async () => {
    const asc = fakeAsc({
      sets: [{ id: 'set1', attributes: { screenshotDisplayType: 'APP_IPHONE_67' } }],
      shots: [shot('aa'), shot('bb')],
    });
    const result = await replaceScreenshotSet({
      api: asc.api,
      write: asc.write,
      localizationId: 'loc1',
      displayType: 'APP_IPHONE_67',
      files: [file('01.png', 'aa'), file('02.png', 'bb')],
    });
    eq(result.action, 'skip');
    deep(asc.writes(), []);
  });

  it('dry run: writes return null, so nothing is uploaded and nothing polled', async () => {
    const asc = fakeAsc({
      sets: [{ id: 'set1', attributes: { screenshotDisplayType: 'APP_DESKTOP' } }],
      shots: [shot('old', 'COMPLETE', 'x1')],
    });
    const attempted = [];
    const result = await replaceScreenshotSet({
      api: asc.api,
      write: async (description) => {
        attempted.push(description);
        return null;
      },
      localizationId: 'loc1',
      displayType: 'APP_DESKTOP',
      files: [file('01.png', 'aa')],
    });
    eq(result.action, 'dry-run');
    deep(attempted, ['delete old screenshot old.png', 'reserve 01.png']);
    deep(asc.writes(), []);
    eq(
      asc.calls.some(([m, p]) => m === 'GET' && /^\/v1\/appScreenshots\//.test(p)),
      false,
    );
  });

  it('waits through UPLOAD_COMPLETE until COMPLETE', async () => {
    const asc = fakeAsc({ deliveryStates: ['UPLOAD_COMPLETE', 'UPLOAD_COMPLETE', 'COMPLETE'] });
    const result = await replaceScreenshotSet({
      api: asc.api,
      write: asc.write,
      localizationId: 'loc1',
      displayType: 'APP_IPHONE_67',
      files: [file('01.png', 'aa')],
    });
    eq(result.action, 'replaced');
    eq(asc.calls.filter(([m, p]) => m === 'GET' && p === '/v1/appScreenshots/s1').length, 3);
  });

  it('fails with Apple’s reason when processing FAILS, and never orders the set', async () => {
    const asc = fakeAsc({ deliveryStates: ['FAILED'] });
    await replaceScreenshotSet({
      api: asc.api,
      write: asc.write,
      localizationId: 'loc1',
      displayType: 'APP_IPHONE_67',
      files: [file('01.png', 'aa')],
    }).then(
      () => {
        throw new Error('expected a rejection');
      },
      (error) => eq(error.message, 'Apple failed to process s1.png: IMAGE_BAD: too blue'),
    );
    eq(
      asc.writes().some((w) => w.includes('relationships/appScreenshots')),
      false,
    );
  });

  it('gives up after the timeout instead of polling forever', async () => {
    const asc = fakeAsc({ deliveryStates: ['UPLOAD_COMPLETE'] });
    await replaceScreenshotSet({
      api: asc.api,
      write: asc.write,
      localizationId: 'loc1',
      displayType: 'APP_IPHONE_67',
      files: [file('01.png', 'aa')],
      timeoutMs: -1,
    }).then(
      () => {
        throw new Error('expected a rejection');
      },
      (error) => eq(/still processing/.test(error.message), true),
    );
  });

  it('fails on a non-2xx blob upload', async () => {
    const asc = fakeAsc();
    asc.api.upload = async () => ({ status: 403 });
    await replaceScreenshotSet({
      api: asc.api,
      write: asc.write,
      localizationId: 'loc1',
      displayType: 'APP_IPHONE_67',
      files: [file('01.png', 'aa')],
    }).then(
      () => {
        throw new Error('expected a rejection');
      },
      (error) => eq(error.message, 'uploading 01.png bytes 0+4 → 403'),
    );
  });
});

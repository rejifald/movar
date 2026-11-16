#!/usr/bin/env node
// Tests for the AMO listing sync's pure half. No network, fixtures inline.
import { deepStrictEqual as deep, strictEqual as eq, throws } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { after, describe, it } from 'node:test';
import {
  buildDesired,
  buildDesiredPreviews,
  buildPatch,
  diffListing,
  discoverDesktopScreenshots,
  liveCategories,
  parseDescription,
  parseSummary,
  planPreviews,
  renderPlan,
  unknownTags,
  validateDesired,
} from './amo-listing.mjs';

function png(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const scratch = mkdtempSync(nodePath.join(tmpdir(), 'amo-listing-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
function tree(files) {
  const root = nodePath.join(scratch, String((n += 1)));
  mkdirSync(root, { recursive: true });
  for (const [rel, bytes] of Object.entries(files)) {
    mkdirSync(nodePath.dirname(nodePath.join(root, rel)), { recursive: true });
    writeFileSync(nodePath.join(root, rel), bytes);
  }
  return root;
}

const listing = {
  amo: {
    defaultLocale: 'uk',
    localeMap: { uk: 'uk', en: 'en-US' },
    name: { 'en-US': 'Movar', uk: 'Movar' },
    categories: ['search-tools', 'language-support'],
    tags: ['search'],
    homepage: null,
    supportEmail: 'support@movar.fyi',
    supportUrl: 'https://www.movar.fyi',
    screenshots: {
      locale: 'uk',
      captions: {
        popup: { uk: 'Вікно', en: 'Popup' },
        search: { uk: 'Пошук' },
      },
    },
  },
};
const copy = {
  uk: { summary: { amo: 'Опис UK', cws: 'c' }, description: 'Довгий UK' },
  en: { summary: { amo: 'Summary EN', cws: 'c' }, description: 'Long EN' },
};

/** A live add-on that already matches `listing` + `copy`. */
const liveInSync = () => ({
  default_locale: 'uk',
  name: { 'en-US': 'Movar', uk: 'Movar' },
  summary: { 'en-US': 'Summary EN', uk: 'Опис UK' },
  description: { 'en-US': 'Long EN', uk: 'Довгий UK' },
  support_email: { 'en-US': 'support@movar.fyi', uk: 'support@movar.fyi' },
  support_url: {
    url: { 'en-US': 'https://www.movar.fyi', uk: 'https://www.movar.fyi' },
    outgoing: { 'en-US': 'https://out/x', uk: 'https://out/x' },
  },
  homepage: null,
  categories: ['language-support', 'search-tools'],
  tags: ['search'],
  previews: [],
});

describe('copy parsing', () => {
  const summary = `# t\n\nintro\n\n## CWS (≤132)\n\nShort line.\n\n(10 chars)\n\n## AMO (≤200)\n\nLong line.\n\n(9 chars)\n\n## Edge (≤132)\n\nShort line.\n`;
  it('takes the first paragraph under each store heading', () => {
    deep(parseSummary(summary), { cws: 'Short line.', amo: 'Long line.', edge: 'Short line.' });
  });
  it('rejects a summary without an AMO or CWS section', () => {
    throws(() => parseSummary('## CWS\n\nx\n'), /AMO/);
  });
  it('description is everything after the first rule', () => {
    eq(parseDescription('# t\n\nnotes\n\n---\n\nBody\n\n- a\n'), 'Body\n\n- a');
    throws(() => parseDescription('no rule here'), /---/);
  });
});

describe('buildDesired / validateDesired', () => {
  it('maps repo locales to AMO locales', () => {
    const d = buildDesired(listing, copy);
    eq(d.summary['en-US'], 'Summary EN');
    eq(d.summary.uk, 'Опис UK');
    eq('homepage' in d, false);
  });
  it('flags an over-long summary', () => {
    const d = buildDesired(listing, {
      ...copy,
      en: { ...copy.en, summary: { amo: 'x'.repeat(251) } },
    });
    eq(validateDesired(d).length, 1);
  });
  it('knows which tags AMO does not allow', () => {
    deep(unknownTags(['search', 'ukrainian'], ['search', 'privacy']), ['ukrainian']);
  });
});

describe('diffListing / buildPatch', () => {
  it('reports no difference for an in-sync listing, ignoring category order and CRLF', () => {
    const live = liveInSync();
    live.description.uk = 'Довгий UK\r\n';
    deep(diffListing(buildDesired(listing, copy), live), []);
  });
  it('patches only the locale that changed', () => {
    const live = liveInSync();
    live.summary.uk = 'old';
    const diffs = diffListing(buildDesired(listing, copy), live);
    deep(buildPatch(diffs), { summary: { uk: 'Опис UK' } });
  });
  it('sends categories as {firefox: [...]}', () => {
    const live = liveInSync();
    live.categories = ['search-tools'];
    deep(buildPatch(diffListing(buildDesired(listing, copy), live)), {
      categories: { firefox: ['search-tools', 'language-support'] },
    });
  });
  it('reads categories from either the array or the per-app object', () => {
    deep(liveCategories({ categories: ['a'] }), ['a']);
    deep(liveCategories({ categories: { firefox: ['b'], android: ['c'] } }), ['b']);
  });
  it('compares support_url against the nested url map', () => {
    const live = liveInSync();
    live.support_url.url.uk = 'https://old.example';
    const diffs = diffListing(buildDesired(listing, copy), live);
    deep(
      diffs.map((d) => [d.field, d.locale]),
      [['support_url', 'uk']],
    );
  });
  it('detects tag changes and a missing translation', () => {
    const live = liveInSync();
    live.tags = [];
    delete live.name['en-US'];
    const fields = diffListing(buildDesired(listing, copy), live).map((d) => d.field);
    deep(fields.toSorted(), ['name', 'tags']);
  });
  it('an empty patch means nothing to do', () => {
    deep(buildPatch([]), {});
  });
});

describe('discoverDesktopScreenshots', () => {
  it('reports a missing folder instead of throwing', () => {
    eq(discoverDesktopScreenshots(nodePath.join(scratch, 'nope'), 'uk').missing, true);
  });
  it('accepts 1280x800 PNGs in filename order', () => {
    const root = tree({ 'uk/02-search.png': png(1280, 800), 'uk/01-popup.png': png(1280, 800) });
    const r = discoverDesktopScreenshots(root, 'uk');
    deep(
      r.shots.map((s) => [s.fileName, s.slug]),
      [
        ['01-popup.png', 'popup'],
        ['02-search.png', 'search'],
      ],
    );
    deep(r.problems, []);
  });
  it('collects every problem: wrong size, bad name, not a PNG', () => {
    const root = tree({
      'uk/01-a.png': png(1280, 799),
      'uk/Shot.png': png(1280, 800),
      'uk/02-b.png': Buffer.from('nope, definitely not a png at all'),
    });
    const r = discoverDesktopScreenshots(root, 'uk');
    eq(r.problems.length, 3);
    eq(r.shots.length, 0);
  });
  it('enforces the cap', () => {
    const root = tree({ 'uk/01-a.png': png(1280, 800), 'uk/02-b.png': png(1280, 800) });
    eq(discoverDesktopScreenshots(root, 'uk', { max: 1 }).problems.length, 1);
  });
});

describe('previews', () => {
  const shots = [
    { fileName: '01-popup.png', slug: 'popup' },
    { fileName: '02-search.png', slug: 'search' },
  ];
  const { previews, warnings } = buildDesiredPreviews(shots, listing);
  const liveFor = (captions) =>
    previews.map((p, i) => ({ id: 100 + i, position: i, caption: captions[i] }));

  it('captions both locales and warns on gaps', () => {
    deep(previews[0].caption, { uk: 'Вікно', 'en-US': 'Popup' });
    deep(previews[1].caption, { uk: 'Пошук' });
    eq(warnings.length, 1);
    eq(buildDesiredPreviews([{ fileName: '03-x.png', slug: 'x' }], listing).warnings.length, 1);
  });
  it('does nothing without local screenshots', () => {
    eq(planPreviews([], [{ id: 1, position: 0, caption: null }]).action, 'none');
  });
  it('replaces when the count differs: all uploads first, deletes last', () => {
    const plan = planPreviews(previews, [{ id: 7, position: 0, caption: null }]);
    eq(plan.action, 'replace');
    deep(
      plan.ops.map((o) => o.op),
      ['upload', 'upload', 'delete'],
    );
    eq(plan.ops[2].id, 7);
  });
  it('replaces an empty listing without deletes', () => {
    deep(
      planPreviews(previews, []).ops.map((o) => o.op),
      ['upload', 'upload'],
    );
  });
  it('keeps matching captions, patches differing ones, forces on request', () => {
    const same = liveFor([previews[0].caption, previews[1].caption]);
    eq(planPreviews(previews, same).action, 'keep');
    const diff = liveFor([previews[0].caption, { uk: 'інше' }]);
    const plan = planPreviews(previews, diff);
    eq(plan.action, 'captions');
    deep(
      plan.ops.map((o) => o.id),
      [101],
    );
    eq(planPreviews(previews, same, { force: true }).action, 'replace');
  });
});

describe('renderPlan', () => {
  it('renders diffs, warnings and operations as markdown', () => {
    const live = liveInSync();
    live.summary.uk = 'old | text';
    const diffs = diffListing(buildDesired(listing, copy), live);
    const md = renderPlan({
      addon: 'movar',
      diffs,
      previewPlan: {
        action: 'replace',
        reason: 'x',
        ops: [
          { op: 'upload', fileName: '01-a.png', position: 0, caption: {} },
          { op: 'delete', id: 3 },
        ],
      },
      warnings: ['w1'],
      mode: 'plan',
    });
    for (const s of [
      '| summary | uk |',
      String.raw`old \| text`,
      'w1',
      'upload `01-a.png`',
      'delete old preview 3',
    ]) {
      eq(md.includes(s), true, s);
    }
  });
});

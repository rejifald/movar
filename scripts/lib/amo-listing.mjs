// scripts/lib/amo-listing.mjs
//
// The Firefox (AMO) listing, from repo sources to API operations. Zero npm
// dependencies; Node 22 built-ins only. Used by scripts/amo-listing.mjs and
// (for the copy parser and screenshot discovery) scripts/chrome-listing-bundle.mjs.
//
// Pure on purpose: nothing here touches the network. The CLI does the GET/PATCH
// and hands this module the JSON, so every decision is testable with fixtures.
//
// API shapes, from https://mozilla.github.io/addons-server/topics/api/addons.html
// (fetched 2026-11-16) unless noted:
//
//   PATCH /api/v5/addons/addon/<slug>/        "Edit". Accepts: categories,
//       default_locale, description, developer_comments, homepage, name,
//       summary, support_email, tags, ... Translated fields (name, summary,
//       description, homepage, support_email) are {"<locale>": "<text>"}
//       objects; a locale left out is NOT touched, null deletes one
//       (https://mozilla.github.io/addons-server/topics/api/overview.html,
//       "Translated Fields").
//       `categories` is documented as {"<app_name>": ["<slug>", ...]}.
//       `support_url` is returned by GET but is NOT in the documented PATCH
//       field list — we send it anyway and the apply step re-reads to confirm.
//   GET categories: a flat array of slugs on the live endpoint, although the docs
//       say an object keyed by app — `liveCategories` accepts both.
//   GET /api/v5/addons/tags/                  closed list of allowed tag names.
//   POST   .../previews/                      multipart `image` (+ `position`).
//       `caption` cannot be set on create — a second PATCH is needed.
//   PATCH  .../previews/<id>/                 JSON `caption` (translated), `position`.
//   DELETE .../previews/<id>/
//
// Anything not confirmed from those docs is called out where it is used.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import nodePath from 'node:path';

/** Repo limits (apps/extension/store-assets/REQUIREMENTS.md section 3). */
export const SUMMARY_MAX = 250;
export const DESCRIPTION_MAX = 15_000;
export const PREVIEW_MAX = 10;
export const PREVIEW_SIZE = { width: 1280, height: 800 };

const norm = (s) =>
  typeof s === 'string'
    ? s
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .trim()
    : s;

// ---------------------------------------------------------------- copy files

/**
 * Parse copy/summary.<locale>.md. Each `## <STORE> (...)` heading owns the
 * first non-empty paragraph under it; the "(122 chars)" notes after it are
 * ignored.
 *
 * @returns {{amo: string, cws: string, edge: string}}
 */
export function parseSummary(markdown) {
  const out = {};
  for (const block of markdown.split(/^## /m).slice(1)) {
    const [heading, ...rest] = block.split('\n');
    const key = /^(AMO|CWS|Edge)\b/.exec(heading.trim())?.[1]?.toLowerCase();
    if (!key) continue;
    const para = rest
      .join('\n')
      .trim()
      .split(/\n\s*\n/)[0];
    if (para) out[key] = norm(para);
  }
  for (const key of ['amo', 'cws']) {
    if (!out[key]) throw new Error(`summary copy has no "## ${key.toUpperCase()}" paragraph`);
  }
  return out;
}

/** The listing text of copy/description.<locale>.md: everything after the first `---` rule. */
export function parseDescription(markdown) {
  const i = markdown.search(/^---\s*$/m);
  if (i === -1) throw new Error('description copy has no `---` rule separating notes from text');
  const body = norm(markdown.slice(i).replace(/^---\s*$/m, ''));
  if (!body) throw new Error('description copy is empty after the `---` rule');
  return body;
}

/**
 * @param {string} storeAssets  path to apps/extension/store-assets
 * @param {string[]} locales    repo locale codes, e.g. ['uk', 'en']
 * @returns {Record<string, {summary: {amo: string, cws: string, edge: string}, description: string}>}
 */
export function loadCopy(storeAssets, locales) {
  const copy = {};
  for (const l of locales) {
    const read = (kind) =>
      readFileSync(nodePath.join(storeAssets, 'copy', `${kind}.${l}.md`), 'utf8');
    copy[l] = {
      summary: parseSummary(read('summary')),
      description: parseDescription(read('description')),
    };
  }
  return copy;
}

// --------------------------------------------------------------- screenshots

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

const SHOT_NAME = /^(\d{2})-([a-z0-9][a-z0-9-]*)\.png$/;

/**
 * Read and validate `<root>/<locale>/NN-name.png`. Every problem is collected
 * (not thrown one at a time) so a run reports them all before any write.
 *
 * @returns {{shots: Array<{fileName: string, slug: string, path: string, bytes: Buffer}>, problems: string[], missing: boolean}}
 */
export function discoverDesktopScreenshots(root, locale, { max = PREVIEW_MAX } = {}) {
  const dir = nodePath.join(root, locale);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { shots: [], problems: [], missing: true };
  }
  const names = readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.png'))
    .toSorted();
  const problems = [];
  const shots = [];
  for (const fileName of names) {
    const m = SHOT_NAME.exec(fileName);
    if (!m) {
      problems.push(
        `${locale}/${fileName}: name must look like NN-name.png (lowercase, digits, dashes)`,
      );
      continue;
    }
    const path = nodePath.join(dir, fileName);
    const bytes = readFileSync(path);
    try {
      const { width, height } = pngDimensions(bytes);
      if (width !== PREVIEW_SIZE.width || height !== PREVIEW_SIZE.height) {
        problems.push(
          `${locale}/${fileName}: ${width}x${height}, expected ${PREVIEW_SIZE.width}x${PREVIEW_SIZE.height}`,
        );
        continue;
      }
    } catch (error) {
      problems.push(`${locale}/${fileName}: ${error.message}`);
      continue;
    }
    shots.push({ fileName, slug: m[2], path, bytes });
  }
  if (shots.length > max) {
    problems.push(`${locale}: ${shots.length} screenshots, the limit is ${max}`);
  }
  return { shots, problems, missing: false };
}

// ------------------------------------------------------------- desired state

/**
 * What the repo says the AMO listing should be.
 *
 * @param {object} listing  parsed listing.json
 * @param {ReturnType<typeof loadCopy>} copy
 */
export function buildDesired(listing, copy) {
  const a = listing.amo;
  /** @type {Record<string, any>} */
  const translated = { name: {}, summary: {}, description: {}, support_email: {}, support_url: {} };
  if (a.homepage) translated.homepage = {};
  for (const [repoLocale, amoLocale] of Object.entries(a.localeMap)) {
    const c = copy[repoLocale];
    if (!c) throw new Error(`no copy loaded for locale "${repoLocale}"`);
    translated.name[amoLocale] = a.name[amoLocale];
    translated.summary[amoLocale] = c.summary.amo;
    translated.description[amoLocale] = c.description;
    translated.support_email[amoLocale] = a.supportEmail;
    translated.support_url[amoLocale] = a.supportUrl;
    if (a.homepage) translated.homepage[amoLocale] = a.homepage;
  }
  for (const [loc, v] of Object.entries(translated.name)) {
    if (!v) throw new Error(`listing.json amo.name has no "${loc}" entry`);
  }
  return {
    default_locale: a.defaultLocale,
    ...translated,
    categories: [...a.categories],
    tags: [...a.tags],
  };
}

/** Hard repo limits. Returns problem strings (empty = fine). */
export function validateDesired(desired) {
  const problems = [];
  for (const [loc, s] of Object.entries(desired.summary)) {
    const n = [...s].length;
    if (n > SUMMARY_MAX)
      problems.push(`summary[${loc}] is ${n} chars, AMO caps it at ${SUMMARY_MAX}`);
  }
  for (const [loc, s] of Object.entries(desired.description)) {
    const n = [...s].length;
    if (n > DESCRIPTION_MAX)
      problems.push(`description[${loc}] is ${n} chars, the cap is ${DESCRIPTION_MAX}`);
  }
  return problems;
}

/** Tags that AMO's closed list (GET /api/v5/addons/tags/) does not contain. */
export const unknownTags = (tags, allowed) => tags.filter((t) => !allowed.includes(t));

// ----------------------------------------------------------------- live state

/** The live add-on's categories as a flat slug list; the v5 GET returns an array, the docs say {app: [...]}. */
export function liveCategories(addon, app = 'firefox') {
  const c = addon.categories;
  if (Array.isArray(c)) return c;
  if (c && typeof c === 'object') return c[app] ?? [];
  return [];
}

/** A translated *link* field (`{url: {loc: ..}, outgoing: ..}` or null) as `{loc: url}`. */
const linkMap = (field) => (field && typeof field === 'object' && field.url ? field.url : {});
const sameSet = (a, b) =>
  a.length === b.length && [...a].toSorted().every((v, i) => v === [...b].toSorted()[i]);

/**
 * Field-by-field difference between desired and a fetched live add-on.
 *
 * @returns {Array<{field: string, locale: string|null, live: any, desired: any}>}
 */
export function diffListing(desired, addon) {
  const diffs = [];
  for (const field of ['name', 'summary', 'description', 'support_email']) {
    if (!desired[field]) continue;
    for (const [locale, want] of Object.entries(desired[field])) {
      const have = addon[field]?.[locale] ?? null;
      if (norm(have) !== norm(want)) diffs.push({ field, locale, live: have, desired: want });
    }
  }
  // Link fields come back as `{url: {loc: ..}, outgoing: ..}`, not a plain translated map.
  for (const field of ['homepage', 'support_url']) {
    const liveUrls = linkMap(addon[field]);
    for (const [locale, want] of Object.entries(desired[field] ?? {})) {
      const have = liveUrls[locale] ?? null;
      if (norm(have) !== norm(want)) diffs.push({ field, locale, live: have, desired: want });
    }
  }
  if (desired.default_locale !== addon.default_locale) {
    diffs.push({
      field: 'default_locale',
      locale: null,
      live: addon.default_locale ?? null,
      desired: desired.default_locale,
    });
  }
  const liveCats = liveCategories(addon);
  if (!sameSet(desired.categories, liveCats)) {
    diffs.push({ field: 'categories', locale: null, live: liveCats, desired: desired.categories });
  }
  const liveTags = addon.tags ?? [];
  if (!sameSet(desired.tags, liveTags)) {
    diffs.push({ field: 'tags', locale: null, live: liveTags, desired: desired.tags });
  }
  return diffs;
}

/** The minimal PATCH body that applies `diffs` (changed locales only; an empty object = nothing to do). */
export function buildPatch(diffs, { app = 'firefox' } = {}) {
  const body = {};
  for (const d of diffs) {
    if (d.locale) {
      body[d.field] ??= {};
      body[d.field][d.locale] = d.desired;
    } else if (d.field === 'categories') {
      body.categories = { [app]: d.desired };
    } else {
      body[d.field] = d.desired;
    }
  }
  return body;
}

// ------------------------------------------------------------------- previews

/**
 * Per-screenshot desired previews: image + position + captions in AMO locales.
 *
 * @param {Array<{fileName: string, slug: string}>} shots  in order
 * @param {object} listing
 */
export function buildDesiredPreviews(shots, listing) {
  const { captions = {} } = listing.amo.screenshots ?? {};
  const warnings = [];
  const previews = shots.map((shot, position) => {
    const entry = captions[shot.slug];
    /** @type {Record<string, string>} */
    const caption = {};
    if (entry) {
      for (const [repoLocale, amoLocale] of Object.entries(listing.amo.localeMap)) {
        if (entry[repoLocale]) caption[amoLocale] = entry[repoLocale];
        else warnings.push(`caption for "${shot.slug}" has no ${repoLocale} text`);
      }
    } else {
      warnings.push(`no caption for "${shot.slug}" in listing.json (amo.screenshots.captions)`);
    }
    return { position, fileName: shot.fileName, slug: shot.slug, caption };
  });
  return { previews, warnings };
}

const sameCaption = (live, want) =>
  Object.entries(want).every(([loc, text]) => norm(live?.[loc] ?? null) === norm(text));

/**
 * Decide what to do with the live previews.
 *
 *   none     no local screenshots: leave the live ones alone
 *   keep     same count and captions — images are NOT compared (the API gives
 *            no hash); `force` re-uploads regardless
 *   captions same count, only captions differ: PATCH them in place
 *   replace  upload every new image (then its caption), and only afterwards
 *            delete the old ones, so a mid-run failure never empties the listing
 *
 * @param {ReturnType<typeof buildDesiredPreviews>['previews']} desired
 * @param {Array<{id: number, caption: any, position: number}>} livePreviews
 */
export function planPreviews(desired, livePreviews, { force = false } = {}) {
  if (desired.length === 0) return { action: 'none', reason: 'no local screenshots', ops: [] };
  const live = [...livePreviews].toSorted((a, b) => a.position - b.position);
  if (!force && live.length === desired.length) {
    const wrong = desired.filter((d, i) => !sameCaption(live[i].caption, d.caption));
    if (wrong.length === 0) {
      return {
        action: 'keep',
        reason:
          'same count and captions (images not compared; set FORCE_SCREENSHOTS=1 to re-upload)',
        ops: [],
      };
    }
    return {
      action: 'captions',
      reason: `${wrong.length} caption(s) differ`,
      ops: desired
        .map((d, i) => ({ op: 'caption', id: live[i].id, caption: d.caption }))
        .filter((_, i) => wrong.includes(desired[i])),
    };
  }
  const ops = [
    ...desired.map((d) => ({
      op: 'upload',
      fileName: d.fileName,
      position: d.position,
      caption: d.caption,
    })),
    // Deletes come strictly after every upload (and its caption) has succeeded.
    ...live.map((p) => ({ op: 'delete', id: p.id })),
  ];
  return {
    action: 'replace',
    reason: force ? 'forced' : `${live.length} live preview(s) vs ${desired.length} local`,
    ops,
  };
}

// --------------------------------------------------------------------- report

const clip = (v, n = 90) => {
  if (v === null || v === undefined) return '_(empty)_';
  const s = Array.isArray(v) ? v.join(', ') || '_(none)_' : String(v);
  const one = s.replace(/\s+/g, ' ');
  const text = one.length > n ? `${one.slice(0, n)}…` : one;
  return `\`${text.replaceAll('|', String.raw`\|`).replaceAll('`', "'")}\`${s.length > n ? ` (${[...s].length} chars)` : ''}`;
};

/** Markdown for $GITHUB_STEP_SUMMARY. */
export function renderPlan({ addon, diffs, previewPlan, warnings = [], problems = [], mode }) {
  const lines = [`## AMO listing — ${addon} (${mode})`, ''];
  if (problems.length > 0)
    lines.push('### Problems (nothing will be written)', '', ...problems.map((p) => `- ${p}`), '');
  if (warnings.length > 0) lines.push('### Warnings', '', ...warnings.map((w) => `- ${w}`), '');
  lines.push('### Metadata', '');
  if (diffs.length === 0) {
    lines.push('No difference — the live listing already matches the repo.', '');
  } else {
    lines.push('| Field | Locale | Live | Repo |', '| --- | --- | --- | --- |');
    for (const d of diffs)
      lines.push(`| ${d.field} | ${d.locale ?? ''} | ${clip(d.live)} | ${clip(d.desired)} |`);
    lines.push('');
  }
  lines.push('### Screenshots', '', `**${previewPlan.action}** — ${previewPlan.reason}`);
  for (const op of previewPlan.ops) {
    if (op.op === 'upload')
      lines.push(
        `- upload \`${op.fileName}\` at position ${op.position}${Object.keys(op.caption).length > 0 ? ' with captions' : ''}`,
      );
    else if (op.op === 'caption') lines.push(`- set captions on preview ${op.id}`);
    else lines.push(`- delete old preview ${op.id} (after all uploads succeed)`);
  }
  lines.push('');
  return lines.join('\n');
}

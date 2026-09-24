/*
 * Capability-claim guard for the guide's per-page `movar` callout
 * (`content.config.ts`'s `movar.claim`/`movar.body`, rendered by
 * `components/GuideCallout.astro`).
 *
 * Movar hides Russian-language CONTENT CARDS only where the extension has a
 * page-content model for that surface — `apps/extension/src/sites/registry.ts`
 * (`const models: readonly SiteModel[] = [googleModel, youtubeModel];`, per
 * `apps/extension/AGENTS.md`). A guide page whose callout claims Movar
 * "hides" something on a host with no such model is a claim the product does
 * not back — see `docs/copy.md` and `.claude/skills/movar-copy/SKILL.md` §3,
 * "The copy claims something the product does not do". This is that guard
 * for the guide.
 *
 * Marketing cannot import the extension package (different app, no dependency
 * edge), so `HOSTS_WITH_CONTENT_MODEL` below is a hand-kept mirror of that
 * `models` array — update it, by hand, the day a host's model lands there.
 *
 * Checks `movar.body` only — `movar.claim` is never a Movar capability claim
 * to begin with. The schema (`content.config.ts`) draws the line explicitly:
 * `claim` is "the boundary of THIS page's settings, phrased as a statement
 * about the platform the reader just configured, not about Movar", and
 * `body` "is what Movar does about it". `prykhovani-slova.md` is the case
 * that showed why the distinction matters here: its claim — «Фільтр шукає
 * літери, а не мову: білоруський допис він сховає так само, як
 * російський.» — uses «сховає» for the NETWORK's own filter, not Movar, so
 * checking `claim` flagged a true sentence about someone else's product for
 * the wrong reason.
 *
 * Written 2026-09-24, when it caught seven callouts promising per-card
 * hiding on a host with no model — firefox, google-akaunt, google-servisy,
 * netflix-spotify, socmerezhi, steam, telegram-tiktok, all in `movar.body`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from '@astrojs/markdown-remark';
import { describe, expect, it } from 'vitest';

const GUIDE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content/guide');

/**
 * Hand-mirror of `models` in `apps/extension/src/sites/registry.ts`. Display
 * names, not content-collection ids — this is what a reader-facing sentence
 * would actually say ("Google", "YouTube"), matched as a plain substring of
 * the field under test.
 */
const HOSTS_WITH_CONTENT_MODEL = ['Google', 'YouTube'];

/**
 * Guide pages whose entire subject IS a modelled host, so a hiding claim in
 * `movar.body` correctly never repeats the host's name —
 * `youtube.md`'s body says «він ховає російські блоки на сторінці», never
 * "YouTube"; `google-poshuk.md`'s says «і ховає ті результати», never
 * "Google". Hand-kept in step with {@link HOSTS_WITH_CONTENT_MODEL} for the
 * same reason that list is: content-collection ids are filenames, and
 * marketing has no import into the extension to derive either automatically.
 *
 * Deliberately NOT derived from `page.data.title` or `.description` — a
 * title can name a modelled host on a page that is not actually about it.
 * `google-servisy.md` is the real example: its title is «Як змінити мову в
 * Gmail, Maps і Google News», so a title-based exemption would wave through
 * that page's body too — whose «ховає російський вміст» is a claim about
 * Gmail/Maps/News, none of which has a page-content model. Only a hand-kept
 * id allowlist can't be fooled by a brand name appearing in unrelated prose.
 */
const PAGES_ABOUT_MODELLED_HOSTS: ReadonlySet<string> = new Set(['google-poshuk', 'youtube']);

/**
 * Matches ховати / приховувати / сховати and every conjugated or derived
 * form of the three — ховає, ховаєте, приховує, приховують, сховав, сховала,
 * приховати, заховати, схований, … — because all three verbs share this
 * root. Deliberately no `\b`: in JavaScript `\b` is defined over ASCII word
 * characters only and never fires against Cyrillic (the same trap
 * `marketing.guide.spec.ts` documents for its own word-boundary check), so a
 * boundary here would silently stop matching the moment this runs against
 * real Ukrainian text. A plain case-insensitive substring on the shared root
 * is what actually works.
 *
 * Also catches semantically-adjacent words sharing the same root but not
 * meaning "hide" — «поховати» (to bury), «верховна» (as in «Верховна Рада»).
 * Not a concern in practice: these frontmatter fields are one-sentence
 * product claims, not general prose, and none of today's content contains
 * either — but noted here so the next person tuning this pattern knows the
 * trade-off is deliberate, not an oversight.
 */
const HIDING_VERB_PATTERN = /хов/iu;

interface GuideFrontmatter {
  readonly movar?: {
    readonly body?: unknown;
  };
}

interface GuidePage {
  readonly id: string;
  readonly body: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Read `movar.body` out of already-narrowed frontmatter, or `''` when the
 *  shape is not what the schema promises — this guard fails LOUD on a
 *  hiding claim, never silently on a missing field. `movar.claim` is not
 *  read here at all — see the module comment for why. */
function readMovarBody(movar: GuideFrontmatter['movar']): string {
  if (!isRecord(movar)) return '';
  const value = movar.body;
  return typeof value === 'string' ? value : '';
}

function readGuidePages(): readonly GuidePage[] {
  return readdirSync(GUIDE_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const raw = readFileSync(path.join(GUIDE_DIR, name), 'utf8');
      const frontmatter = parseFrontmatter(raw).frontmatter as GuideFrontmatter;
      return {
        id: name.replace(/\.md$/, ''),
        body: readMovarBody(frontmatter.movar),
      };
    });
}

/** Whether `text` makes its own hiding claim believable — either it names a
 *  modelled host directly, or the page it belongs to is entirely about one. */
function namesAModelledHost(text: string, pageId: string): boolean {
  if (HOSTS_WITH_CONTENT_MODEL.some((host) => text.includes(host))) return true;
  return PAGES_ABOUT_MODELLED_HOSTS.has(pageId);
}

describe('guide capability claims — hiding is only claimed where a model backs it', () => {
  const pages = readGuidePages();

  it('has guide pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  // One test per page, so a failure names exactly which page to fix rather
  // than a single "N pages failed" line.
  for (const page of pages) {
    it(`${page.id}: movar.body`, () => {
      const text = page.body;
      if (!HIDING_VERB_PATTERN.test(text)) return; // no hiding claim here — nothing to check

      expect(
        namesAModelledHost(text, page.id),
        `${page.id}: movar.body claims hiding ("${text}") but names none of ` +
          `${HOSTS_WITH_CONTENT_MODEL.join(', ')}, and "${page.id}" is not in ` +
          'PAGES_ABOUT_MODELLED_HOSTS',
      ).toBe(true);
    });
  }
});

# Content corpus — trimmed real saved pages

The single versioned home for **trimmed real saved pages** used as regression
fixtures, organised **by verdict surface**. This corpus is the _correctness_
gate that `docs/pitfalls.md` entry #1 mandates ("validate with a real saved
page, never a synthetic single-language fixture") — the small synthetic fixtures
in `apps/e2e/src/fixtures/html/` stay the _fast pipeline_ gate; these real
captures are what catch sample-contamination and selector-rot bugs.

## Layout

```
fixtures/
  google-serp/      Google SERP captures        → GOOGLE_EXTRACTOR + classifyBySnippet
  youtube/          YouTube results/feed pages   → YOUTUBE_EXTRACTOR + classifyBySnippet
  pickers/          Language-picker captures     → @movar/lang-pickers classification
  redirect-sites/   bing / ddg / electrica-shop  → getRuleForHost (+ picker for electrica)
```

Each fixture is a pair:

- `NAME.fixture.html` — the trimmed saved page.
- `NAME.expected.json` — the manifest: the pinned shape + the expected per-node
  verdicts (`hide`/`keep` + `fromLang` for content surfaces; picker languages
  for picker surfaces; rule match for redirect surfaces).

Consumers (all in the extension app, which has the node types the harnesses
need to read these files — the `@movar/page-content` model package stays pure,
so its tsconfig carries no node types):

- `apps/extension/src/lib/corpus-content.test.ts` — runs each content extractor
  (`GOOGLE_EXTRACTOR`/`YOUTUBE_EXTRACTOR`) + `classifyBySnippet` over
  `google-serp/` and `youtube/`.
- `apps/extension/src/lib/corpus-pickers.test.ts` — routes `pickers/` and
  `redirect-sites/` through `@movar/lang-pickers` + `getRuleForHost`.
- `apps/extension/src/lib/bosch-regression.test.ts` — the bosch picker
  regression, repointed here.

## Provenance & licensing

These are **trimmed excerpts** of publicly reachable pages (search-engine
result pages and storefront chrome), kept solely to reproduce language-detection
and picker-detection bugs as a fair-use test fixture. They are **not** complete
copies: scripts, styles, remote assets, ad slots, and the bulk of each page are
stripped (see the trim policy). No fixture carries a logo asset, a tracking
pixel, or a third party's proprietary CSS/JS — only the structural HTML skeleton
the extractor walks remains.

## PII policy

**Trimming IS the PII mitigation.** Every capture has had personal query text,
account/session chrome (signed-in names, avatars, history), cookies, and any
free-text the user typed removed or replaced with a neutral, topical
placeholder (e.g. a generic product query). If you add a fixture, scrub it the
same way before committing — never commit a real account name, email, session
token, or a query that identifies a person.

## Trim policy (durable selectors only)

Per `docs/pitfalls.md` entry #1, guards 3 and the trim mandate:

1. Drop everything the extractor does **not** walk: `<script>`, `<style>`,
   `<link>`/`<img>`/remote assets, ad/recommendation slots, nav/footer bulk.
2. Keep only **durable** anchors — stable `data-*` attributes, ids, and semantic
   tags (`#rso`, `data-hveid`, `data-sncf`, `ytd-video-renderer`,
   `[id="video-title"]`, `#form-language`, `hreflang`). **Never** let an
   obfuscated/minified styling class (`div.tF2Cxc`, jscontroller hashes) be the
   anchor — they rotate without notice and silently match zero nodes after a
   redesign while tests stay green.
3. Preserve the **contaminating** chrome that defines the bug (e.g. Google's
   injected "Перекласти цю сторінку" translate link + the `data-sncf="2"`
   store-annotation row). The fixture is worthless without it.

## Pages rot — expect drift

Real pages change. A site redesign can move the body away from the durable
selectors a fixture pins. That is **by design**: each manifest carries a
**shape-pin** (selector → count) asserted before the verdict checks, so a silent
re-save that drops the contaminated card (or rotates a selector) fails **loudly**
in the shape guard instead of passing vacuously. When a fixture's shape guard
fails after a deliberate re-capture, update the manifest in the same commit and
re-confirm the verdicts still encode the bug.

## Manifest schema

Content surfaces (`google-serp/`, `youtube/`):

```jsonc
{
  "extractor": "google", // expected PageContentModel.extractor
  "roster": ["uk", "ru"], // classifyBySnippet candidate codes
  "shape": { "selectors": { "#rso [data-hveid]": 2 } }, // pinned shape — DURABLE selectors
  "nodes": [{ "selector": "[data-fixture-id='ru-shop']", "verdict": "hide", "fromLang": "ru" }],
}
```

`verdict` is `hide` when the classified language is in the harness's BLOCKED set
(`ru`), else `keep` — mirroring `content-runtime.ts`'s hide predicate. The
harness also asserts the classified language equals `fromLang`.

**`shape.selectors` vs `nodes[].selector` — two different jobs, two different
rules.** The shape-pin asserts the extractor's DURABLE anchors are present
(`#rso [data-hveid]`, `.related-question-pair`, `[data-text-ad]`) and must use
only those. A node's `selector`, by contrast, only has to _address one extracted
node_ so the harness can check its verdict — and it must NOT lean on a value that
rotates. Google's `data-hveid` is a per-impression logging token: its presence is
durable (hence the shape-pin), but pinning a specific value (`[data-hveid='CAEQAA']`)
looks stable while rotating every search. Address each node by either a **stable
real distinguisher** (e.g. `#tads [data-text-ad]` vs `#tadsb [data-text-ad]` for
the two ad rails) or, when siblings share every stable attribute, an inert
**`data-fixture-id`** hook added to the node element (the extractor never reads it;
see `youtube/` and `google-serp/rele-napryazheniya`).

Picker surfaces (`pickers/`):

```jsonc
{
  "surface": "picker",
  "shape": { "selectors": { "#form-language": 1 }, "minSelectors": { "a[href*='/ru']": 7 } },
  "picker": { "containerId": "form-language", "links": 2, "languages": ["ru", "uk"] },
  "negatives": [{ "selector": "a[href='…/ru']" }], // must NOT classify as a language link
}
```

Redirect surfaces (`redirect-sites/`):

```jsonc
{
  "surface": "redirect",
  "host": "www.bing.com",                // getRuleForHost input
  "shape": { "selectors": { "#sb_form input[name='q']": 1 } },
  "rule": { "match": "bing.com", "strategyType": "searchParams" },
  "picker": { … }                        // optional — electrica-shop also has one
}
```

## How to add a fixture

1. Save the real page (browser "Save as → HTML only"). Note the URL + date here.
2. **Trim** to the durable subtree (see trim policy). Strip scripts/styles/
   assets and PII. Keep the contaminating chrome.
3. Drop it in the right surface dir as `NAME.fixture.html`.
4. Write `NAME.expected.json`: pin the shape with the extractor's durable anchors;
   address each node by a stable real distinguisher or an inert `data-fixture-id`,
   never a per-render token like a specific `data-hveid` value (see the
   shape-vs-node rule under "Manifest schema").
5. Run the harness (`pnpm --filter @movar/page-content test`, and the extension
   suite for picker/redirect fixtures). Tune the manifest until it encodes the
   bug, not the accident.

# Live-page probes

In-page JavaScript snippets for the adopt-site workflow, in the order they
are typically used. Probe 0 feeds the Step-0 surface inventory; the rest
serve the phases. All run via the browser tools' JavaScript execution on
the live site. Conventions that keep them reliable:

- **Wrap everything in an IIFE** — the page-JS REPL keeps state between
  evaluations, so bare `const` redeclarations throw on the second run.
- **No top-level `await`** in the in-app Browser pane — use the `wait`
  action between evaluation calls instead.
- Full page loads kill the probe — persist anything that must survive a
  navigation in `sessionStorage` and re-install the probe on the new
  document (that also mirrors how the real content script re-injects).
- Hydration stalls are transient: a grid that reports 0 items logged-out
  often fills on a retry or after a real scroll. Retry before concluding.
- Mobile: switch the viewport to the mobile preset (UA emulation) and load
  the `m.` host explicitly.

## 0 — Route inventory (what page types does this site serve?)

Collect the distinct route patterns the site itself links to — nav, footer,
sidebar, chip bars — as the seed of the Step-0 inventory. Complete it by
hand with what navigation can't see: hosts the predicate matches
(subdomains!), login-gated feeds, the mobile mirrors, and URL patterns you
know from the wild (item pages, hashtag/topic pages, post permalinks).

```js
(() => {
  const routes = {};
  for (const a of document.querySelectorAll('a[href]')) {
    let u;
    try {
      u = new URL(a.href);
    } catch {
      continue;
    }
    if (!u.hostname.endsWith('SITE-SUFFIX-HERE')) continue;
    // First path segment as the pattern bucket; tune per site.
    const pattern = u.hostname + '/' + (u.pathname.split('/')[1] ?? '');
    routes[pattern] = (routes[pattern] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(routes).sort((a, b) => b[1] - a[1]));
})();
```

## 1 — DOM census (what components exist on this surface?)

Histogram of custom-element tag names, filtered to card-ish components.
Run per surface; run again after scrolling (continuations load lazily).

```js
(() => {
  const c = {};
  for (const el of document.querySelectorAll('*')) {
    const t = el.tagName.toLowerCase();
    if (/renderer$|view-model$|^ytm-|^ytd-/.test(t)) c[t] = (c[t] || 0) + 1;
  }
  const cardish = Object.entries(c)
    .filter(([t]) => /video|lockup|shelf|item|channel|playlist|card|result/.test(t))
    .sort((a, b) => b[1] - a[1]);
  return {
    url: location.href,
    lang: document.documentElement.lang,
    cardish: Object.fromEntries(cardish),
  };
})();
```

Adapt the two regexes to the site's naming scheme (the ones above are
YouTube-flavoured). An element present as `1` with empty text is often a
dormant stub from a previous SPA route — verify before modelling it.

## 2 — Card anatomy (which anchors are durable inside one card?)

Dump one card's skeleton and candidate text anchors. Decides the shape's
`textSelectors` — remember the discipline: semantic tags / ids / stable
`data-*` only, never styling classes (docs/pitfalls.md §1).

```js
(() => {
  const card = document.querySelector('CARD-SELECTOR-HERE');
  return {
    outerHTML: card?.outerHTML.slice(0, 1500),
    ids: [...(card?.querySelectorAll('[id]') ?? [])].map((e) => e.id).slice(0, 12),
    h3: card?.querySelector('h3')?.textContent?.trim().slice(0, 80),
    titleAttr: card?.querySelector('a[title]')?.getAttribute('title')?.slice(0, 80),
  };
})();
```

Check the byline/metadata rows for injected UI-language chrome (view
counts, dates, badges) — whatever carries it must stay OUT of the sample.

## 3 — Shape-mirror (prove the model against the live page)

Mirror the extractor's shapes — selectors, text allow-lists, fallbacks,
outermost-wins dedup — and report per-kind counts, dedup drops, and empty
samples. **Keep the mirrored shapes in sync with the extractor under test by
hand; run BEFORE the change (drift evidence) and AFTER (proof), on every
claimed surface.** Done-bar: expected counts, expected dedup, zero empty
samples except documented fail-open cells.

```js
(() => {
  // Transcribe the shapes from the extractor being shipped:
  const shapes = [
    { k: 'video', sel: 'CARD-A, CARD-B', ts: ['[id="video-title"]'], fb: ['h3'] },
    { k: 'shelf', sel: 'SHELF-SELECTOR', ts: ['[id="video-title"]'], fb: ['h3'] },
  ];
  const cands = [];
  const seen = new Set();
  for (const s of shapes)
    for (const el of document.querySelectorAll(s.sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      cands.push({ el, s });
    }
  const outer = cands.filter((c) => !cands.some((o) => o.el !== c.el && o.el.contains(c.el)));
  const ser = (el, sels) => {
    const m = new Set();
    for (const sel of sels) for (const e of el.querySelectorAll(sel)) m.add(e);
    const list = [...m];
    return list
      .filter((e) => !list.some((o) => o !== e && o.contains(e)))
      .filter((e) => e.getAttribute('aria-hidden') !== 'true' && !e.hidden)
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ');
  };
  const byKind = {};
  const emptyTags = [];
  for (const { el, s } of outer) {
    let t = ser(el, s.ts);
    if (!t && s.fb) t = ser(el, s.fb);
    byKind[s.k] = (byKind[s.k] || 0) + 1;
    if (!t) emptyTags.push(el.tagName.toLowerCase());
  }
  return { total: outer.length, droppedNested: cands.length - outer.length, byKind, emptyTags };
})();
```

## 4 — Navigation-timing trace (enforce rules / pitfalls §5)

Measures where the pre-commit window is on this site: `navigate`-event time
vs URL commit vs first DOM mutations, plus whether `navigation.transition`
is observable (on YouTube it is `null` throughout — do not design against
it without measuring). Click a result AFTER arming.

```js
(() => {
  const t0 = performance.now();
  const trace = [];
  const sample = (label) =>
    trace.push({
      t: Math.round(performance.now() - t0),
      label,
      transition: navigation.transition == null ? null : 'active',
      loc: location.pathname,
    });
  window.__navTrace = trace;
  navigation.addEventListener('navigate', (e) => {
    sample('navigate dest=' + e.destination.url.slice(0, 60));
    queueMicrotask(() => sample('microtask'));
    setTimeout(() => sample('timeout0'), 0);
  });
  new MutationObserver(() => {
    if (trace.filter((x) => x.label === 'mutation').length < 5) sample('mutation');
  }).observe(document.body, { childList: true, subtree: true });
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      sample('URL-COMMITTED');
      last = location.href;
    }
  }, 10);
  return 'armed — click a result, then read window.__navTrace';
})();
```

## 5 — Guard-dance simulation (enforce rewrite loop safety, end to end)

A faithful mini-Movar: loop guard in `sessionStorage` (exact-href, like
`lib/loop-guard.ts`), the `searchParams` gates, the pre-commit deferral, a
WXT-style navigate watcher with its own `lastUrl`, and a 150 ms-debounced
MutationObserver — logging to `sessionStorage` so the log survives reloads.
Install → let the rewrite dance settle (re-install after each full load, as
the real content script would) → click a result → the log must show the
click landing with only `bail(...)` entries around it, no `REPLACE`.

Also verify byte-equality of the guard: before the rewrite, store
`location.href`; after the site strips the params, compare — a single byte
of encoding drift breaks exact-href guards into a reload loop.

```js
(() => {
  const GUARD = 'sim:guard',
    LOG = 'sim:log';
  const read = (k) => JSON.parse(sessionStorage.getItem(k) || '[]');
  const write = (k, v) => sessionStorage.setItem(k, JSON.stringify(v));
  const log = (m) => {
    const l = read(LOG);
    l.push((Date.now() % 1e5) + ' ' + m);
    write(LOG, l);
  };
  const marked = () => read(GUARD);
  const mark = (h) => {
    const g = marked();
    if (!g.includes(h)) {
      g.push(h);
      write(GUARD, g);
    }
  };

  const applyOnce = (why) => {
    const href = location.href;
    if (marked().includes(href)) {
      log('bail(guard) [' + why + ']');
      return;
    }
    const url = new URL(href);
    // The rule's gates, transcribed:
    if (!url.pathname.startsWith('/RESULTS-PATH') || !url.searchParams.has('QUERY-PARAM')) {
      log('bail(gates) [' + why + '] ' + url.pathname);
      return;
    }
    const next = new URL(href);
    next.searchParams.set('PARAM-1', 'VALUE-1'); // the rule's params
    if (next.toString() === href) {
      log('noop(at-target) [' + why + ']');
      return;
    }
    mark(href);
    log('REPLACE [' + why + '] -> ' + next.toString().slice(0, 100));
    location.replace(next.toString());
  };

  let lastUrl = new URL(location.href);
  navigation.addEventListener('navigate', (event) => {
    const newUrl = new URL(event.destination.url);
    if (newUrl.href === lastUrl.href) return;
    const oldUrl = lastUrl;
    lastUrl = newUrl;
    if (location.href !== newUrl.href) {
      const priorHref = location.href;
      log('defer(pre-commit) new=' + newUrl.pathname);
      setTimeout(() => {
        if (location.href !== priorHref) {
          log('commit ' + location.pathname);
          applyOnce('locchange');
        } else log('never-committed, skipped');
      }, 0);
      return;
    }
    log('post-commit ' + location.pathname);
    applyOnce('locchange-immediate');
  });

  let t = null;
  new MutationObserver(() => {
    if (t) return;
    t = setTimeout(() => {
      t = null;
      applyOnce('mutation');
    }, 150);
  }).observe(document.body, { childList: true, subtree: true });

  log('harness installed on ' + location.href.slice(0, 80));
  applyOnce('initial');
  return { guard: marked(), logTail: read(LOG).slice(-3) };
})();
```

Read the log with `JSON.parse(sessionStorage.getItem('sim:log'))`.

## 6 — Classifier pre-verification (before pinning fixture verdicts)

Fixture manifests assert `classifyBySnippet`'s verdicts — verify them with
the real pipeline BEFORE writing the manifest, from `apps/extension` (the
package with the harness deps). Drop a throwaway `*.test.ts` into
`src/lib/`, run it, delete it:

```ts
import { it } from 'vitest';
import { classifyBySnippet, getProfiles } from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';

const profiles = getProfiles(['uk', 'ru']);
it('probe', () => {
  for (const s of ['SAMPLE-1', 'SAMPLE-2'])
    console.log(
      s.slice(0, 40),
      '→',
      JSON.stringify(classifyBySnippet(s, profiles, francRung3Resolver)),
    );
});
```

Run with `--disable-console-intercept` to see the output. A verdict the
pipeline gets wrong is encoded in the manifest as a loud, annotated
false-keep (see `fixtures/youtube/watch-next-lockups.expected.json`), never
silently dropped.

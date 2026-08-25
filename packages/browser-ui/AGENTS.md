# Browser UI — `@movar/browser-ui`

> Flat, locale-aware recreations of the real browser UI that Movar's install
> guidance points at.

## What it does

Renders sixteen mockups as self-contained HTML strings, plus a stylesheet that
draws them in each platform's own palette, light and dark — two families:

- **Install walkthrough** (ten): a Chrome install dialog, a Firefox
  doorhanger, the macOS Safari Extensions pane, an iOS Settings screen, and so
  on. Two surfaces walk a visitor through the same install and must show the
  same picture for the same step: the marketing site's `/install` page
  (pre-install, Astro) and the extension's first-run onboarding (post-install,
  React). This package is where that agreement lives.
- **Language-settings panels** (six): each platform's own screen for
  reordering a language-priority list — `chromium-languages`,
  `firefox-languages`, `macos-language-region`, `windows-languages`,
  `ios-language-region`, `android-languages`. Drawn directly by the
  marketing site's `/uk/guide` diagnosis widget, one per fix it can recommend:
  removing a blocked language, adding a missing one, or promoting one already
  present to the top of the list. Unlike the install walkthrough, nothing
  routes to these through `mockupFor` — the widget already knows which
  platform and which fix apply, and calls `renderBrowserUi` directly.

## Boundaries & invariants

**No `@movar/theme`, ever.** Every colour, radius and metric here belongs to
Chrome, Firefox, macOS or iOS. A mockup drawn in Movar's greens looks like a
Movar component cosplaying as a browser — the exact failure the previous
grey-bar illustrations had. A design-token sweep must skip `styles/`.

**Strings, not components.** The mockups render to HTML strings because the
marketing site is Astro with no React integration and the extension is React;
a string is the one representation both can mount. That is the entire reason
this is a package rather than two files, so don't "improve" it into JSX.

**Decorative only.** Every mockup's root carries `aria-hidden="true"`. A screen
reader announcing a fake "Add extension" button would be worse than announcing
nothing; the authoritative instruction is the step body beside it.

**Browser words, not Movar's.** `labels.ts` holds facsimiles of the _browsers'_
shipped strings. Movar's own copy stays in `@movar/i18n` and the marketing
site's `i18n.ts`. The Ukrainian Chrome strings are sourced from Google's uk
documentation; the rest follow each vendor's house style and are safe to
correct against a real screenshot. The language-panel strings follow the same
rule but carry over verbatim from `apps/marketing/src/lib/guide-diagnosis.ts`,
whose step prose already quotes them.

**Language names are the caller's data, not this package's.** The six
language-panel mockups render whatever strings `BrowserUiOptions.languages`
hands them (e.g. «російська», «англійська») — they are never added to
`labels.ts`, which holds only the panel's own chrome ("Add languages", "Move
Up", …). This package never reads what a language string _says_, only its
position: a `highlight` of `'remove'` or `'top'` always acts on the list's
last row, a fixed convention rather than a guess at which entry is Russian or
Ukrainian. See the comment on `languageRows` in `mockups.ts`.

**The extension is named `Movar` in every locale.** `_locales/uk` sets
`extName` to the Latin form, so a Ukrainian mockup must not transliterate it —
that's a name no visitor's browser displays.

## Public API / entry points

| Export                     | Notes                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| `renderBrowserUi(m, opts)` | Mockup → HTML string. `opts` = `{ locale, iconSrc, highlight?, languages? }` |
| `mockupFor(flow, kind)`    | The install-walkthrough routing table: which mockup a step gets, or `null`   |
| `labelsFor(locale)`        | The browser strings, for tests and assertions                                |
| `EXTENSION_NAME`           | `'Movar'` — locale-independent, see above                                    |
| `EXAMPLE_HOST`             | The host drawn in mockup address bars                                        |
| `browser-ui.css`           | `@import '@movar/browser-ui/browser-ui.css'` — required to render            |

`iconSrc` is injected rather than imported because the two surfaces resolve it
differently: a `public/` path on the marketing site, `runtime.getURL` in the
extension. It's ignored by the six language-panel mockups, which draw no
extension icon.

`highlight` (`'remove' | 'add' | 'top'`, defaults to `'remove'`) and
`languages` (the reader's own list; defaults to a representative trio) only
affect the six language-panel mockups — the ten install-walkthrough ones
ignore both. There is no routing table for them the way there is for install
steps: the caller (the `/uk/guide` diagnosis widget) already knows which
platform and which fix apply, and passes both straight through.

## Layout

| File                    | Holds                                                 |
| ----------------------- | ----------------------------------------------------- |
| `src/index.ts`          | Public surface + the flow/step → mockup table         |
| `src/mockups.ts`        | One builder per mockup                                |
| `src/labels.ts`         | The browsers' own words, en + uk                      |
| `src/html.ts`           | `esc`, lucide `IconNode` → `<svg>` string, `join`     |
| `styles/browser-ui.css` | The six platform palettes and every mockup's geometry |

## Dependencies

`lucide` (core, framework-free) for glyphs — serialised to SVG strings by
`html.ts`, so a glyph here is identical to the same glyph rendered by
`lucide-react` or `lucide-astro` elsewhere in the repo. Nothing else, and no
`@movar/*` deps: this must stay liftable into the Astro site.

## Consumers

`apps/marketing` (`components/InstallGuide.astro`, install walkthrough) and
`apps/extension` (`entrypoints/onboarding/illustrations.tsx`, same family).
Both must `@import` the stylesheet in their global CSS — the extension's
`globals.css` and the marketing site's `styles/global.css`.

The language-panel family has one consumer so far: `apps/marketing`'s
`components/GuideChecker.astro`, via `lib/guide-diagnosis.ts`, which maps a
visitor's user agent and language list to a mockup name, a `highlight`, and
the reader's own `languages` array.

## Working on it

```bash
# From packages/browser-ui
pnpm test && pnpm lint && pnpm typecheck
```

Changing a mockup's _appearance_ changes the marketing site's visual e2e
baselines (`marketing-install-{en,uk}[-dark]`). Regenerate them with
`pnpm e2e:baselines:marketing` — Docker, `--platform linux/amd64`.

## Gotchas

**`@import` ordering.** The stylesheet must be imported alongside the other
`@import`s at the top of each app's global CSS, not after `@source` or any rule
— CSS drops an `@import` that follows other rules.

**React needs `dangerouslySetInnerHTML`.** The extension's wrapper carries a
justified `eslint-disable` for `@eslint-react/dom-no-dangerously-set-innerhtml`.
Keep the markup free of `<script>` and event-handler attributes so that
justification stays true.

**Mockups are per-browser on purpose.** If you find yourself reusing a Chrome
mockup for the Firefox flow, that's the regression this package was built to
end. Add a variant instead.

**Not every platform lights up the same way for 'top'.** Chrome and Firefox
each have a dedicated reorder control, so their 'top' highlight leaves the
language list in place and lights that control instead. macOS, iOS, Windows
and Android reorder by dragging in the real UI, which a static picture can't
animate, so their 'top' shows the _result_ — the row already promoted,
selected — via the `reorder` flag `languageRows` takes in `mockups.ts`. Don't
"fix" Windows or Android to match Chrome's popover; they were deliberately
grouped with macOS/iOS instead.

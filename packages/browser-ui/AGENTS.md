# Browser UI — `@movar/browser-ui`

> Flat, locale-aware recreations of the real browser UI that Movar's install
> guidance points at.

## What it does

Renders ten mockups — a Chrome install dialog, a Firefox doorhanger, the macOS
Safari Extensions pane, an iOS Settings screen, and so on — as self-contained
HTML strings, plus a stylesheet that draws them in each platform's own palette,
light and dark.

Two surfaces walk a visitor through the same install and must show the same
picture for the same step: the marketing site's `/install` page (pre-install,
Astro) and the extension's first-run onboarding (post-install, React). This
package is where that agreement lives.

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
correct against a real screenshot.

**The extension is named `Movar` in every locale.** `_locales/uk` sets
`extName` to the Latin form, so a Ukrainian mockup must not transliterate it —
that's a name no visitor's browser displays.

## Public API / entry points

| Export                     | Notes                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| `renderBrowserUi(m, opts)` | Mockup → HTML string. `opts` = `{ locale, iconSrc }`              |
| `mockupFor(flow, kind)`    | The shared routing table: which mockup a step gets, or `null`     |
| `labelsFor(locale)`        | The browser strings, for tests and assertions                     |
| `EXTENSION_NAME`           | `'Movar'` — locale-independent, see above                         |
| `EXAMPLE_HOST`             | The host drawn in mockup address bars                             |
| `browser-ui.css`           | `@import '@movar/browser-ui/browser-ui.css'` — required to render |

`iconSrc` is injected rather than imported because the two surfaces resolve it
differently: a `public/` path on the marketing site, `runtime.getURL` in the
extension.

## Layout

| File                    | Holds                                                  |
| ----------------------- | ------------------------------------------------------ |
| `src/index.ts`          | Public surface + the flow/step → mockup table          |
| `src/mockups.ts`        | One builder per mockup                                 |
| `src/labels.ts`         | The browsers' own words, en + uk                       |
| `src/html.ts`           | `esc`, lucide `IconNode` → `<svg>` string, `join`      |
| `styles/browser-ui.css` | The four platform palettes and every mockup's geometry |

## Dependencies

`lucide` (core, framework-free) for glyphs — serialised to SVG strings by
`html.ts`, so a glyph here is identical to the same glyph rendered by
`lucide-react` or `lucide-astro` elsewhere in the repo. Nothing else, and no
`@movar/*` deps: this must stay liftable into the Astro site.

## Consumers

`apps/marketing` (`components/InstallGuide.astro`) and `apps/extension`
(`entrypoints/onboarding/illustrations.tsx`). Both must `@import` the
stylesheet in their global CSS — the extension's `globals.css` and the
marketing site's `styles/global.css`.

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

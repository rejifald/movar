# Marketing screenshots

Drop PNG files here. The marketing site references them by exact filename.

| Filename                   | What it shows                                                        | Aspect | Approx. dimensions |
| -------------------------- | -------------------------------------------------------------------- | ------ | ------------------ |
| `google-without-movar.png` | Cyrillic query on google.com.ua, Russian-language results dominating | 16:10  | 1280×800           |
| `google-with-movar.png`    | Same query, Ukrainian-language results                               | 16:10  | 1280×800           |
| `popup.png`                | Extension popup open on a real page                                  | 4:3    | 480×360            |
| `options.png`              | Extension options page with edited priority list                     | 16:10  | 1280×800           |

The `BeforeAfter.astro` component will render placeholder cards until
`google-without-movar.png` and `google-with-movar.png` exist at this path.

## Regenerating the before/after pair

`google-without-movar.png` + `google-with-movar.png` are captured from
real `google.com.ua` SERPs by
`apps/extension/scripts/capture-marketing-before-after.mts`. The script
spins up two short-lived Chrome sessions (real Chrome via
`channel: 'chrome'`, not bundled Chromium — required to dodge Google's
bot challenge):

- **without** — `ru-RU` `Accept-Language`, bare URL. Represents the
  legacy Ukrainian browser config (Russian-set system locale, common on
  older hardware) Movar's pitch targets.
- **with** — `uk-UA` `Accept-Language`, URL with Movar's
  `&hl=uk&lr=lang_uk` params appended (matches the rule in
  `packages/rules/src/index.ts`).

Each session screenshots the SERP at 1280×800, after removing the
navigation tabs, AI Overview, sponsored products carousel, right-side
knowledge panel, and other chrome — only the search box and the
organic results / news cards remain.

Run on demand:

```bash
pnpm --filter @movar/extension exec tsx \
  scripts/capture-marketing-before-after.mts
```

A Chrome window will pop up briefly for each capture — that's
expected (`headless: false` is part of what gets us past Google's bot
heuristics).

### Query selection

The current query is `"новини війни"`. Picking a demo query needs
care — it must (a) survive Movar's `lr=lang_uk` strict filter and (b)
show a visible diff between the two Accept-Language states. The
original e-commerce pick "Реле напруги" failed (a): Google's per-page
classifier hasn't tagged enough UA-language pages in the hardware-relay
niche, so `lr=lang_uk` returns "не знайдено жодного документа" and
strips the with-Movar SERP to blank. To switch queries, edit `QUERY`
at the top of the script and re-run.

Plan to re-capture roughly quarterly: real SERPs drift, and Google's
chrome (AI Overview layout, ad density, knowledge-panel cards) shifts
more often than that.

For store-listing screenshots (Chrome Web Store, Edge, AMO), see
`apps/extension/store-assets/` (ticket #9).

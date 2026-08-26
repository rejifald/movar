---
type: plan
id: movu-rakhuyut
status: approved
date: '2026-08-26'
summary: >-
  Approved plan for the fourth blog post — «Мову рахують: звідки береться
  українська в іграх, сервісах і на сайтах» — the demand-side argument the first
  three posts kept gesturing at without making. Where «Тиха капітуляція»
  diagnoses, «Українська за замовчуванням» instructs and «Мовна гігієна»
  maintains, this one answers «і що з того»: a language setting is a
  measurement, and the measurement is what does or does not fund Ukrainian
  localisation. Evidence base: movu-rakhuyut.research.md.
---

# «Мову рахують» — approved article plan

Title: **«Мову рахують: звідки береться українська в іграх, сервісах і на сайтах»**.

## The gap this fills

The blog has three posts and they all stop at the same place. «Тиха
капітуляція» explains why sites hand you Russian. «Як зробити українську
мовою за замовчуванням» explains where the settings are. «Мовна гігієна»
explains why they come undone. All three assume the reader already accepts
that the settings are worth maintaining.

The fourth post is the one that argues it — and the one paragraph that
already tried, «Спільна» at the foot of «Мовна гігієна», is the seed: it
cites the Steam survey in four sentences and moves on. This post is that
paragraph at full length.

## Posture — the load-bearing decision

**We do not ask the reader to share our conclusion.** The whole piece is
sources, dates and arithmetic they can redo. This is a stance with teeth,
and it costs us things:

- **Every unflattering number ships.** The Steam plateau (0,73% → 0,70%,
  flat for over a year). The 47% of Cyberpunk players who stayed on Russian
  after the localisation arrived. Ukrainian stuck at 0,6% of the web since
  2022 while Russian's fall went to English instead. The 90% of new
  Ukrainian-language tracks nobody heard. The falling _share_ of paid Steam
  releases carrying Ukrainian. A section that has a counter-figure prints
  it in that same section, never in a footnote.
- **A dedicated «Чого ці числа не доводять» section**, naming the
  correlation problem, the war as a confound, and each source's own limit.
- **No per-capita arithmetic on Ukraine's population.** Estimates span
  22–39 million; a conclusion resting on that is not evidence. See
  research §1.
- **No vendor marketing numbers.** The «localised store listings convert
  +26%» genre is unfalsifiable and excluded, however useful it sounded.

The reason is not modesty. An article whose thesis is «look at the
measurements» forfeits its own thesis the moment it curates them.

## Spine

Four ways a language setting becomes a number, then one worked example of
each kind:

1. **The header the browser sends** (`Accept-Language`) — every site.
2. **The locale an app runs in** — Steam publishes the monthly total.
3. **The version of the page you opened** — Wikipedia, no setting at all.
4. **What you actually finished** — recommenders.

Two of those are what you _declared_; two are what you _did_. The article
says so and then shows that the numbers behave differently.

## The centrepiece

**Cyberpunk 2077.** The only case found where a publisher measured the same
audience before and after a Ukrainian localisation shipped and published
both halves: 88% Russian before; 42% Ukrainian / 47% Russian after.

It opens the article and gets its own chart. Three reasons it beats the
Steam table as the lead: it is a closed causal loop rather than a
correlation; it names a real decision by a real studio; and its headline
figure argues _against_ the article's own side, which is what earns the rest
of the piece its credibility. Attribution stays precise — the studio's
localisation manager said this on a podcast, CD Projekt RED did not publish
it.

## Skeleton

1. **Вступ** — the Cyberpunk story, then the thesis in one line, then the
   promise that the awkward numbers are included.
2. **Що саме рахують** — the four mechanisms above.
3. **Steam** — Valve's own statement of purpose (quoted), the 2022→2026
   series, and the plateau.
4. **Cyberpunk у повному вигляді** — the chart, then the honest reading of
   the 47%: framed as a mechanism (games do not re-ask; the setting was made
   years ago; the update announced nothing), never as an accusation
   (`docs/copy.md` §1.7). Then the supply side: the KULI catalogue, with the
   caveat that a growing catalogue is not a clean count of growing supply.
5. **Wikipedia** — choice with no setting involved; 2013 → Sept 2025; then
   what spoils the picture (the 2023 peak, the annual-vs-monthly mismatch,
   Wikipedia shrinking overall). Closes on editors — 4 813 vs 16 558 — which
   is the article's _quality_ evidence, not its quantity evidence.
6. **W3Techs** — the long arc, with the explicit warning against reading
   Russian's fall as Ukrainian's gain.
7. **Музика** — the fastest-moving chain, immediately undercut by its own
   90%-unheard figure. Quantity and attention are measured separately.
8. **Чого ці числа не доводять** — the limits section.
9. **Чому одне налаштування щось важить** — concedes the arithmetic (one
   client does not move a second decimal place), then turns it: those
   decimals have no source _other_ than the sum of individual settings, and
   one setting is read by many counters.
10. **З чого почати** — guide, checklist, the two sibling posts; then the
    gap Movar closes, kept inside what `docs/copy.md` allows it to claim.

## Assets

**One scene per data section — five for this post, plus the two «Тиха
капітуляція» already had.** All seven are SVG rendered from
`src/lib/article-figures.ts` and inlined into the page; the pipeline, its two
costs and the guards around it are documented in the research doc under
_Charts_.

They share `article-assets/chartKit.tsx` (frame, palette, type scale, text and
bar primitives). The older two scenes were migrated onto it rather than left
alone, so no chart keeps a private copy of a figure any more — the Steam survey
in particular was transcribed twice, once per article.

## Register

Written for a reader who does not work in tech. No byte, no
`Accept-Language`, no locale; every product and company glossed at first
mention. The full rule, and the list of glossed terms, is rule 6 in the
research doc.

## Consequences to handle

- `/uk/blog` gains a fourth card, so the `blog` visual baseline in
  `apps/e2e/src/marketing/marketing.visual.spec.ts` changes and must be
  regenerated (`pnpm e2e:baselines:marketing`, amd64 Docker). `blog-post`
  targets `tykha-kapitulyatsiya` and is unaffected.
- No `i18n.ts` parity work: the blog is uk-only by design
  (`content.config.ts`), and `BaseLayout` already receives
  `localeAlternates={false}` from the shared post template.
- Nothing here changes a product claim, so the mirrored store/marketing
  surfaces are untouched.

## Refresh contract

Every figure in the post is dated in the prose on purpose, so a stale one is
visible rather than silent. When one is refreshed, the prose, the chart
component and `movu-rakhuyut.research.md` move together, and
`capture:article` re-runs in the same change.

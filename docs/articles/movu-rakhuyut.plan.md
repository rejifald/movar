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
  maintains, this one answers «і що з того» twice over: a language
  setting is a measurement, and the measurement is what does or does not fund
  Ukrainian localisation — and the same setting picks the corpus that answers
  the reader today, in search and in translation. Evidence base:
  movu-rakhuyut.research.md.
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
- **A dedicated «Що з цього доводиться, а що ні» section**, naming the
  correlation problem, the war as a confound, and each source's own limit.
- **No per-capita arithmetic on Ukraine's population.** Estimates span
  22–39 million; a conclusion resting on that is not evidence. See
  research §1.
- **No vendor marketing numbers.** The «localised store listings convert
  +26%» genre is unfalsifiable and excluded, however useful it sounded.
- **The mechanism with no number says so.** The list of languages the browser
  sends is the one of the four the post cannot put a figure against: nobody
  publishes an aggregate, and each site counts it privately in its own
  analytics. Research §7d records where that was checked; the prose states it
  where the mechanism is introduced rather than letting the gap read as an
  omission.
- **One promise is suspended, and only out loud.** The AI Overview figures in
  the search section rest on a dataset Serpstat has not published — the single
  place the lead's «open it and recount it» does not hold. The section says so
  in the paragraph that prints them, and a test keeps the admission attached
  to the figure.

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
   3b. **Firefox** — added 2026-08-28, after the search recorded in research §7d.
   The same _kind_ of counter as Steam and the only one in the post aimed at
   Ukraine rather than at the world, published weekly by the browser vendor and
   re-derivable by the reader in two clicks. Ships with all three of its limits
   in-section per the posture above — one vendor's telemetry, the interface
   locale rather than the header, and English rising over the same window — and
   with the post's most uncomfortable single number, which is that 52,0% of
   Firefox clients in Ukraine still run in Russian.
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
8. **Пошук і переклад** — the second axis, added after the first review.
   Everything before it is a reason to switch _for other people, later_; this
   is the one that costs the reader something _now_. The query language picks
   the corpus (Serpstat on Google AI Overview), part of that corpus was placed
   there (VIGINUM, then NewsGuard on what came back out of the chatbots), and
   a dubbed track is a version rather than a copy (Hellboy 2019 and «Брат-2»
   on Netflix, in opposite directions, then three named accent cases where the
   film itself is the citation and the reader is handed the episode number).
   Its three counter-figures are
   in-section per the posture above, and the sharpest is that switching costs
   the reader coverage today — the same W3Techs ratio, now read as a price
   rather than as a grievance.
9. **Що з цього доводиться, а що ні** — the limits section.
10. **Чому одне налаштування щось важить** — concedes the arithmetic (one
    client does not move a second decimal place), then turns it: those
    decimals have no source _other_ than the sum of individual settings, and
    one setting is read by many counters.
11. **З чого почати** — guide, checklist, the two sibling posts; then the
    gap Movar closes, kept inside what `docs/copy.md` allows it to claim.

## Assets

**One scene per data section — six for this post, plus the two «Тиха
капітуляція» already had.** The search-and-translation section is the
deliberate exception and stays unillustrated: its evidence is two published
reports and two documented incidents rather than a series, and the one figure
in it that would chart is the one figure a reader cannot re-derive. Giving the
post's most prominent visual treatment to its weakest source would invert the
reason Cyberpunk's unflattering number was put in the lead. All eight are SVG rendered from
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

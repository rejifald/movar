---
type: research
id: movu-rakhuyut-research
status: reference
date: '2026-08-26'
summary: >-
  Evidence base for the fourth blog post — «Мову рахують» — the article that
  argues the demand side: a language setting is a measurement, and the
  measurement is what funds (or does not fund) Ukrainian localisation. Every
  figure the article prints is recorded here with its primary source, the
  date it was gathered, and the methodological limit that keeps it honest.
  Gathered 2026-08-26 by direct fetch of the sources listed; figures that
  could only be had second-hand are flagged inline.
---

# «Мову рахують» — verified figures and sources

The article's whole claim is that the reader does not have to take our word
for anything. That only holds if every number in it is (a) traceable to a
source the reader can open, and (b) printed with the limit that makes it
honest. This file is the contract: **no number ships in the article that is
not in this file with a source.**

**This file is the prose record; the machine-readable source of truth is
[`apps/marketing/src/lib/article-figures.ts`](../../apps/marketing/src/lib/article-figures.ts).**
Every chart imports its series from there, so no figure is typed twice into a
component. Refresh procedure:

1. Edit the figure in `article-figures.ts` and update its `source` / `READ_ON`.
2. Update the sentence in the article that quotes it.
3. Re-run `pnpm --filter @movar/marketing capture:article`.
4. Update the corresponding row here.

Steps 2 and 3 are not on the honour system. `src/lib/article-figures.test.ts`
fails if a quoted figure is missing from the prose, if a derived ratio no longer
matches its inputs, or if the committed PNGs were rendered from different
numbers than the module now holds — that last one via a digest the capture
script stamps. Verified by deliberately perturbing a figure: the change surfaced
as four failing tests naming the stale prose, the stale ratio and the stale
PNGs.

Derived quantities — every «у N разів», every percentage-point change — are
**computed** by `ratio()` and `delta()`, never stored, so they cannot outlive
their inputs. The figures are also dated in the prose, so a stale one is
visible to a reader as well as to CI.

---

## 1. Steam — the client-language survey

The load-bearing example, because the chain is fully public: the setting is
a user setting, Valve publishes the resulting share monthly, and Valve says
in its own words that it uses the survey to decide where to invest.

### Valve's stated purpose (verbatim)

> "Steam conducts a monthly survey to collect data about what kinds of
> computer hardware and software our customers are using. Participation in
> the survey is optional, and anonymous. The information gathered is
> incredibly helpful to us as we make decisions about what kinds of
> technology investments to make and products to offer."

- **Source:** https://store.steampowered.com/hwsurvey — fetched 2026-08-26.
- **Why it matters:** this is the difference between "we infer that publishers
  read this" and "the platform says the data drives investment decisions".
  The article may assert the latter. It may NOT assert that any specific
  publisher localised any specific game because of this table — nobody has
  said that on the record.

### The Ukrainian share over time

| When                                     | Share         | Source                                                                                                                                                                |
| ---------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 2022 (around the full-scale invasion) | 0.16–0.17%    | gamedev.dou.ua (Oct 2022) and GameSensor via DOU (Mar 2023) — the two give 0.17% and 0.16%; print the range or the later figure, never a false-precision single value |
| October 2022                             | 0.34%         | https://gamedev.dou.ua/news/ukrainian-steam-record-number-of-users/ (2022-10-06) — 17th of 28 languages                                                               |
| March 2023                               | 0.50%         | https://gamedev.dou.ua/news/steam-games-with-ukrainian-localization-stats/ (2023-03-20) — 16th; prior-year figure given as 0.43%                                      |
| August 2023 survey                       | 0.64%         | https://dev.ua/en/news/ukrainska-mova-v-steam-1748866563 — 14th, the month Ukrainian passed Italian                                                                   |
| May 2025                                 | 0.73%         | same dev.ua piece — 14th; gap to Thai (0.81%) down to 0.08 pp from 0.31 pp in Sept 2023                                                                               |
| July 2026                                | 0.70% (+0.01) | https://store.steampowered.com/hwsurvey — fetched 2026-08-26                                                                                                          |

**The honest reading, which the article must keep:** roughly 4× growth
concentrated in 2022–2023, and then a near-stall. Quote the _size_ of the
later drift rather than characterising it: +0.47 pp over the nineteen months
to August 2023, then **+0.06 pp over the following thirty-five**. Do NOT call
the tail "flat" or "a plateau" — it climbs to 0.73% and settles at 0.70%, and
the chart's own labelled points would contradict the word. Do NOT say "it
keeps climbing" either. The stall is the article's argument, not an
inconvenience to it.

### The comparison figures (July 2026 survey, same fetch)

- English 39.61%, Simplified Chinese 22.52%, **Russian 9.30% (−0.31)**,
  Polish 1.74%, Czech 0.55%, **Ukrainian 0.70% (+0.01)**, Italian 0.63%,
  Hungarian 0.38%.
- Russian is **13.3×** Ukrainian. That ratio is the single most useful number
  in the article and it is a plain division of two published figures.

### Methodological limit — MUST be stated

The survey is a **sample**: Valve asks a subset of users each month, and
participation is optional. So "your client is a row in the table" is loose.
The precise claim, which the article uses: the share the table reports is the
share of people who set that language; whether your machine is polled in any
given month is chance.

### Deliberately NOT used

A per-capita argument ("at Poland's rate Ukrainian would be 1.5%"). Ukraine's
population is estimated anywhere from 22–25 million (Ministry of Social
Policy) to 29 million (Institute of Demography) to 32.3 million (Wikipedia,
Apr 2026) to 39.5 million (Worldometer). A conclusion resting on a figure
with that spread is not evidence, and printing it would undercut the
article's whole posture. Left out on purpose — do not add it back.

---

## 2. Cyberpunk 2077 — the centrepiece

The only case found where a publisher measured the _same audience_ before and
after a Ukrainian localisation shipped, and published both halves.

- **Before** the Ukrainian localisation, among players from Ukraine:
  **88% Russian**, 7% fully English, 5% Russian subtitles with English audio.
- **After** (players who launched the game at least once in the two weeks
  following the Phantom Liberty release): **42% Ukrainian, 47% Russian**
  (subtitles or audio), 7% fully English.
- **Source of the figures:** Maria Strilchuk, Localization Project Manager &
  Engineer at CD Projekt RED, on the «Маніфест Академія» YouTube podcast;
  reported at https://gamedev.dou.ua/forums/topic/47022/ — fetched 2026-08-26.
- **Localisation shipped:** 2023-09-21 (main game), by UnlocTeam, coordinated
  directly with CD Projekt RED; «Шлякбитраф» worked on Phantom Liberty. The
  community had campaigned for roughly three years.
  Sources: https://dev.ua/news/dlia-cyberpunk-2077-vyishla-ukrainska-lokalizatsiia-1695375089,
  https://zaxid.net/yak_ukrayinizuvavsya_cyberpunk_2077_n1571332

### The Witcher 3 — the same studio, going again

- **Announced** at Gamescom Opening Night Live, August 2026: the free remaster
  of The Witcher 3, shipping **29 September 2026**, gets an official Ukrainian
  **text** localisation for the first time. No Ukrainian voice acting. The
  «Songs of the Past» expansion follows in 2027 as paid DLC.
- CDPR also dropped Russian voice acting from that expansion, citing its March
  2022 decision to stop working with Russian and Belarusian tax residents.
- **Sources:** https://dev.ua/news/onovlenyi-vidmak-z-ukrainskoiu-1787719716 and
  https://gamedev.dou.ua/forums/topic/61608/ — two independent Ukrainian
  specialist outlets reporting the same announcement, fetched 2026-08-27.
- **Not confirmable from the storefront.** The Witcher 3 Steam page serves an
  age gate, and the language list visible on it is Steam's own _interface_
  menu — the exact thing this article is about, not the game's localisation
  table. Do not cite it as confirmation.

**How the article is allowed to use it.** As a dated fact and nothing more.
CDPR explained the decision by its own policy, not by anyone's numbers, so the
prose says so explicitly. And there is no uptake figure — the remaster had not
shipped when the post was written — which the article turns into the point:
this is the next measurement, and the reader can check it themselves. Adding an
uptake number later means adding a source and a date, not editing the sentence.

**Why the Cyberpunk case is the centrepiece.** It closes the loop the rest of the article
can only assert: supply arrived, and then the audience's _measured_ choice
decided what the next budget meeting sees. 47% > 42% is the fact that does
the work — and it is a fact against our own side of the argument, which is
exactly why it belongs at the front.

**Limit:** second-hand (a podcast statement reported by DOU), not a CDPR
press release. State it as "the studio's localisation manager said", never as
"CD Projekt RED published".

---

## 3. Supply side — the Ukrainian game-localisation catalogue

- **Now:** 3,337 official, 82 semi-official, 987 unofficial — **4,406 total**.
  Source: https://kuli.com.ua/ homepage counters, fetched 2026-08-26.
- **Two months after launch (June 2023):** the catalogue had gathered "over
  1,500" games. Source: https://gamedev.dou.ua/blogs/kuli-project-two-months/
- Run by UnlocTeam.

**Limit that MUST be stated:** the catalogue grew partly because it got
better at cataloguing. A count of a growing catalogue is not a clean count of
a growing supply, and the article says so rather than letting the reader
assume the stronger claim.

Related, from the same corner and usable as colour rather than proof:

- 2023 → 2025, tracked Ukrainian translations roughly doubled (1,477 → 3,000+):
  https://dev.ua/en/news/chym-zapamiatavsia-2025-rik-dlia-ukrainskykh-hravtsiv-1766757155
- 2025 additions with Ukrainian: _Clair Obscur: Expedition 33_, _Kingdom Come:
  Deliverance II_; Epic Games Store and Twitch shipped Ukrainian interfaces.
- Offworld Industries added the Ukrainian Armed Forces to _Squad_ citing a
  Ukrainian player base ranked 3rd–4th globally in size — same source. This
  is a _player-count_ decision, not a _language-setting_ decision; use it, if
  at all, as an aside, and do not let it read as the latter.
- 405 games with Ukrainian support released in 2022; the _percentage_ of paid
  releases carrying Ukrainian peaked in 2018–2019 and has fallen since even
  as the absolute count rose. Source: GameSensor via
  https://gamedev.dou.ua/news/steam-games-with-ukrainian-localization-stats/
  — a genuinely awkward fact for a triumphalist reading, and worth keeping.

---

## 4. Wikipedia — choice without a settings screen

The cleanest demonstration in the whole file, because there is no setting
involved at all: the number is made purely of which link a person opened.

### Share of Wikipedia pageviews originating in Ukraine

| When             | Ukrainian   | Russian     | English     |
| ---------------- | ----------- | ----------- | ----------- |
| 2013             | 16.4%       | 71.1%       | 8.1%        |
| 2024 (full year) | 39.19%      | 45.03%      | 10.5%       |
| September 2025   | 33.6% (47M) | 45.7% (64M) | 12.9% (18M) |

Printed to **one decimal** in both prose and chart (39.2% / 45.0%, not
39.19% / 45.03%). The underlying sources give 39.185% and 45.03%; carrying two
decimals for one row and one for the others implies a precision the series
does not have.

- **Sources:** https://uk.wikipedia.org/wiki/Українська_Вікіпедія (2013 and
  Sept 2025 figures, fetched 2026-08-26);
  https://chytomo.com/v-ukraini-rosijsku-vikipediiu-vse-shche-vykorystovuiut-chastishe/
  (2025-01-10, for the 2024 annual figures).
- **Ratio:** Russian led 4.3× in 2013 and 1.36× in September 2025.

**Two limits the article must carry.**

1. 2024 is an annual figure and September 2025 is a single month — they are
   not like-for-like, and the apparent drop from 39.19% to 33.6% partly
   reflects that.
2. Ukrainian's share peaked around 39% in 2023 and has come **down** since,
   while English rose. Total Wikipedia traffic is also falling in the
   chatbot era (uk.wikipedia: 1,188M pageviews in 2023 → 831M in 2025). The
   honest sentence is "the gap closed, and then Wikipedia as a whole started
   shrinking" — not "Ukrainian is winning".

### Ukrainian Wikipedia, as a body of content

- **1,432,459 articles**, 14th largest edition, 3rd among Slavic editions;
  **4,813 active editors**.
- Russian Wikipedia: **2,115,441 articles**, 8th, **16,558 active editors**.
- **Source:** https://meta.wikimedia.org/wiki/List_of_Wikipedias, fetched
  2026-08-26. Article counts also cross-check against
  https://uk.wikipedia.org/wiki/Українська_Вікіпедія (1,432,459 on 2026-08-26).
- **Use:** this is the article's _quality_ evidence, not its quantity
  evidence. 3.4× the editors is why the Russian edition is deeper on most
  subjects, and editors are recruited from readers.

---

## 5. The web at large — W3Techs content languages

| Year (1 Jan unless noted) | Russian | Ukrainian |
| ------------------------- | ------- | --------- |
| 2015                      | 5.8%    | 0.1%      |
| 2018                      | 6.8%    | 0.2%      |
| 2021                      | 8.6%    | 0.4%      |
| 2022                      | 7.0%    | 0.6%      |
| 2024                      | 4.5%    | 0.6%      |
| 2026 (26 Aug)             | 3.4%    | 0.6%      |

- **Sources:** https://w3techs.com/technologies/history_overview/content_language/ms/y
  and https://w3techs.com/technologies/overview/content_language — both
  fetched 2026-08-26 (survey date on the overview: 2026-08-26).
- Full series also holds 2016 6.2/0.1, 2017 6.4/0.1, 2019 6.0/0.2,
  2020 7.6/0.3, 2023 5.3/0.6, 2025 3.9/0.6, 2026-01-01 3.7/0.7.

**The honest reading — this is the section most at risk of being oversold.**
Russian more than halved from its 2021 peak (8.6% → 3.4%). Ukrainian rose 6×
across the decade (0.1% → 0.6%) but has been **flat at 0.6–0.7% since 2022**.
Russian is still **5.7×** Ukrainian. The Russian decline is overwhelmingly
_not_ Ukrainian's gain — the share went elsewhere. Say that plainly.

**Methodology, stated in the article:** W3Techs surveys "well over 20 million"
sites it judges to have meaningful content, ranked using Google's Chrome User
Experience Report plus a customised Tranco list; it classifies whole sites,
not pages, and does not count subdomains separately. Source:
https://w3techs.com/technologies.

---

## 6. Music — the fastest-moving number

- Playlists containing Ukrainian-language songs: **34% (2022) → 57% (2025)**.
- Share of Ukrainian-language tracks among Ukrainian artists' output abroad:
  **27% (2022) → 53% (2025)**.
- **68,900 tracks** released by Ukrainian artists July 2024 – July 2025,
  **+39%** on the previous period; **439** new performers.
- **90% of those new artists have fewer than 1,000 plays.**
- 93% of respondents listen to Ukrainian-language music; roughly 8× more
  Ukrainian-language than Russian-language listening.
- **Source:** «Музика має силу», by the Pomitni label with the Dive and
  Discovery Research agencies, reported at
  https://suspilne.media/culture/1110886-ukrainska-muzika-nabirae-obertiv-castka-pisen-ukrainskou-v-plejlistah-zrosla-do-57/
  (2025-09-09), fetched 2026-08-26.

**Why the 90% figure is mandatory.** It is the article's own counter-example
to itself: supply grew 39% in a year and almost all of it went unheard.
Volume is not the same as an audience, and an article about numbers that
prints only the flattering ones has no standing to ask anyone to trust it.

**Limit:** a label-commissioned study reported by a broadcaster, not an
independent audit. Attribute it to the study by name.

---

## 7. Context figures (background, not load-bearing)

- **Language at home (KIIS/Rating, 2025):** 63% Ukrainian, up from 52% in
  2020; 13% Russian; 19% equally both. East 29% (from 19% in 2020), South
  ~39%. Second-hand via hromadske/detector.media search results — **not
  independently fetched**; if the article uses it, fetch the KIIS release
  first or drop it.
- **Books (UIK annual study, presented 2026-05-05):** 15,069 titles in 2025
  (+4%), print run 33M+ (−1.75%), revenue 8.91bn UAH (+8.5%, wiped out by
  9.2% inflation), 390 active publishers, print run at 79% of 2020.
  https://detector.media/infospace/article/250118/... and
  https://interfax.com.ua/news/general/1165087.html. The oft-quoted
  "89.75% of titles / 95.40% of print run in Ukrainian" could **not** be
  confirmed from either fetched article — **do not print it** without the
  primary UIK study.
- **YouTube:** ~13.4k Ukrainian-language channels, +9% year on year. Source
  quality is weak (aggregator posts). Excluded from the article.
- **App-store localisation uplift:** widely cited +26% conversion
  (Storemaven), with case studies from +15% to +200%. All vendor-side
  marketing material with no published methodology. **Excluded** — the
  article's standard is sources a reader can check, and these are not.

---

## Rules carried into the article

1. Every figure carries its date and its source in the prose. A number
   without a date is not evidence, it is a vibe.
2. Every section that has an unflattering counter-figure prints it in the
   same section, not in a footnote: the Steam plateau, the 47% who stayed on
   Russian, the flat 0.6% on the web, the 90% of tracks nobody heard, the
   falling share of paid releases carrying Ukrainian.
3. No causal claim beyond what a source states. Platforms publish these
   numbers and say they use them; that is documented. That any given
   localisation happened _because of_ a table is not, and the article does
   not say it.
4. No per-capita arithmetic on Ukraine's population (§1).
5. Nothing about what Movar does may exceed `docs/copy.md` — it sets the
   per-site locale signal, rewrites Google `hl`/`lr`, and redirects through
   pickers. It does not change OS or account settings, and the article's
   closing must not imply it does.
6. **No unexplained jargon.** The reader is not assumed to know what a byte,
   an `Accept-Language` header or a locale is, and none of the three appears:
   the header is described as "the list of languages the browser sends", and
   the rest are dropped. Every product, company and service is glossed at
   first mention — Steam, Valve, CD Projekt RED, UnlocTeam, W3Techs,
   GameSensor, Pomitni — as are «локалізація» and Wikipedia's per-language
   editions. `docs/copy.md` §1.9 (specific over abstract) still applies; this
   is about unexplained terms, not about naming things precisely.

## Charts

Seven scenes across two articles, all under `apps/marketing/src/article-assets/`,
all reading their figures from `src/lib/article-figures.ts`.

| Scene                      | File                        | Why this form                                                                                                                |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SteamUkrainianTrendChart` | `steam-ukrainian-trend.svg` | Line on a **real elapsed-time axis** — equal-spaced readings would draw a smooth climb and hide the stall                    |
| `CyberpunkLanguagesChart`  | `cyberpunk-languages.svg`   | **Grouped, not stacked**: the published "after" shares sum to 96% and stacking would mean inventing the remainder            |
| `WikipediaUkraineChart`    | `wikipedia-ukraine.svg`     | **Stacked** — here the parts genuinely make a whole, and the point is that Ukrainian grew _out of_ the Russian share         |
| `WebLanguagesTrendChart`   | `web-languages-trend.svg`   | Two lines on **one shared linear axis** — a second axis or a log scale would flatter the comparison by construction          |
| `UkrainianMusicChart`      | `ukrainian-music.svg`       | Paired before/after bars against a full 100%, with the study's own 90%-unheard counter-finding in the frame                  |
| `SteamLanguagesChart`      | `steam-languages.svg`       | «Тиха капітуляція»'s ranking. Same survey table as the trend scene above, now from one source rather than two transcriptions |
| `SignalLadder`             | `signal-ladder.svg`         | «Тиха капітуляція»'s detection-order diagram. No figures, so no `article-figures` entry                                      |

Every scene prints each series' name and value as text, so none depends on
colour alone.

### The pipeline, and why it is not screenshots

`pnpm --filter @movar/marketing gen:charts` renders each component with
`renderToStaticMarkup` and writes an SVG. There is no browser, no Storybook and
no rasterisation: the file is a pure function of the figures, so the same data
produces the same bytes on any machine. That is what makes
`pnpm check:charts` possible — it re-renders and compares, which no screenshot
pipeline could do, and it is wired into `pnpm validate`.

The SVG is **inlined into the page** by `apps/marketing/plugins/remark-inline-chart.mjs`
rather than referenced with `<img src>`. An SVG in an `<img>` is an isolated
document: it cannot reach the page's fonts or CSS variables. Inlined, the
scenes use the site's Manrope and take their colours from `--chart-*` tokens
that map onto the existing semantic palette — so the charts follow the reader
into dark mode instead of sitting as a bright block, which is what the previous
PNGs did.

Two costs of that choice, both real:

1. **Layout is arithmetic.** Nothing measures text, so every wrapped caption is
   a hand-broken array of lines and nothing re-flows. Two genuine bugs came out
   of the rewrite — a caption 43px past the right edge, and source lines drawn
   through the axis labels — which is why
   `apps/e2e/src/marketing/marketing.blog.spec.ts` measures every text box
   against its frame and against its neighbours in a real browser. That check
   is the only thing in the toolchain that knows how wide Cyrillic actually is.
2. **Type is Manrope only.** The site loads no mono face, and an inlined SVG can
   only use what the page has, so chart numerals moved from IBM Plex Mono to
   Manrope with `tabular-nums`.

`gen:charts` also touches any post embedding a scene it changed: the dev server
caches the Markdown transform and has no idea a post depends on an SVG file, so
without that a regenerated chart would keep showing its previous version.

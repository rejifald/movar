---
type: research
id: movu-rakhuyut-research
status: reference
date: '2026-08-26'
summary: >-
  Evidence base for the fourth blog post — «Мову рахують» — the article that
  argues the demand side on two axes: a language setting is a measurement, and
  the measurement is what funds (or does not fund) Ukrainian localisation
  (§§1-6); and the same setting selects the corpus that answers the reader
  today, in search and in translation (§7). Every figure the article prints is
  recorded here with its primary source, the date it was gathered, and the
  methodological limit that keeps it honest. Gathered 2026-08-26 by direct
  fetch of the sources listed, §7 added 2026-08-27; figures that could only be
  had second-hand are flagged inline.
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

## 2b. Mewgenics — the poll that lost to the counter

The cleanest demonstration in the post of the distinction it is actually
about, and the only case found where the _reverse_ direction is on the record
in the decision-maker's own words.

- **Poll**, 23 May 2024, on Edmund McMillen's own social account, asking which
  localisation to do next. Ukrainian won: **63.3% of 24,385 votes**, first of
  four options.
- Russian localisation was done instead.
- **McMillen's stated reason:** he published Steam **wishlist** counts by
  country — Russia **second, after the USA**; Ukraine **not in the top eight**.
- **Sources:** https://gamedev.dou.ua/forums/topic/59828/ and
  https://dev.ua/en/news/rozrobnyk-mewgenics-bie-shtanhu-1780393907 — fetched
  2026-08-27.

**Why it earns a section.** Every other example infers that a counted number
drives a decision. Here the developer said so and showed the number. It also
draws the line the whole post depends on: a vote is people _saying_ what they
want — free, loud, and recorded nowhere a publisher reads — while a wishlist is
an action the platform tallies and reports back. The larger number lost to the
counted one.

**How the prose is required to handle it.** Mechanically, and without
moralising. `docs/copy.md` §1.6 (mechanisms, not motives) and §3.4 (the agent
is a corpus, a header, a counter — never a country or a people) both apply:
wishlist counts by country are market data, allowed under §3.6, but the section
must not become a verdict on a studio. It closes by turning the point at the
reader instead, which is also the only actionable thing in it.

**Considered and rejected for this slot:** a widely-repeated account of a
Ukrainian software company declining to ship Ukrainian because its own usage
numbers did not justify the cost. It is the same argument and a sharper one,
but no public source for the decision could be found — only that the products
were localised later. Naming a real company for an undocumented decision is out
regardless of how well it fits, and an anonymised version would be an
unsourced anecdote in a post whose entire standard is the opposite. Mewgenics
makes the same point with a citation.

## 2c. MacPaw — the same arithmetic, at home

The section that removes the "foreign companies just don't care" reading, and
the one whose sourcing had to be got exactly right.

**Verified from the pages, not from anyone's account of a decision.** Both the
archived and the live page carry their locale switcher in markup, so the claim
is countable by anyone who opens them.

|          | `macpaw.com` locales                            | Ukrainian? | Russian? |
| -------- | ----------------------------------------------- | ---------- | -------- |
| Jan 2022 | de en es fr it ja ko nl no pl pt **ru** sv (13) | no         | yes      |
| Aug 2026 | de en es fr it ja ko nl no pl pt sv **uk** (13) | yes        | no       |

- **Snapshot:** https://web.archive.org/web/20220102201104/https://macpaw.com/cleanmymac,
  read 2026-08-27. Live page checked the same day.
- The 2022 site shipped Norwegian Nynorsk and Swedish, and not Ukrainian.

**The distinction that must not be blurred.** _CleanMyMac the app already spoke
Ukrainian in January 2022_ — the same page says so under the heading
«CleanMyMac X speaks:», listing thirteen languages including Ukrainian **and**
Russian. The thing that had no Ukrainian was the company's **marketing site**.
Writing that the product lacked Ukrainian would simply be false, and
`article-figures.test.ts` pins `appSpokeUkrainianInSnapshot` so the prose
cannot drift into that easier, wrong version.

This is the same trap as the Steam storefront: a page's own interface language
is not the product's localisation, and this article of all articles cannot
confuse the two.

**Motive is not attributed, anywhere.** Sites are localised toward where buyers
come from, and that sum reads the same in Kyiv as in Warsaw — which is the
reason to include it at all. The prose says so explicitly and closes on the
mechanism, not on the company. MacPaw has since reversed both halves; the
before/after _is_ the point, not an indictment.

**Supersedes** the widely-repeated account of a Ukrainian company declining
Ukrainian because its usage numbers did not justify it (see §2b). That version
is about internal reasoning and has no public source; this one is about what
two pages shipped, and can be checked in a browser.

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

## 7. Search and translation — what the language selects

The other six sections measure what a language setting _adds to_ somebody
else's table. This one measures what it _subtracts from_ what the reader is
shown, which is a cost paid today rather than a localisation funded later. It
is the only section whose evidence is reports and incidents rather than a
series, and therefore the only one with no chart — see the note at the foot.

### The query language picks the corpus

- **90.8%** — a query written in Ukrainian is answered in Ukrainian by Google
  AI Overview.
- **19.69%** of AI Overview answers in results aimed at Ukraine are built
  **exclusively on `.ru` domains**, with no Ukrainian source at all.
- **31.57%** mix Ukrainian and Russian sources in one block.
- Sample: ~2.5M Ukrainian-language and ~2.5M Russian-language queries from
  Google Ukraine's keyword base.
- **Source:** Kateryna Hordiienko of Serpstat (a Kyiv search-analytics
  company), published 2026-08-12 at
  https://focus.ua/uk/opinions/764285-komu-naspravdi-doviryaye-shtuchniy-intelekt-google-v-ukrajini
  — fetched 2026-08-27.

**Limit — and it is the largest in the article.** No dataset is published, no
collection window is stated, and the 19.69%/31.57% split is given for
Ukraine-targeted results as a whole, _not_ broken out by the language of the
query. These are the only figures in the post a reader cannot re-derive. They
ship anyway, because no other measurement of this mechanism was found — and
the paragraph that prints them says exactly that, in the same paragraph. This
is the one place the lead's «open it and recount it» promise is suspended, so
it is suspended out loud. `article-figures.test.ts` pins the admission to the
figure.

**Why it is not the excluded vendor-marketing genre (§8).** The «+26% conversion» claims are assertions about what buying a
vendor's service does. This is a count over a crawl the vendor already runs,
published as a finding rather than as a sales argument. That is a weaker
source than a platform's own table and a stronger one than a case study; the
prose grades it accordingly instead of hiding the difference.

### Part of that corpus was placed there

- **193 information portals** in a single coordinated network relaying
  identical pro-Russian material dressed as local news.
- **Source:** VIGINUM, the French government service for foreign digital
  interference, report _PORTAL KOMBAT_, 2024-02-12,
  https://www.sgdsn.gouv.fr/files/files/20240212_NP_SGDSN_VIGINUM_PORTAL-KOMBAT-NETWORK_ENG_VF.pdf
  — fetched 2026-08-27. A later VIGINUM report puts the network at 224
  portals; the article quotes the first count with its own date rather than
  chasing the maximum.
- **3,600,000 articles** published by the network across 2024; **10** leading
  chatbots repeated its claims in **33%** of answers.
- **Source:** NewsGuard, 2025-03-06,
  https://www.newsguardtech.com/special-reports/moscow-based-global-news-network-infected-western-artificial-intelligence-russian-propaganda/
  — fetched 2026-08-27. The landing page carries the 3.6M and the 33%; the
  narrative count and the per-model breakdown are behind a form and are not
  used.

Both are held to the mechanism and off the motive (`docs/copy.md` §1.6, §3.4):
the article says a network of sites exists and names who counted it. It does
not say a country did something.

### A translated track is a version, not a copy

- **Hellboy, Russian release, April 2019.** The original line has Baba Yaga
  trying to raise Stalin's ghost from a necropolis; the Russian track names
  Hitler. In original-language screenings the name was bleeped from the audio
  and the subtitle carried the substitute.
  **Source:** BBC,
  https://www.bbc.com/news/blogs-news-from-elsewhere-47964774. Neither
  bbc.com nor rferl.org could be fetched from this environment (403 / blocked),
  so the specifics were confirmed through https://www.cbr.com/hellboy-russian-stalin-swap-hitler/
  (2019-04-18), which cites the BBC report, plus the RFE/RL headline and the
  search summary of the BBC page — fetched 2026-08-27. **If this is refreshed,
  open the BBC page directly.**
- **«Брат-2» on Netflix, corrected 2021-06-02.** «Бандерівець?» was subtitled
  in English as _Ukrainian Nazi collaborator_; after the reaction it became
  _banderite_.
  **Source:** Detector Media,
  https://detector.media/infospace/article/188699/2021-06-02-netflix-vypravyv-subtytry-u-filmi-brat-2-pro-banderivtsiv-kolaborantiv-natsystiv/
  — fetched 2026-08-27. **Nobody is named in the article as having raised it**:
  reporting differs on the MP's given name and party, and the entry stands on
  the two subtitle strings, which do not.

**Considered and dropped.** A compilation of further dub alterations —
Money Heist, The Morning Show, Desperate Housewives, Hotel Transylvania,
including the pattern of giving a character a Ukrainian accent the original
did not have — at
https://behindthenews.ua/pravda/pereklad-na-movu-propagandi-yak-rosiyskiy-dublyaj-spotvoryue-syujeti-zahidnih-filmiv-893/.
Several of those examples are amateur dubs rather than releases, none could be
confirmed against a second source, and the Money Heist line failed to verify
at all. Two confirmed incidents beat five unverified ones in a post built on
checking.

### The counter-figures — all three in the same section

1. **Two incidents are not a frequency.** Nobody publishes a rate of altered
   lines, and the section says so rather than reaching for «часто».
2. **The Ukrainian track is not a neutral copy either.** Ukrainian dubbing is
   praised precisely for jokes the original did not contain — same mechanism,
   opposite sign.
3. **Switching costs the reader coverage today.** The Ukrainian-language
   corpus is the smaller one by the article's own W3Techs ratio, so some
   questions have no Ukrainian-language answer. This is the section's real
   price, it is quoted with the same computed ratio the web section charts,
   and a test pins the two together.

### Why this section has no chart

Every other data section renders one scene, and this one deliberately does
not. Charting the AI Overview split would hand the post's most prominent
visual treatment to its least checkable figure — the exact inversion of the
reason Cyberpunk's unflattering number was given the lead. The evidence here
is two published reports and two documented incidents; a bar chart would imply
a series that does not exist.

---

## 8. Context figures (background, not load-bearing)

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
   4b. **The one suspended promise is suspended out loud.** §7's AI Overview
   figures are the only ones a reader cannot re-derive. They are printed with
   that fact in the same paragraph, never in a footnote — the article may
   carry a weaker source, but not quietly.
5. Nothing about what Movar does may exceed `docs/copy.md` — it sets the
   per-site locale signal, rewrites Google `hl`/`lr`, and redirects through
   pickers. It does not change OS or account settings, and the article's
   closing must not imply it does.
6. **No unexplained jargon.** The reader is not assumed to know what a byte,
   an `Accept-Language` header or a locale is, and none of the three appears:
   the header is described as "the list of languages the browser sends", and
   the rest are dropped. Every product, company and service is glossed at
   first mention — Steam, Valve, CD Projekt RED, UnlocTeam, W3Techs,
   GameSensor, Pomitni, Serpstat, VIGINUM, NewsGuard — as are «локалізація»,
   Google's AI Overview block and Wikipedia's per-language editions. `docs/copy.md` §1.9 (specific over abstract) still applies; this
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

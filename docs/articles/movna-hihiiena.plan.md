---
type: plan
id: movna-hihiiena
status: approved
date: '2026-08-13'
summary: >-
  Approved plan for the second article — «Як зробити українську мовою за
  замовчуванням» — an instructional, uk-only guide on movar.fyi that teaches
  non-technical users to declare Ukrainian correctly everywhere (OS,
  keyboards, browsers, Google, per-site choices, popular apps), with an
  interactive browser-language checker, an interactive closing checklist, a
  direct Movar install CTA, and a subscribe block. Includes republishing
  «Тиха капітуляція» on movar.fyi (self-canonical) inside a new uk-only
  blog section (/uk/blog) with RSS. Companion settings research:
  movna-hihiiena.research.md.
---

# «Як зробити українську мовою за замовчуванням» — approved article plan

Title: **«Як зробити українську мовою за замовчуванням»**.

A how-to, because the piece is a manual and its readers arrive mid-problem.
"За замовчуванням" is the load-bearing word: it is the same concept in the
OS, the browser, an account and an app, so it scopes correctly over
everything the guide covers — and it is the villain «Тиха капітуляція»
named, so the two articles read as diagnosis and remedy.

Rejected: «Як налаштувати інтернет на українську» (the site's tagline as a
how-to) — it under-scopes. The guide sets the Windows display language,
deletes keyboard layouts and configures the Steam client; none of that is
the internet, and the mis-scope would lose readers before the keyboard
section, which is the one that silently undoes the rest. The
term «мовна гігієна» stays — but as the concept the article introduces and
defines in its own section, not as the headline. In Ukrainian the phrase is
already occupied by the self-speech sense (surzhyk, calques), so the article
defines the maintenance sense it means and states what it is _not_: not about
how you speak, not a judgement of languages or texts, and not «прибрати
російську».

## Positioning

**Instructions, not prose.** Step-by-step guidance for non-technical people:
short intro, numbered steps with screenshots, trap callouts, a checklist at
the end. The «why» narrative lives in «Тиха капітуляція», which is
republished on movar.fyi and linked from the intro. The guide covers the
user's side of the contract — declaring the language correctly everywhere —
and Movar is presented directly as the tool that enforces that choice where
sites ignore it.

**No DOU references anywhere.** All links to the previous article point to
the movar.fyi copy.

## Decisions locked (2026-08-13)

- **uk-only.** The blog section ships Ukrainian-only; it emits no `hreflang`
  alternates and opts out of the site's locale auto-redirect, rather than
  offering an English stub.
- **Republish «Тиха капітуляція» self-canonical** on movar.fyi (light
  adaptation of `dou-tykha-kapitulyatsiya.md`; the site copy becomes the copy
  we link from now on; accepted SEO duplicate with the DOU original).
- **Checker widget v1 = `navigator.languages` only.** A page can't read OS or
  Google settings; honest scope is browser-declaration diagnosis + tailored
  next steps.
- **Direct Movar CTA** — explicit install call («Встановіть Мовар — він
  мовчки перемикає сайти й пошук на українську за вас»), not a subtle weave.
- **Subscribe block** reuses existing channels from `@movar/brand` /
  `apps/marketing/src/lib/social-links.ts`: Discord (primary ask), Instagram,
  Facebook — plus RSS from the new blog section. No email newsletter (no
  backend by design).

## Site infrastructure

A small uk-only blog on the marketing site at **`/uk/blog/`** (named `blog`,
not `articles`), two entries to start: the republished «Тиха капітуляція» and
this guide. RSS at `/uk/blog/rss.xml` — hand-rolled static endpoint, zero
backend and zero new dependencies, consistent with the privacy stance.

**Shipped** (PR #404 follow-up): the section, the content collection, the feed,
and the republished «Тиха капітуляція». What that groundwork established, and
which this guide inherits:

- Posts are Markdown in the `blog` content collection
  (`apps/marketing/src/content/blog/*.md`); chrome copy and routes live in
  `apps/marketing/src/lib/blog.ts`, deliberately outside the bilingual
  `i18n.ts` parity contract.
- Single-locale pages pass `localeAlternates={false}` to `BaseLayout`, which
  switches off the inline locale-redirect script and the `hreflang`
  alternates. Without it an English-preferring visitor opening a shared link
  is bounced to a `/blog/…` URL that 404s. Guarded by
  `apps/e2e/src/marketing/marketing.blog.spec.ts`.
- Body styling is the `.article-prose` element sheet in `styles/global.css`.
  A guide with screenshots and callouts will need to extend it (figure/callout
  shapes), not fork it.
- Post illustrations live in `src/content/blog/assets/`, which is also where
  `capture-article-assets.mts` writes Storybook-rendered scenes — one home, no
  drift.
- Every post ends with `components/BlogCta.astro` (install CTA + follow
  channels), so the guide's "direct CTA" and "subscribe" sections are already
  built; the guide adds only its own in-body pointer after the three rules.

## The spine: three rules

Stated up front, before any menus; everything else hangs off them.

1. **Прибрати російську ≠ обрати українську.** Removing ru resolves to
   English, not Ukrainian — services weigh query language, display language,
   device language and location together, so Ukrainian must be affirmatively
   **first** at every layer (matches the fallback-chain caveat in
   `docs/interface-language-control-feasibility.md`).
2. **Видалити, а не понизити.** A demoted ru still wins on any site that
   supports ru but not uk/en — presence at any priority lets a site prefer
   it. Safari amplifies this: it sends only the #1 language.
3. **Мова інтерфейсу ≠ мова контенту.** Every major service has two
   independent controls (Google: display vs Results Language Filter; X:
   display vs "Languages you may know"; TikTok: app vs video languages;
   Steam: client vs store preferences). YouTube has no content-language
   control at all — say so honestly.

## Article skeleton

1. **Вступ** — short; link to the site-hosted «Тиха капітуляція» for the
   why. Immediately followed by the **checker widget**: reads
   `navigator.languages` client-side, renders a verdict («Ваш браузер просить
   сторінки російською — ось що виправити») so readers see their own
   diagnosis before scrolling.
2. **Три правила** — the spine above.
3. **Система та клавіатури** — Windows / macOS / iOS / Android: display
   language, preferred-list order, deleting ru layouts, Siri (no Ukrainian —
   set English; dictation DOES support Ukrainian), Gboard independence.
   Features the **silent keyboard trap** matrix (below).
4. **Браузер** — per-browser instructions, two explicit axes each: _мова
   браузера_ (its own UI) vs _мова сторінок_ (what sites are asked to
   serve), and where each axis lives:
   - Chrome: both in-browser (UI switch Windows-only; macOS follows the OS).
   - Firefox: both in-browser — two controls centimeters apart.
   - Edge: both in-browser.
   - Safari (desktop + iOS): **neither** — both axes are OS Language &
     Region, and Safari sends only the #1 language.
   - Mobile variants where they differ (Android Chrome has its own UI-language
     switch; iOS Chrome has no language list at all).
5. **Google** — account language + вимкнути «Added for you»; Search display
   language vs **Results Language Filter** (union trap: uk-only, not uk+en);
   регіон = Україна; Gmail; YouTube (мова + локація, і чого вони не
   контролюють); Maps; News edition (signed-in only). Signed-out truth: the
   NID cookie (~6 months, dies on cookie clears) — explains «чому все
   скинулося».
6. **Сайти памʼятають свій власний вибір** — a language once picked on a
   site lives in _its_ cookie, independent of everything above: re-pick it on
   the site (or clear its cookies). Some services keep **interface language
   and email language as separate settings** (notification/newsletter
   language survives a UI switch). Movar's picker-redirect callout lands
   here.
7. **Сервіси з власними налаштуваннями** — Steam (client + store
   preferences; the localization-statistics tie-in), Facebook (per-device!),
   Instagram, Telegram (official uk pack), X (display vs "Languages you may
   know"), TikTok, Netflix (per-profile), Spotify, Wikipedia.
8. **Поведінковий шар** — recommenders re-infer Russian from engagement;
   settings clear the declared signal, behavior clears the inferred one.
9. **Мовар — прямий CTA.** Twice: a short pointer right after the three
   rules («не хочете робити 40 кроків руками — більшість із них Мовар робить
   на льоту») and the full install block near the end with the standard
   download buttons.
10. **Підпишіться** — Discord (primary, existing CTA pattern), Instagram,
    Facebook, RSS.
11. **Чеклист** (bottom) — interactive: checkboxes persisted in
    `localStorage`, grouped by platform, one plain-words line per setting.
    The checker-widget result sits at the top as the one self-verifying
    item. DevTools/header-echo verification moves to a collapsible «для
    технічних» footnote.

## The silent keyboard trap (per-platform matrix)

Named as a recurring villain: Russian silently reappears. State the
mechanism precisely per platform — it differs:

- **Apple (iOS та macOS)** — doc-verified: adding a keyboard/input source
  **automatically adds its language** to the preferred-languages list that
  apps and websites read; deleting the keyboard does NOT remove the
  language. The #1 silent-reappearance vector.
- **Windows** — keyboards nest inside language entries: getting a Russian
  layout normally means putting Russian into Preferred languages itself; and
  changing the display language can silently re-add a matching layout.
  Exact semantics to re-verify on-device (see research doc).
- **Google** — the inverse trap: Gboard languages are **independent** of
  Android system languages (cleaning one doesn't clean the other — check
  both), and the account-level analog is **«Added for you»**: Google re-adds
  Russian to the account languages if it observes you reading it, unless
  auto-detection is disabled.

## Assets

- **Screenshots:** real UI captures in uk locale, annotated in the
  install-guide style, light + dark variants per the `public/screenshots`
  convention. Needs a capture checklist per platform (macOS/iOS/Windows/
  Android settings screens, Google settings pages).
- **Widgets:** checker + checklist are small client-side islands — all
  on-device, consistent with «нічого не покидає браузер».

## Production notes

- The full verified settings inventory (menu paths, gotchas, sources) lives
  in `movna-hihiiena.research.md`; its closing section lists every item that
  **must be re-verified on-device before publishing** (TikTok paths, iOS
  per-app language, Gboard removal, Edge reorder wording, Windows
  keyboard→language coupling, Google Assistant uk support, Office proofing
  path, OEM Android paths).
- Claims about what Movar automates must stay literally true
  (`docs/copy.md`, product-claim surfaces): it sets the per-site locale
  signal, rewrites Google `hl`/`lr`, and redirects via pickers — it does not
  change account-level or OS settings; the guide is complementary.

## Implementation order

1. ~~Land this plan + the research doc.~~ **Done** — PR #404.
2. ~~Scaffold the uk-only blog section on the marketing site + RSS.~~ **Done.**
3. ~~Republish «Тиха капітуляція» (adapted, self-canonical).~~ **Done** —
   `apps/marketing/src/content/blog/tykha-kapitulyatsiya.md`, prose carried
   over verbatim apart from frontmatter, internal links, and the dropped
   third-party disclaimer.
4. Write the guide from the research doc; re-verify flagged items on-device
   as each section is drafted.
5. Build the checker widget and the interactive checklist.
6. Capture + annotate screenshots (uk locale, light/dark).
7. ~~Subscribe block + direct CTA wiring.~~ **Done** — `BlogCta.astro` renders
   under every post. Still to do for the guide: cross-link from its intro to
   the republished article.

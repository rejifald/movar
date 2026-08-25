---
type: plan
id: for-ukrainian
status: proposed
date: '2026-08-14'
summary: >-
  Proposed plan for a bilingual public directory on movar.fyi of initiatives
  that promote the Ukrainian language — game and software localisers,
  courses and speaking clubs, dictionaries and language tools, publishing,
  fonts, open language data — carrying its own submission invitation.
  The directory is unconditional: no reciprocal-link requirement and no
  Movar Audit conformance gate (both were considered and rejected, see
  "Rejected"). Listing is a gift, and the reciprocity we want is earned with
  an optional badge rather than demanded as a condition. Entries live in a
  typed Astro content collection with uk+en descriptions and a `lastVerified`
  stamp; a CI link check turns rot into a build failure. Submissions arrive
  through a GitHub issue template (encouraged) or the support inbox, and
  land as PRs against a narrow CODEOWNERS path guarded by a
  changed-paths check. Disclaimers state plainly that listed projects are
  independent of Movar, and a written delisting policy — not the disclaimer —
  carries the actual risk. Individuals may be listed, but only with recorded
  consent. Entries are grouped by the reader's sphere — games, education,
  writing, books, media, typography, technology — and nothing is graded,
  ranked or tiered, in the interface or in the data.
  A Movar Audit adopters list is planned but stays out of
  scope here — `@movar/audit` shipped mid-plan, so it is unblocked rather than
  waiting, and shipping it alongside would make the unconditional listing read
  as the gate that was rejected. The directory ships standalone: no
  article gates the launch, and a dedicated blog post follows later, written
  against what the directory has actually become.
---

# «Для української» — directory plan

Name (uk): **«Для української»**. Route: `/for-ukrainian` + `/uk/for-ukrainian`.

## Positioning

Movar is the **demand side**: it enforces the language a user already chose.
The projects in this directory are the **supply side**: they make Ukrainian
exist to be chosen at all — localising games, translating interfaces, teaching
the language, building dictionaries, publishing books, drawing typefaces.

That pairing is the whole argument for hosting this on movar.fyi rather than
anywhere else, and it is the only claim the launch article needs to make. The
directory is not a Movar feature and does not mention what Movar can do for a
listed project. It is a gift.

**Goal (locked 2026-08-14):** promote Ukrainian content by promoting the
initiatives that produce it. Not SEO, not lead generation. Every design
decision below resolves in favour of that goal when it conflicts with reach.

## Decisions locked (2026-08-14)

- **Unconditional listing.** No reciprocal link required, no audit gate. See
  "Rejected" for what this cost and why it was worth it.
- **Bilingual (uk + en)**, unlike the blog. Ukrainian readers are the primary
  audience; the English half serves the diaspora and foreign studios looking
  for Ukrainian localisation partners — a real audience for the localiser
  categories specifically.
- **Optional badge**, offered to every listed project, never required.
- **Both submission channels**, with the GitHub issue template encouraged and
  the support inbox as the no-account fallback.
- **Scope is not limited to the digital space** — books, magazines, publishing
  and offline courses are in scope where the project's purpose is to promote
  the Ukrainian language.
- **Content-supply projects are in** — those whose subject is not the language
  itself but which exist because that subject had no Ukrainian publication.
- **Named «Для української» / `/for-ukrainian`** (2026-08-14). It names the
  _relationship_ — these work for the language — which is the only framing
  that fits a typeface, a dictionary, a course, a game translation and a
  magazine equally. It also avoids the trap in «українські проєкти», which
  reads as projects _from Ukraine_ — nationality, not language, and an axis
  `awesome-made-by-ukrainians` already occupies. A Ukrainian studio localising
  into English does not belong here; a foreign designer drawing a Cyrillic
  face for Ukrainian does.
- **Entries are things, not makers.** Fixel, not MacPaw; r2u, not its
  compilers. A reader wants the typeface, and keeping entries thing-shaped
  keeps the consent rule a narrow exception rather than the default for every
  row. The name was chosen partly to protect this: a «хто…» title would have
  pulled entries towards people.
- **Grouped by sphere, and nothing is graded.** Categories are the reader's
  domain — games, education, typography, media — not our judgement of how
  language-adjacent a project is. No tier, rank or score is displayed **or
  recorded**: a hidden grade is still a grade, and hidden grades leak into PR
  comments and screenshots.
- **Individuals may be listed, with recorded consent.** Reverses the initial
  projects-only bar, which was costing the directory the best-regarded
  unofficial localisers. Consent is obtained before listing, never after.
- **Disclaimers on the index, on every entry, and in the badge terms.**
- **The directory ships without an article.** No blog post gates the launch;
  a dedicated article follows on its own schedule (see "Launch"). The
  submission invitation lives on the directory page from day one and does not
  wait for the article.
- **Research first, then outreach.** The directory launches with a seeded,
  verified list; invitations go out afterwards, pointing at a page that already
  exists and already lists the recipient.

## Rejected, and why (kept for the record)

Two requirements were proposed on 2026-08-14 and dropped the same day. Both are
recorded here because they will be proposed again by someone who has not seen
this section.

### Required reciprocal link (backlink-for-listing)

Rejected on four grounds:

1. **It is a link scheme by definition.** "Link to me and I'll link to you" is
   the textbook example in Google's spam policies. The available defence —
   `rel="nofollow"` on outbound links — removes the SEO value to the listed
   project, which was the entire incentive. The requirement is either spammy or
   pointless.
2. **It selects for the wrong projects.** The volunteer localisation team that
   coordinates on Telegram, the speaking club run from Instagram, the
   dictionary on a static host edited twice a year — none of them can comply.
   Organisations with a marketing department can. The directory would silently
   become a list of who has a CMS.
3. **It inverts the gift.** An unconditional list is generous, and generosity
   is what gets shared. A conditional list is a trade proposed by the smaller
   party before it has given anything.
4. **It creates a policing job.** Footers change and sites get redesigned.
   Enforcement means re-crawling every listed site and quietly delisting allies
   who dropped the link — permanent work for a single maintainer.

### Required Movar Audit conformance

Rejected on four grounds:

1. ~~**It blocks on unbuilt software.**~~ **No longer true (2026-08-14).**
   `@movar/audit` shipped on main the same day this was written: the pure
   kernel, all 41 rules and a Node collector (#406), and `marketing:audit` now
   adjudicates the built site on every PR (#424). This
   ground is void. **The rejection stands on the three below**, which were
   always the substantive ones — the timing argument was the weakest of the
   four and it is worth being explicit that losing it changes nothing.
2. **It is vacuous where it should bite.** The core rules test a _differential_
   property — the same URL under varying `Accept-Language`. A monolingual
   Ukrainian site, which is most of this directory, has no second language to
   mishandle and passes trivially or scores `not-collected`.
3. **A silent gate is worse than public shaming.** An absent entry cannot be
   contested or even explained: the reader cannot distinguish "failed the
   audit" from "never applied". The ADR spends real architectural effort making
   reports falsifiable by the site owner they accuse; an unappealable access
   gate spends that credibility instead of building on it.
4. **Movar would write the rules, run the tool and control the list.** That is
   the shape of a certification racket regardless of intent.

**What survives instead:** the adopters list (below) — the same instinct
pointed the right way. Rigour lives in an opt-in list of sites that _pass_;
generosity lives in the directory.

## Scope

**In:** any project, organisation, community or product whose purpose includes
promoting the Ukrainian language or increasing the supply of Ukrainian-language
content and capability. Digital and offline both.

**Out, with the reason stated in the criteria page so it is not arbitrary:**

- **Unlicensed distribution.** Trackers and re-upload communities are excluded
  even when their Ukrainian-dubbing work is real and popular — the directory
  cannot recommend unlicensed distribution. (Encountered during research; this
  is a live case, not a hypothetical.)
- **State bodies and political organisations.** They do not need promotion from
  us and listing them entangles the directory in politics. Government language
  resources may be _linked_ from the criteria page as a resource without being
  listed as entries.
- **Rhetoric that attacks speakers.** "Promoting Ukrainian" includes voices
  whose framing is hostile toward Russian-speaking Ukrainians. The directory
  promotes work that _adds_ Ukrainian, not commentary that shames people out of
  it. Encountered concretely in research; needs to be written down before the
  first argument, not during it.
- **Merely publishing in Ukrainian.** A shop, bank or studio that happens to
  operate in Ukrainian is not thereby promoting the language. The test is
  purpose, not language of operation.
- **Dormant projects.** See "What counts as alive".

### Content-supply projects (decided 2026-08-14: in, and unlabelled)

Research surfaced a class the exclusions above did not cleanly resolve:

- **The language itself.** Teaching it, localising into it, building its
  dictionaries and corpora, drawing typefaces for it. Unambiguously in.
- **Content supply.** Projects whose subject is something else entirely —
  science, history, children's books — but which exist _because_ that subject
  had no Ukrainian-language publication and defaulted to Russian. Куншт was
  founded by students who had no Ukrainian popular-science magazine to read.

The second kind is not "merely publishing in Ukrainian": the Ukrainian-language gap is
the founding reason, not a side effect. But admitting it widens the directory
considerably and makes the boundary harder to police, since every outlet can
tell that story about itself.

**Decided:** both are in, with one guard — the Ukrainian-language gap must be
evidenced in **the project's own account of itself**, not inferred by us. Куншт
saying it was founded because no Ukrainian popular-science magazine existed
qualifies; our deciding on a project's behalf that it fills a gap does not.

**The distinction is a review-time criterion, not a label.** No `tier` field is
recorded, and the two kinds are never separated on the page — Куншт sits in
«Медіа» beside Читомо with nothing marking it as a different sort of entry. We
are not in a position to grade the people we are trying to promote, and a
grade kept in metadata is a grade that eventually surfaces. The cost is
accepted knowingly: narrowing the scope later means re-reading the entries
rather than filtering a column.

### Individuals (decided 2026-08-14: in, with consent)

The initial rule was projects and organisations only. It was reversed because
it excluded the best-regarded people in the field — КУЛІ captions one
unofficial localiser as a legend of the field, and a directory that omits
such people is worse at its job.

The consent rule that replaces the bar:

- **Consent before listing, never after.** An individual entry is not
  published until they have agreed, in a message we can point to.
- **Consent is recorded**, with the date and channel, in the entry itself
  (`consent` in the schema). Without the record we cannot show the basis for
  holding the data.
- **Withdrawal is immediate and needs no reason**, ahead of every other rule
  in the delisting policy.
- **A team alias is not an individual.** Where someone works under a
  collective name, list the collective — no consent step needed.
- **No contact details, ever.** The entry carries a name and a link the person
  already publishes; it never adds an email, phone number or location.

## Categories — spheres, not judgements

Grouped by **what the reader came for**, not by what a project does to the
language. Someone arrives wanting Ukrainian games, or a way to improve their
writing, or a typeface — they do not arrive wanting "localisation initiatives".
The taxonomy answers the reader's question, and as a side effect it removes any
place where the directory could be read as ranking its own entries.

1. **Ігри** — games: localisation teams, studios, catalogues
2. **Освіта** — learning and improving: courses, speaking clubs, transition
   programmes
3. **Письмо** — writing in Ukrainian: dictionaries, correctors, word-choice
   tools, publishing platforms
4. **Книжки та знання** — reading and reference: book media, libraries,
   encyclopaedic and free-knowledge projects
5. **Медіа** — Ukrainian-language magazines and media
6. **Типографіка** — typefaces and typography
7. **Технології** — software localisation, open language data, NLP resources

Two notes on what this grouping changed:

- **It dissolved the software-localisation problem.** As a category of its own
  it had no listable entries (see "Categories that resisted"); as part of
  **Технології**, which already has three, an upstream team page can be added
  whenever a good one is found without a thin category waiting for it.
- **Відео / YouTube is not in the list**, because nothing verified would go in
  it. It is a real sphere and probably the largest gap in the directory — but
  most Ukrainian-language video is made by individuals, so filling it runs
  mostly through the consent track rather than through research. Better absent
  than present-and-empty.

Categories are a fixed enum in the schema. Adding one is a deliberate edit, not
something a submission can do — otherwise the taxonomy dissolves within a month,
and a one-entry category makes the whole page look unfinished.

## Layout — a board, not a column (decided 2026-08-25)

The first build was a single 768px column of stacked rows: twenty entries under
seven headings, 5,369px tall, with no index, no counts and no way to jump. Three
things were wrong with it, and only the first is cosmetic.

- **There was no way in.** A reader who came for a typeface had to scroll past
  games, courses and dictionaries to find out whether one was even listed.
- **The submission invitation was below all of it.** "The invitation lives on the
  directory page from day one" (above) was true of the markup and false in
  practice — nobody scrolls 5,000px to volunteer something.
- **Nothing conveyed scale.** That there are twenty of these, across seven
  spheres, is the point the page is making, and the page never said it.

**Decided:** a filterable board — sphere-grouped cards, three up, with a search
box and a row of sphere chips carrying counts. Grouping and alphabetical order
inside each group are unchanged; the filter only ever hides rows.

Two things about this are load-bearing rather than decorative, and a later
change should not quietly undo them:

- **Every card is the same size and carries the same fields.** That is what
  keeps the board unranked once entries stop being uniform rows. There is no
  cell for a favourite to grow into, and the moment a card grows a logo, a
  metric or a highlight state, the directory has started grading. Do not add
  one. (This is the interface half of "nothing is graded" above, which until
  now only constrained the data.)
- **The filter is an enhancement, never the page.** The server renders all
  twenty entries grouped; the script only sets `hidden`. So the search box and
  chips stay invisible until the script reveals them — a reader without
  JavaScript gets the complete directory rather than dead controls, and a
  failure in the script leaves a working page rather than an empty one.

The verification date moved with it: it was rendering twenty times, which made
maintenance metadata the loudest repeated element on a page about other people's
work. It is now stated once, above the first entry, and the wording is decided
by the data — "every entry" while they share one date, "last checked" once they
diverge — because the alternative is a page that eventually states something
false about itself.

The hero band runs the site's own `.hero-backdrop` rather than a flat wash, so
the directory reads as part of movar.fyi. Nothing new was drawn for it.

## Entry schema

A new `projects` content collection alongside `blog` in
[`content.config.ts`](../../apps/marketing/src/content.config.ts). One entry per
file, so a submission is a single added file and the diff is trivially
reviewable.

```ts
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z.object({
    name: z.string(),
    category: z.enum([...]),          // the seven above
    url: z.string().url(),
    /** Both required: the page is bilingual, so a missing half is a build
     *  failure rather than an English card in a Ukrainian grid. */
    summary: z.object({ uk: z.string().max(200), en: z.string().max(200) }),
    /** Where the project is actually active, when that is not `url`
     *  (Telegram, Discord, YouTube). Drives the "what counts as alive" rule. */
    activeAt: z.string().url().optional(),
    /** Date a human last confirmed the project is alive and the link resolves. */
    lastVerified: z.coerce.date(),
    /** Set when the project displays the badge. Never a listing condition. */
    badge: z.boolean().default(false),
    /** Free-form, e.g. 'volunteer', 'non-profit', 'commercial'. Shown plainly:
     *  a reader deserves to know when a listed course costs money. */
    funding: z.enum(['volunteer', 'non-profit', 'commercial', 'mixed']),
    /** Required for entries naming an individual, forbidden otherwise — the
     *  refinement below makes the schema itself the enforcement point, so an
     *  individual cannot be listed by forgetting a field. */
    person: z.boolean().default(false),
    consent: z
      .object({ date: z.coerce.date(), channel: z.string() })
      .optional(),
  })
    .refine((e) => Boolean(e.person) === Boolean(e.consent), {
      message:
        'an entry naming an individual requires recorded consent, and only such an entry may carry one',
    }),
});
```

`summary` carries both locales rather than deferring to `i18n.ts` because entry
text is data, not chrome. Chrome copy — headings, the criteria page, the
disclaimer, the submission call — goes in
[`i18n.ts`](../../apps/marketing/src/i18n.ts) under the existing parity
contract.

## Bilingual consequences

Unlike the blog, this page ships in both locales, so it inherits the site's
normal bilingual machinery rather than the blog's single-locale opt-outs:

- `BaseLayout` keeps `localeAlternates` at its default — do **not** pass
  `false`; that flag exists for the uk-only blog.
- `functions/_middleware.ts` needs `/for-ukrainian` in its `MIRRORED_PAGES`
  allowlist, or an English visitor's canonical path never redirects. No longer
  possible to forget: `pnpm check:locale-redirects` enumerates `src/pages/`
  and fails when a page with a `/uk/` twin is missing from the set.
- Chrome copy is subject to the `i18n.ts` parity contract, so both halves land
  in the same PR by construction.
- The `blog` collection's uk-only reasoning in `content.config.ts` should gain a
  sentence noting that `projects` deliberately differs, so the next reader does
  not "fix" the inconsistency.

## What counts as alive, and the staleness guard

The research turned up both failure modes in a single afternoon, which is the
argument for automating this:

- A search summary asserted that a major localisation collective had **ceased
  to exist**. Its site shows a 14th-anniversary post and 2025 releases. Second-
  hand claims about a project's death are not evidence.
- The **same false death claim recurred** on a second, independently phrased
  search. A confident secondary source repeating itself is not corroboration —
  it appears to be bleed-through from a different collective that genuinely
  did disband some years earlier.
- A well-known language project's **website** has published nothing since
  mid-2022 while its Telegram channel stayed active. The site is stale; the
  project is not — though that Telegram has now also been quiet for ~6 months,
  which is why the entry is held back rather than listed.
- **Чтиво shut down.** A free Ukrainian-language library that ran for over
  twenty years announced it will no longer be maintained. It is exactly the
  entry anyone who knows the Ukrainian web would have added from memory, and it
  would have shipped dead on day one.

Rules that follow:

1. **`lastVerified` is mandatory** and is set by a human who opened the link.
2. **`activeAt` records where the project actually lives** when that is not the
   website. An entry whose only signal is a dormant site is delisted; an entry
   whose Telegram is active is kept and points there.
3. **A CI link check** (`pnpm check:projects`) resolves every `url` and
   `activeAt` and fails the build on a hard 404 or a domain that no longer
   resolves. Same posture as the existing README parity guard: rot becomes a
   red build rather than a reader's discovery. Soft signals (redirect to a
   parked domain, TLS expiry) warn rather than fail.
4. **An annual re-verification sweep**, tracked as a single issue, refreshes
   `lastVerified` across the collection. A `lastVerified` older than 18 months
   warns in CI. This is the honest maintenance budget for a solo maintainer:
   one afternoon a year plus whatever the link check catches automatically.

## Submissions

**Channel A (encouraged): GitHub issue template** — `.github/ISSUE_TEMPLATE/`
with fields matching the schema. The maintainer converts an accepted issue into
the entry file. Reviewing prose in an issue is faster than reviewing a
first-time contributor's PR, and it keeps the repo's commit history clean.

**Channel B: the support inbox** (`FEEDBACK_URL` from `@movar/brand`) for
anyone without a GitHub account — a course organiser or a publisher should not
need one. Manual, and deliberately so.

**Direct PRs** are accepted from anyone who prefers them, subject to the path
guard below.

### Is the narrow CODEOWNERS path safe? (asked 2026-08-14)

Reviewed 2026-08-14 against the repo's workflows. The CI is better hardened than
most — release and deploy credentials are already unreachable from a pull
request — but **CODEOWNERS itself is not what protects the repo**. It is
advisory here by design: `.github/CODEOWNERS` records that with a single
maintainer the branch ruleset requires 0 approvals and `require_code_owner_review`
is off, so it auto-requests review and blocks nothing. The protection is that
only the maintainer merges.

Accepting submissions as pull requests from strangers is a change in exposure
regardless, so two additions rather than relying on CODEOWNERS:

1. **A changed-paths guard.** A CI check that fails when a PR touching
   `apps/marketing/src/content/projects/**` touches anything outside it,
   including the lockfile, workflows and build scripts. A directory submission
   has no business editing any of those, and without this a submission-shaped
   PR title is enough cover.
2. **Require approval for all outside collaborators' workflow runs** in the
   repo's Actions settings, so a first-time contributor's PR does not run CI
   unreviewed.

Both are prerequisites for opening submissions, not follow-ups. The detailed
review that produced them is deliberately not reproduced here.

## The optional badge

A small "listed in the Movar directory" mark, offered to every entry, linking
back to the directory. Serves the reciprocity the rejected requirement tried to
force — projects that like being listed will link back, and the ones that don't
lose nothing.

- Static SVG served from the marketing site, plus a copy-paste HTML snippet.
- Setting `badge: true` on an entry is a courtesy marker for our own tracking,
  **never** a sorting key, a visual tier or a listing condition. If it ever
  becomes featured placement, we have rebuilt the rejected requirement with a
  softer face.
- Badge terms restate the disclaimer: displaying it does not make the project
  part of Movar.

## Movar Audit adopters list (deferred)

A separate, opt-in page listing **sites that have adopted Movar Audit and pass
it**, each with the report that proves it. A site owner runs the audit, passes,
and asks to be listed; we publish the entry and the evidence. Admire, never
shame — no failing grade is ever published, nobody is listed without asking,
and absence from the list carries no meaning.

It was called an "honour roll" in earlier drafts. That name is a school-grading
idiom — literally a list of pupils ranked by marks — which is precisely the
thing this project has decided it will not do to the people it promotes. The
plain word is the right one.

**No longer blocked (2026-08-14).** `@movar/audit` shipped while this plan was
being written, and movar.fyi audits itself in CI — so the tool exists, has a
published ruleset a site owner can check themselves against, and its vendor
passes its own rules, which is the precondition for asking anyone else to.

It remains out of scope for _this_ plan and must not become a soft
prerequisite for launching the directory: the directory is unconditional, and
an adopters list that arrives alongside it would be read as the gate that was
rejected. Ship the directory, let it sit, then build the adopters list as its
own thing. It is also the natural home for the badge's stronger sibling.

## Disclaimers, delisting and personal data

**Disclaimer** — one clear sentence, not a wall. On the index, on each entry
card, and in the badge terms:

> Ці проєкти незалежні від Мовара. Каталог — публічний перелік ініціатив, що
> популяризують українську мову; його не спонсоровано, і жоден проєкт у ньому
> не пов'язаний із Моваром.

Heavy legalese would signal anxiety and imply a liability we are not exposed to.
One line, stated plainly, in both locales.

**Delisting policy** — this, not the disclaimer, carries the real risk. The
exposure is not that a reader thinks a project is part of Movar; it is that a
listed project does something reputationally toxic while our page still
recommends it. Published on the criteria page:

- Removal on request from the project, no questions asked.
- Removal when a project stops meeting the criteria, goes dormant, or fails the
  link check for two consecutive sweeps.
- Removal at the maintainer's discretion for conduct incompatible with the
  directory's purpose — stated as discretion rather than dressed as a rule.
- No public notice of removal and no explanation published. A delisting is not
  an accusation.

**Personal data** — individuals may be listed, and every one of them is
personal data carrying a right to object and to erasure. The protections are
in "Individuals" above and are enforced by the schema rather than by
remembering: `person: true` without a `consent` record fails the build. A
removal request from a named person is honoured immediately and outranks every
other rule here, including the link-check and sweep logic.

## Launch, and the article that follows it

**The directory ships on its own** (decided 2026-08-14). It is a standing page
with its own value; gating it on an article would delay it for no reader's
benefit and put the article on the critical path of a page that does not need
it.

Order of operations:

1. **Directory page ships** — seeded, verified, disclaimers and criteria in
   place. This is the launch.
2. **Outreach** — invitations go to listed projects, each pointing at a live
   page that already lists the recipient. Nothing is asked in return; the badge
   is offered, not requested.
3. **A dedicated article follows**, on its own schedule, as a normal blog post
   in the existing `blog` collection with the standard `BlogCta.astro`. Working
   title: «Хто працює для української», echoing the directory's name. It is
   not a launch announcement and should not be written as one — by the time it
   runs, the directory will have entries, submissions and outreach replies
   worth writing about, which is a far better piece than a launch post.

Sketch for that later article — deliberately thin, because it should be written
against what the directory has actually become:

- **The supply side.** Movar makes sites serve you Ukrainian; it cannot make
  Ukrainian exist. These people do.
- **Portraits, not a list dump.** Two or three projects told concretely; the
  directory link carries the rest.
- **What the research turned up** — including the parts that do not flatter:
  a twenty-year-old library that shut down, a much-loved project whose website
  has been silent since 2022, and how often a confident secondary source is
  simply wrong about whether something still exists.

The submission invitation does **not** wait for the article. It lives on the
directory page itself, in both locales, from day one.

## Outreach

Three tracks, with different rules, because they ask for different things. All
three run **after** the directory page is live, so every message points at a
page the recipient can already see.

Templates for all three, and the send-tracking table, live in
[`for-ukrainian.outreach.md`](for-ukrainian.outreach.md).

**Consent and permission.** Tracks B and C send messages to real people on the
project's behalf. Each track's message is drafted here for review; sending is
the maintainer's call and is done by the maintainer or on their explicit
instruction, message by message. No outreach is automated and none is bulk-sent.

### Track A — courtesy note to listed organisations

Already listed; nothing is being asked. The note says: you are listed, here is
the link, here is the badge if you want it, tell us if we described you wrong.
It explicitly states that nothing is required in return, because the recipient's
first assumption on receiving it will be that something is.

### Track B — consent requests to individuals

**Blocking**: no individual is listed until they reply yes. Recipients are the
three individual translators identified during research, reachable through
channels they publish via КУЛІ and its Discord. They are named in the working
outreach notes rather than here — publishing an intent to list someone is not
meaningfully different from listing them, and consent has not been asked yet.

The message states what would be published (name, link, one-line summary, both
locales), that consent can be withdrawn at any time with no reason, and that no
contact details will ever appear. Non-response is a no. There is no follow-up
chase beyond a single reminder, and a "no" is never asked about twice.

### Track C — liveness enquiries to held projects

For projects that look dormant but may not be — currently Мова – ДНК нації. The
question is genuinely a question, not a listing offer dressed as one: are you
still active, and where should we point people? A reply that says "we have
stopped" is as useful as a yes, and is recorded so the annual sweep does not
re-ask.

## Going public: the four things that change together (built 2026-08-14)

The page ships built, served and deliberately unfindable. That state is three
mechanisms, not one, and "we didn't link it" is the weakest of them — a static
build ships every page and the CDN serves it to anyone who asks. To make the
directory public, change all of these in one commit:

1. **Drop `noindex`** — remove the prop from both `pages/for-ukrainian.astro`
   and `pages/uk/for-ukrainian.astro`.
2. **Drop the sitemap exclusion** — remove both routes from `UNLISTED` in
   `astro.config.mjs`.
3. **Add the footer link**, and with it a `localeForUkrainianHref` helper.
   There is deliberately none today: an href helper with no caller is dead
   code, and the metrics gate fails on it.
4. ~~Add the middleware entry.~~ **Already done, and no longer optional.**
   `/for-ukrainian` is in `MIRRORED_PAGES`, and `check-locale-redirects.mts`
   fails the build without it. The silent breakage that file's header used to
   warn about is a loud one now.

Two more that are not code:

- **Visual baselines exist already** (`marketing-for-ukrainian-{en,uk}[-dark]`),
  so any change to the page turns the e2e visual suite red until they are
  regenerated with `pnpm e2e:baselines:marketing`. That is the intended
  behaviour, not an obstacle.
- **Turn on "Require approval for all external contributors"** in the repo's
  Actions settings before submissions open. The changed-paths workflow is the
  other half of that mitigation and does not substitute for it.

### Known friction: the metrics gate and this app

`apps/marketing` has no test target, so every function in it scores zero
coverage, and CRAP (complexity weighted by uncovered-ness) is therefore high
for anything moderately branchy. `preferredPrimaryTags` in
`functions/_middleware.ts` sits above the threshold on that basis and is
reported for **any** change to this app, whether or not the change goes near
it. It is pre-existing, untested, and load-bearing for locale routing.

Refactoring it blind is the wrong trade; giving the marketing app a test target
is the real fix and is its own piece of work. Until then, a marketing PR either
carries the maintainer's `accept-metrics-regression` label or waits on that
work. The label is a human decision by design
([metrics-gate.md](../metrics-gate.md)) and is not one an agent should apply on
the maintainer's behalf.

## Seed list from research (2026-08-14)

Verified by direct fetch on 2026-08-14 unless noted. **23 entries clear** for
launch, grouped by sphere. A further four are queued behind outreach — three
individuals awaiting consent and one dormant project awaiting a reply — and join
only if the answer comes back. The original 30 target was not reached: one
category turned out to be structurally hard to fill rather than under-researched
(see "Categories that resisted"), and the remainder of the gap was filler not
worth listing.

### Ігри

| Project                                     | Note                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Шлякбитраф / SBT Localization               | Since 2012, 14th anniversary; 2025 releases incl. S.T.A.L.K.E.R. 2, Kingdom Come 2. Marked **active** in КУЛІ |
| КУЛІ — каталог української локалізації ігор | By UnlocTeam; 3,314 official + 82 semi-official + 985 unofficial localisations                                |
| UnlocTeam                                   | Studio behind Cyberpunk 2077, Silent Hill 2 and КУЛІ. Own site 403s automated fetch; **active** per КУЛІ      |
| Traductores Sin Fronteras (TSF)             | Classic games with Ukrainian voiceover; involves volunteers and voice studios                                 |
| Екзордіум                                   | Volunteer localisation team, active per КУЛІ                                                                  |

This sphere **links to КУЛІ rather than reproducing it**. КУЛІ already catalogues
every team with an active/inactive marker and is maintained by people closer to
the field than we are; duplicating it would create a second list that drifts. We
list the majors and point at the index.

### Освіта

| Project                        | Note                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Рух Єдині                      | 140,000+ participants, 38 cities, ~600 volunteers; free 28-day transition course, paid tiers are donations |
| Є-мова (ГО «Український світ») | Volunteer courses since 2013 (32 cities, 137 volunteers); 60,000+ users, 30,000 certificates               |

### Письмо

| Project                     | Note                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Словотвір                   | 15,000+ borrowings, 99,400+ proposed Ukrainian equivalents, community-voted                                                                                       |
| Горох (goroh.pp.ua)         | 11 dictionary sections incl. a 260M-word frequency corpus; free with optional ad-free tier                                                                        |
| r2u.org.ua / e2u.org.ua     | 463,176 entries; new dictionary added 05.07.2026. Compilers: Rysin, Starko, Marchenko, Telemko                                                                    |
| OnlineCorrector             | Freemium corrector (Google Docs / Word add-on). **`funding: commercial`** — the free tier is limited                                                              |
| Друкарня (drukarnia.com.ua) | Publishing platform that blocks Russian-language posts by design, explicitly to displace Russian content from Google — the closest sibling to Movar's own mission |

### Книжки та знання

| Project           | Note                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Читомо            | Book-publishing media, ГО «Культурно-видавничий проєкт Читомо»; article dated 14.08.2026   |
| Diasporiana       | 26,621 diaspora publications, free PDF/DjVu, volunteer-run; additions through 2026         |
| Барабука          | Ukrainian children's and YA literature resource; active 2026                               |
| Вікімедіа Україна | Ukrainian Wikipedia, Вікімарафон, Вікі любить Землю / Пам'ятки; blog post dated 14.08.2026 |

### Медіа

| Project          | Note                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Куншт            | Ukrainian popular-science media, free, article dated 12.08.2026. Founded because Ukrainian-language science publishing did not exist |
| Локальна історія | History platform and magazine, Lviv; issue #5/2026. Mixed free/paid                                                                  |

### Типографіка

| Project                        | Note                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Fixel (MacPaw × AlphaBravo)    | Open Font License, free, complete Ukrainian layout, 18 Ukrainian decorative glyphs                                        |
| Kyiv Type / Dmytro Rastvortsev | Free city-branding typefaces (Kyiv, Kyiv Region, Vinnytsia). Licence terms to be confirmed with the author before listing |

### Технології

| Project                          | Note                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `brown-uk/dict_uk` (ВЕСУМ)       | 627 stars; data CC BY-NC-SA 4.0, software GPL-3.0; Rysin & Starko — the dictionary under LanguageTool's Ukrainian rules |
| lang-uk (`github.com/lang-uk`)   | 59 repos, commits through July 2026; partners UCU and KSE. **`activeAt` → GitHub**: lang.org.ua itself looks stale      |
| `osyvokon/awesome-ukrainian-nlp` | 239 stars, active through 2025. Note: the org is `osyvokon`, not `asivokon`                                             |

### Held, but asked (decided 2026-08-14)

- **Мова – ДНК нації.** Website silent since mid-2022; Telegram active but its
  most recent post is ~6 months old. **Not listed at launch, but contacted** (outreach track C): if they reply and
  point us at where they are active, they go in. Silence is not read as an
  answer — the entry stays out and is retried at the annual sweep.
- **Mariupol** typeface — free, made for the city's branding, but distributed
  without a clear licence file alongside it. Licence to be confirmed before
  listing; not an outreach case.

### Categories that resisted

- **Відео / YouTube** — a real sphere with nothing verified to put in it.
  Ukrainian-language video is overwhelmingly made by individuals, so filling it
  runs through the consent track rather than through research. Not shipped as a
  category; probably the largest single gap in the directory.
- **Dubbing and subtitling** — the professional studios are commercial vendors
  rather than promotion initiatives, and the volunteer studios
  (MelodicVoiceStudio, Робота Голосом and similar) mostly work from unlicensed
  source material, which the exclusions rule out. TSF is the one clean case
  found and sits under Ігри.
- **Software / OSS localisation** — no longer a problem. The Ukrainian teams for
  Mozilla, KDE, GNOME and LibreOffice exist as mailing lists and Weblate/Pontoon
  pages rather than as projects with a front door, so they could not carry a
  category of their own; under **Технології** they can be added one at a time
  whenever a joinable team page is found.

### Excluded during research, with reason

- **Communities distributing unlicensed copies.** Some do substantial
  Ukrainian dubbing work, and the dubbing is not the problem — the
  distribution it sits on is. Set aside without a public accusation.
- **Collectives that have disbanded**, per their own or КУЛІ's statement. The
  correct handling of a dead project: not listed, no commentary.
- **Agencies whose ownership sits outside the directory's purpose.** At least
  one such case appeared during research. The criteria page needs language
  general enough to carry the decision without singling anyone out, since the
  judgement is about fit rather than about quality of work.
- **Advocacy channels whose framing is hostile toward Russian-speaking
  Ukrainians.** The case the "attacks speakers" criterion exists for. Not
  named here: the criterion is the durable part, and a list of who failed it
  is the shaming this project has decided against.
- **Мовний омбудсман** and the state academy dictionary portals — linked from
  the criteria page as resources, not listed as entries.
- ~~Individual translators.~~ **No longer excluded** (2026-08-14). The three
  identified during research move to outreach track B and are listed once each
  has consented. Until then they are absent from the page — an unanswered
  consent request is not consent.

### Prior art

No general directory of Ukrainian-language-promotion initiatives appears to
exist. КУЛІ covers games thoroughly and should be credited as the model rather
than duplicated. `awesome-made-by-ukrainians` and `awesome-it-communities-ua`
cover Ukrainian developers and IT communities — a different axis. The language
ombudsman publishes a courses list, which is state-run, unstructured and covers
one sphere.

## Open questions, with recommendations

None of these block drafting; all four want an answer before the page is built.
Naming and route were open here until 2026-08-14 and are now in "Decisions
locked".

1. **Ordering — recommend alphabetical by the page locale's collation**
   (`Intl.Collator('uk')` on `/uk/`, `('en')` at the root), with "listed
   alphabetically, not ranked" stated on the criteria page. Any other order is
   a ranking, and the top of a list is a position of favour — the same
   objection that removed `tier`. Two consequences to accept deliberately: the
   two locales show different orders, which is correct rather than a bug; and
   mixed-script names (Шлякбитраф, Fixel, `r2u`) sort by the collator's rules
   rather than by intuition, so the criteria-page sentence is what stops it
   looking arbitrary.
2. **Відео — recommend not shipping the sphere at all**, and opening it once
   three creators have consented. A category with one card reads as an
   unfinished page. This resolves itself post-launch either way, since it
   depends entirely on outreach track B.
3. **Adopters list — recommend permanently separate**, and this one is settled by
   a principle already adopted rather than by taste. As a column in the
   directory, a missing badge reads as a failing grade, which rebuilds exactly
   the grading that was rejected. As a separate opt-in page, absence means
   nothing.
4. **Sequencing — recommend v1.5.2 first, then the directory, then «Мовна
   гігієна».** A priority call, not a dependency: the release has users waiting
   on 25 changesets of fixes, and the directory has nobody waiting. The stale
   Ukrainian store listings are **not** a blocker for it — they are being
   refreshed with the upcoming redesign on their own track, and the site copy
   can lead the listings rather than wait for them.

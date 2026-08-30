---
name: movar-copy
description: |
  Write or edit user-facing copy in Movar's voice, in both locales, without
  shipping a claim the code contradicts. Use whenever you touch a user-facing
  string — the extension UI (packages/i18n), the marketing site
  (apps/marketing/src/i18n.ts), the Safari host app, store listings,
  RELEASE-NOTES/WHATS-NEW — or when asked to reword, tighten, or review copy,
  a headline, a CTA, an error message, or a section of the marketing page.
  Also use when adding a NEW string, which needs a UA and an EN version in the
  same change. Do NOT use for README.md (that's sync-readme), for CHANGELOG.md
  or commit messages (engineering conventions, not product voice), or for
  before/after screenshot wiring (that's add-before-after-case).
---

# Write Movar's copy

[`docs/copy.md`](../../../docs/copy.md) is the authority — nine sections covering
voice, the two sides, UA and EN mechanics, register, lexicon, and the nevers.
**Read the sections that bear on your edit before writing.** This skill is the
operating procedure around it, not a summary of it.

## Where the strings live

| Surface                                         | File                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| Extension UI — popup, options, curtains, errors | `packages/i18n/src/messages-{uk,en}.ts`                  |
| Content-script strings                          | `apps/extension/src/lib/i18n/content-strings-{en,uk}.ts` |
| Marketing site (all pages, OG, deep dives)      | `apps/marketing/src/i18n.ts`                             |
| Safari host app                                 | `apps/safari-host-app/src/i18n/messages-{uk,en}.ts`      |
| Store listings, release notes                   | `apps/extension/store-assets/**`, `RELEASE-NOTES.md`     |

## The four things that actually go wrong

### 1. One locale ships without the other

UA and EN are both canonical. A new string needs both **in the same change** —
and they are **drafted in parallel, not translated** (`docs/copy.md` preamble).
UA sets the register when one has to land first.

### 2. The UA reads like a translation

This is the failure mode a machine reaches for by default. `docs/copy.md`
§4.10–4.14 is the checklist; the tests that catch the most:

- **Token-for-token alignment with the EN sibling** is the tell. The shipped
  pair _"Got it." — then shows Russian anyway_ / «Прийнято.» — і показує
  російською drops _anyway_ in UA because the dash already carries it.
- «дозволяє вам», «допомагає вам», «забезпечує» — direct renderings of _allows
  you to_ / _helps you_ / _provides_. Say what happens instead.
- Active participles: «фільтруючий», «блокуючий» → «фільтр», «який блокує».
- Канцелярит: «здійснювати перевірку» → «перевіряти».
- AI register tells: triads, «не просто X, а Y» as a default sentence shape,
  «У світі, де…», suspiciously even bullet lists.

Mechanics that have no lint rule and are therefore review-only: « » guillemets
(§4.2), the ʼ apostrophe at U+02BC (§4.3), em-dash **with spaces** (§4.4).

### 3. The copy claims something the product does not do

Every user-facing claim must be **literally true against the code**, because
store reviewers read these surfaces. Verify against the source, not against
another copy surface — mirrored copy propagates a wrong claim rather than
catching it. Recent examples of claims that were false when written:

- «список сайтів, який ми постійно розширюємо» — there is no list;
  `@movar/lang-pickers` walks the DOM for any switcher.
- Per-element filtering implied to work on marketplaces — `models` is
  `[googleModel, youtubeModel]` and nothing else.
- «Знімки з реальної збірки — не макет» on the homepage drum — the PNGs are
  Storybook-rendered approximations with fictitious `.example` domains, which
  `apps/extension/store-assets/REQUIREMENTS.md` in fact **requires**.

Before shipping a capability claim, grep for the behaviour and read it.

### 4. The claim is true here and stale in six other places

Product claims are mirrored across surfaces with **no guard**. Changing a
feature or a permission means reconciling every copy of its claim: both
`privacy.astro` pages, both store `PRIVACY-FORM`s, `STORE-LISTING.md`,
`docs/copy.md`, `README.md`, the deployment checklist, and the Edge asset notes.
Grep the distinctive phrase across the repo before you consider an edit done.

## Procedure

1. **Read** the relevant `docs/copy.md` sections — always §1 (voice) and §7.4
   (forbidden lexicon); §4 for UA, §5 for EN, §6 for length caps.
2. **Draft both locales.** UA first unless the string is EN-native by nature.
3. **Verify the claim** against code, not against another string.
4. **Run the §4.10–4.14 pass over the UA** — read it aloud; if it maps word for
   word onto the EN, rewrite it.
5. **Sweep for mirrors** of any claim you changed.
6. **Check** — `pnpm --filter @movar/marketing typecheck`, and `pnpm check:readme`
   when the hero tagline or a product promise moved. Marketing copy changes
   invalidate the e2e visual baselines; regenerate on a quiet machine
   (`pnpm e2e:baselines:marketing`).

## When copy.md and the corpus disagree

The corpus wins, and the doc gets corrected in the same change — §4 is explicitly
_descriptive of the current corpus_. Three rules were found stale this way and
fixed rather than obeyed: a claimed ESLint apostrophe rule that does not exist, a
string path that had moved to `packages/i18n`, and a ban on «Мовар» that 160
shipped strings ignore. Do not "fix" working copy to satisfy a stale rule.

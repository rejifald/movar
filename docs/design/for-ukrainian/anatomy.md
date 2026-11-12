# «Для української» directory card — anatomy

Reference: `./reference/{Main,Main-en,Mobile-uk,Mobile-en}.png` (frozen 2026-11-12; each shows
light then dark, stacked) · Canvas: https://claude.ai/artifact/JURJpjqdbp87FS66LDbBU5 (private,
owner only) · Decided: 2026-11-12 by the owner.

The reference was rendered from the canvas artboards, which **reconstruct** the existing card
from code. For every element this design does not change (heading, summary, card shell, grid,
sphere header, the `activeAt` line), the **current code's classes win** over the artboard's
approximate values. Only the address line and the funding label are new design.

## 1. The screen

- **What:** the project cards on `/uk/for-ukrainian` and `/for-ukrainian`, both rendered by
  `apps/marketing/src/components/ForUkrainian.astro`. Data: the `projects` content collection
  (`apps/marketing/src/content/projects/*.md`, ~21 entries, 7 spheres).
- **Who:** readers looking for Ukrainian-language projects; project owners checking their
  listing.
- **Primary viewport:** 1280 (3 columns, `lg:`); 390 (1 column, below `sm:`). 2 columns at `sm:`.
- **Sparsest real data:** zero entries carry a mark after this PR (no real mark files exist yet).
  Every card shows the Globe. The mark states exist for future entries (OLDboi's entry PR is
  expected to bring the first).

## 2. Decisions

- **Optional project mark in the address line (canvas Direction 3).** A 16px leading slot exists
  on **every** card's address line. It shows the project's mark in the address line's own ink
  (`text-ink-faint`), or the lucide `Globe` when the entry has no mark. Heading, summary, card
  size and order are unchanged.
  _Why:_ the plan doc's invariant is that no card can grow a cell for a favourite. A mark at
  metadata weight, in one ink, in a slot every card already has, reads as attribution (a
  byline), not as identity or promotion.
- **Funding label as plain text (option Б).** Same place and words as today's chip
  (`t.funding[...]`), minus the border, fill and radius, in `text-ink-faint`. The information
  stays: the schema says "a reader deserves to know when a listed course costs money before
  they click". The chip was the card's only box and, after the mark, the heaviest element.
- **Mark permission is schema-enforced** (owner, 2026-11-12). An entry with `mark` must carry
  `markConsent: { date, channel }`, and only such an entry may carry it — the same refine
  pattern as `person`/`consent`.
- **Marks are rendered in one ink regardless of the file's colours** (so a full-colour logo
  cannot out-shout a neighbour). Mechanism is the implementer's: CSS mask with `bg-current`, or
  inlining the SVG and forcing `fill: currentColor`. Check the marketing CSP before relying on an
  inline `style` attribute. Either way the rendered mark must follow `currentColor` in both
  themes.
- Rejected (archived on the canvas): D1 identity tile (a 40×40 tile on every card — colour logos
  still pop, wide wordmarks shrink to slivers); D2 mark replaces the name (custom lettering among
  Fixel headings is still the odd one out). Funding label: keep the chip; inline in the address
  line (long hosts truncate, three items on one line); eyebrow above the name (reads as a
  ranking category); removed (a commercial studio and a volunteer group look identical).
- Diverges from the reference: none confirmed. Build as drawn.
- Open: none.

## 3. Code archaeology

- `apps/marketing/src/components/ForUkrainian.astro` top comment: "Do not give a card a logo, a
  metric or a highlight state." Must be rewritten to the narrow rule (see §5, _Plan + comment_).
- Same file, the card: `<div class="flex flex-col gap-0.5">` holds the `h3` link and
  `<p class="truncate font-mono text-xs text-ink-faint">{hostOf(entry.data.url)}</p>`. The host is
  **deliberately not a second anchor** (comment explains: duplicate tab stop). Keep it that way;
  the mark is not a link either.
- Same file, `fundingTag` const (chip classes) and `<div class="pt-1"><span class={fundingTag}>`.
  This is what becomes plain text.
- `hostOf()` strips `www.`; `haystackOf()` feeds client search from name + summary — the mark adds
  nothing to search.
- `sortEntriesByName` in `apps/marketing/src/lib/for-ukrainian.ts`: `Intl.Collator('uk')` on the uk
  page, `'en'` on the en page (Latin before Cyrillic). Untouched — the mark never affects order.
- `apps/marketing/src/content.config.ts` ~L162–225: `projects` schema is a plain `z.object(...)
.refine(person ⇔ consent)`. Adding `image()` requires the schema to become the function form
  `schema: ({ image }) => z.object(...)`. Keep the existing refine and its message; add a second
  refine for `mark ⇔ markConsent`, and one that rejects a non-SVG mark (`format === 'svg'`).
- `docs/articles/for-ukrainian.plan.md` ~L286–292, the bullet "Every card is the same size and
  carries the same fields … Do not add one." Needs an explicit, narrow reversal (wording in §5).
- `packages/theme/src/tokens.ts` `iconSize`: `sm: 14` has **no legal class** — `size-3.5` is a
  banned half-step; pass it as a numeric prop (`<Globe size={iconSize.sm} />`). `md: 16` = `size-4`.
- Repo rules: icons are lucide (`lucide-astro` in `.astro`), never hand-inlined SVG paths; test
  infrastructure stays out of runtime source (no fixture marks in `src/content/projects`).
- e2e: `apps/e2e/src/marketing/pages.ts` lists `for-ukrainian` (uk + en) for the marketing
  Playwright config. Visual baselines are amd64/Docker-regenerated in this repo.

## 4. Component inventory

All elements live inside `ForUkrainian.astro`; no shared component is created.

| Element on artboard            | Component             | Status | Import / place                      | Fidelity | Artboards |
| ------------------------------ | --------------------- | ------ | ----------------------------------- | -------- | --------- |
| Card shell, heading, summary   | existing card markup  | reuse  | `ForUkrainian.astro`                | as-drawn | all       |
| Address line (slot + host)     | address line          | extend | `ForUkrainian.astro`                | as-drawn | all       |
| Globe fallback                 | `Globe` icon          | reuse  | `lucide-astro`                      | as-drawn | all       |
| Project mark (square/wordmark) | mark element          | new    | `ForUkrainian.astro` (inline)       | as-drawn | all       |
| `·` after a wordmark           | separator             | new    | `ForUkrainian.astro`                | as-drawn | all       |
| Funding label                  | plain text `<p>`      | extend | `ForUkrainian.astro` (`fundingTag`) | as-drawn | all       |
| Schema fields                  | `mark`, `markConsent` | new    | `content.config.ts`                 | n/a      | n/a       |

## 5. Components

### Address line (extend)

- **Description:** says where the name goes, now with whose mark it is.
- **Markup:** the existing `<p>` becomes a flex row: `flex items-center gap-1.5` (6px), height
  `h-4` (16px), `font-mono text-xs text-ink-faint`, `whitespace-nowrap`. Children in order:
  1. slot — `Globe` (`size={iconSize.sm}`, `aria-hidden="true"`, `shrink-0`) when there is no mark;
     else the mark;
  2. `·` (`aria-hidden="true"`, `shrink-0`) **only** after a wordmark (see mark shapes);
  3. host text in a `<span class="truncate">` (`min-w-0`) — the host truncates first; the slot and
     the dot never shrink.
- **States:** none interactive (it is not a link). Hover on the card does not change it.
- **Responsive:** identical at every width. At 390 the inner card width is ~302px; the longest real
  host (`sbt.localization.com.ua`) fits beside the Globe (see `Mobile-*.png`).
- **A11y:** Globe decorative. A mark is `role="img"` with `aria-label` = the project name
  (`entry.data.name`, untranslated in both locales). The heading already names the project, so a
  screen reader hears the name twice only for entries with a mark; acceptable and as drawn.
- **Token map:** gap → `gap-1.5`; height → `h-4`; colour → `text-ink-faint`; type → `font-mono
text-xs`; Globe → `iconSize.sm`.

### Project mark (new, inline in the component)

- **Shapes**, decided from the image metadata (`width / height`):
  - **square-ish** (ratio ≤ 1.5): rendered `iconSize.sm` × `iconSize.sm` (14×14), same box as the
    Globe. No dot.
  - **wordmark** (ratio > 1.5): rendered 16px tall (`h-4`), width from the ratio, capped at 48px
    (`max-w-12`); followed by the `·` separator.
- **Ink:** always `currentColor` (= `text-ink-faint`) in both themes, whatever the SVG's own fills.
- **Content contract:** source `entry.data.mark` (an SVG imported via `image()`), optional. File
  lives beside the entries, e.g. `src/content/projects/marks/<slug>.svg`. No mark → Globe.
- **Test contract:** schema unit tests (Vitest, alongside the existing marketing lib tests): mark
  without `markConsent` fails; `markConsent` without mark fails; a PNG mark fails; an entry with
  neither passes. Rendering: verify square + wordmark + none with a **test-only** fixture (Astro
  container API or a dedicated e2e fixture route) — never a fake entry in production content.

### Funding label (extend)

- Replace the chip `<span class={fundingTag}>` with
  `<p class="pt-1 font-mono text-ui-xs font-semibold uppercase tracking-label text-ink-faint">`
  (drop the border, `bg-surface-2`, `rounded-md`, `px-2 py-0.5`; `text-ink-medium` → `text-ink-faint`).
  Delete or rename `fundingTag` accordingly. Copy unchanged (`t.funding[...]`).
- Check contrast: `ink-faint` on `surface` at this size must pass AA in both themes (it is the
  host line's existing colour, which already ships).

### Plan + comment (docs, same PR)

- Plan doc bullet, replace the last sentences with: "…the moment a card grows a logo, a metric or a
  highlight state, the directory has started grading. **The one exception, decided 2026-11-12:** a
  project's own mark may sit in the address line, no larger than that line, in its ink, in a slot
  every card has (cards without a mark show a globe). Nothing else may be added." Keep the rest.
- Component top comment: same narrow rule, pointing at `docs/design/for-ukrainian/anatomy.md`.
- Schema comment on `mark`: one line on why it is single-ink and consent-gated.

## 6. Composition

Unchanged: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, card `flex h-full flex-col gap-2 p-5`,
cards stretch to the row's tallest. The address line keeps its 16px height whether it holds the
Globe, a square mark or a wordmark, so cards in one row never differ because of a mark. Between
breakpoints, nothing new: the host truncates when the column narrows.

## 7. Out of scope

- Adding any real mark (no entry ships one in this PR; OLDboi's entry PR adds the first).
- A broken mark file at runtime — impossible by construction (`image()` fails the build).
- How a project submits a mark (the submission page / issue template copy) — not designed.
- The hero, search, sphere chips, disclaimer band, empty state — untouched.

## 8. Implementation notes

Recorded when the design shipped, so the next reader does not re-derive them.

- **Ink mechanism: CSS mask.** `.byline-mark` in `apps/marketing/src/styles/global.css` fills the
  box with `currentColor` and masks it with the SVG; the component sets only `--byline-mark` (the
  file's URL) and the box size. The marketing site sends no CSP, so the inline `style` is not
  blocked.
- **The SVG-only rule checks the path, not `format`.** Under Astro's content layer, `image()`
  still holds the path at parse time and resolves to metadata only at render time, so a refine on
  `format` would never see one. The schema requires a `.svg` path, then pipes it into `image()`.
- **The schema lives in `apps/marketing/src/lib/for-ukrainian-schema.ts`**, with `image()`
  injected, so its rules are unit-tested (`for-ukrainian-schema.test.ts`); `content.config.ts`
  passes the real `image()`. The rendering states are pinned by
  `apps/marketing/test/for-ukrainian-byline.test.ts` through Astro's container API, against a
  mocked collection — no fixture in `src/content/projects`.
- The OLDboi wordmark and the UnlocTeam square in the reference images are illustrations of the
  two mark shapes; neither ships with this change.

# @movar/ui

Shared design-system primitives for the Movar extension and marketing site.

## What belongs here

Generic, token-driven components with **no domain knowledge** — they don't
import product packages (`@movar/settings`, `@movar/events`, …), don't call
`chrome.*` APIs, don't read `useI18n`, and don't know what a "MovarSettings" is.

Today: `BrandMark`, `Button`, `Checkbox`, `IconButton`, `Pill`, `Select`, `Switch`.

If you're tempted to import a product type or a chrome API into a file in
`src/`, **stop** — the component belongs in the consuming app, even if you
plan to use it in more than one entrypoint. (Cross-entrypoint primitives that
are still app-specific live in `apps/extension/src/components/`, not here —
see `LanguageSelector` for the pattern.)

## Conventions

- **Source-mode package.** Consumers import `.tsx` directly via the
  `@movar/ui` workspace alias; no build step. The path is wired in
  `tsconfig.base.json` and the extension's `tailwind` `@source` directive in
  `apps/extension/src/styles/globals.css`.
- **Token classes only.** Every visual property routes through a token —
  `bg-surface`, `text-ink-strong`, `border-accent`, `text-accent-on`, etc.
  These resolve through `@theme inline` in each app's `globals.css` and flip
  with `@media (prefers-color-scheme: dark)` automatically. **No `dark:`
  variant classes** and **no literal Tailwind palette colors** (`bg-gray-*`,
  `text-zinc-*`, …) — both would defeat the existing prefers-color-scheme
  strategy. Tokens are the single source of truth in
  `packages/ui/src/tokens.css`, re-exported as `@movar/ui/tokens.css` and
  imported into each app's globals (`apps/extension/src/styles/globals.css`
  and `apps/marketing/src/styles/global.css`).
- **UI type scale: `text-ui-{micro,xs,sm,base,md}`.** Five small sizes used
  by primitives; sits beside Tailwind's default `text-*` scale (which stays
  reserved for app-level body/headline copy). Anything below `text-ui-md`
  should resolve through this scale — no `text-[12px]` etc.
- **`tone` vs `variant`.** `tone` selects a color intent (Pill's
  `accent`/`neutral`/`muted`). `variant` selects a structural shape
  (Select's `form`/`inline`). New primitives should follow the same split —
  don't use `variant` for colors or `tone` for layouts.
- **Focus is `focus-visible` + accent outline.** Every interactive primitive
  uses the same ring:
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.
  Form controls may additionally swap a border color on `focus-visible:` —
  but the outline ring is non-negotiable.
- **Disabled is `opacity-50 + cursor-not-allowed`** on the interactive root.
  For controls that also paint a hover surface (`IconButton`), pair with
  `disabled:hover:bg-transparent` so dim controls don't flash on hover.
- **Invalid state uses the `--danger` family.** Components that validate
  (`Checkbox`, `Select`) expose an `invalid?: boolean` prop that sets
  `aria-invalid` on the underlying control. Styling rides
  `aria-invalid:`-prefixed Tailwind variants against the danger tokens
  (`border-danger`, `outline-danger`, `text-danger`). Don't gate visual
  invalid styles on a React boolean — let the attribute be the source of
  truth so external code that sets `aria-invalid` (e.g. a form library)
  picks up the styling too.
- **Reduced motion.** Every `transition-*` is paired with
  `motion-reduce:transition-none`. Respects users who set
  `prefers-reduced-motion: reduce`.
- **Class joining: `cn` from `./internal/cn`.** Don't inline another
  `classes.filter(Boolean).join(' ')` helper — import the shared one so
  there's a single seam to upgrade if we ever need real class-merging.
- **Native HTML when possible.** Native `<input type="checkbox">`, native
  `<select>`, native `<button>` — they bring free a11y, keyboard, and form
  participation. Wrap with `appearance-none` + custom indicator when the
  default chrome can't be themed (see `Checkbox`).
- **File naming: kebab-case.** `checkbox.tsx`, not `Checkbox.tsx`. Mirrors
  the rest of the workspace (e.g. `packages/lang-detect`'s `lang-codes.ts`).
- **`exactOptionalPropertyTypes` is on.** Don't pass `prop: undefined`
  explicitly; either set the value or omit the prop. ARIA escape hatches
  (`'aria-label'?: string`) are typed with bracketed keys.
- **No tests yet.** Vitest is wired and `passWithNoTests` keeps the target
  green; add tests when a primitive grows enough behavior to need them
  (e.g., Checkbox's indeterminate effect would be a fine first test).

## Adding a new primitive

1. Create `src/<name>.tsx`. Use existing primitives as a template.
2. Re-export from `src/index.ts` (both the component and its prop types).
3. Verify with `pnpm --filter @movar/ui typecheck lint`.
4. Migrate consumers; verify the extension preview in both light and dark
   (`extension-popup-preview` and `extension-options-preview` in
   `.claude/launch.json`).

## Out of scope today

- `Input` (text/email/number) — three potential call sites in the extension
  today (`AllowlistSection` domain input, plus future forms). Worth
  extracting when the third forms gains a non-trivial variant (e.g. an
  inline-with-button shape).
- `Tooltip` — no consumer yet; would land alongside `IconButton` so the
  `aria-label` can surface as a visible hover hint.
- `Modal` / `Dialog` — not part of the current product surface. Pulls in
  focus-trap + portal logic and is its own design pass.
- Size variants on `Checkbox`, `IconButton`, `Select` (one size each); `Pill`
  has `sm`/`md` only — no `lg`. Add when the third use case appears.
- New `IconButton` tones (`danger`, `accent`). Add when the first
  destructive icon-button lands.
- A `danger` or `ghost` variant on `Button`. Tokens are wired; add when a
  destructive button (delete, clear history) or a second ghost-style
  consumer actually appears. The popup's footer Settings button is the only
  ghost-style today and reads fine as inline JSX.
- `--ink-medium` token — would let `Pill muted` keep a dim-but-AA-compliant
  text color (currently uses `text-ink` after the a11y pass, which trades
  the dim aesthetic for compliance). Add when the muted/neutral visual
  distinction matters again.

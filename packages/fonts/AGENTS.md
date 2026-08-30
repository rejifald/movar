# Fonts — `@movar/fonts`

Ships the brand typeface as `@font-face` CSS plus the woff2 files it points at.

## What it does

Carries **Fixel** — the Ukrainian typeface by MacPaw and AlfaBravo, SIL Open
Font License — subset to Latin + Cyrillic, one CSS entry per cut:

| import                               | family          | weight |
| ------------------------------------ | --------------- | ------ |
| `@movar/fonts/fixel-text-400.css`    | `Fixel Text`    | 400    |
| `@movar/fonts/fixel-text-500.css`    | `Fixel Text`    | 500    |
| `@movar/fonts/fixel-text-600.css`    | `Fixel Text`    | 600    |
| `@movar/fonts/fixel-text-700.css`    | `Fixel Text`    | 700    |
| `@movar/fonts/fixel-display-700.css` | `Fixel Display` | 700    |
| `@movar/fonts/fixel-display-800.css` | `Fixel Display` | 800    |

The shape deliberately mirrors `@fontsource/*`: per-cut CSS with a sibling
`files/` directory, so a surface imports exactly the weights it renders and the
existing import blocks did not have to change shape when Fixel replaced Manrope.

**This package does not carry Manrope.** The brand lockup still renders in
Manrope (`fontFamily.brand` in `@movar/theme`), and that comes from
`@fontsource/manrope` at weight 800 only, imported alongside these. See
"Boundaries" below for why.

## Boundaries & invariants

- **Latin + Cyrillic live in one file per weight**, not two. Every reader of
  this product needs Cyrillic, so splitting the scripts the way `@fontsource`
  does would only add a request without saving a byte in practice.
- **The subsets are committed; they are not generated at install time.** Fixel
  is a manual download, not a dependency, so nothing on a fresh clone could
  rebuild them. `scripts/subset-fixel.mts` regenerates them from an unpacked
  `FixelAll.zip` and is deliberately absent from `prepare` and every build
  target — wiring it in would break every clone that doesn't have the archive.
- **Ґ/ґ (U+0490–0491) is inside the subset range** and must stay there. A
  Russian-centric Cyrillic subset drops it; on this product that would be a
  visible, and pointed, defect.
- **No Reserved Font Name applies**, so the subsets keep the name Fixel.
  `OFL.txt` carries the copyright notice transcribed from the font's own `name`
  table, because the upstream archive ships no licence file.

## Public API

CSS entry points only — `./*.css` and `./files/*`. There is no JavaScript here;
the family _names_ are declared in `@movar/theme` (`fontFamily`), not here.

## Layout

```
files/            # subset woff2, one per cut — committed build output
fixel-*.css       # one @font-face per cut
OFL.txt           # licence + the upstream copyright notice
```

## Dependencies

None at runtime. `scripts/subset-fixel.mts` (repo root) uses `subset-font`.

## Consumers

`apps/extension`, `apps/marketing`, `apps/safari-host-app`, `packages/ui`
(Storybook). Each imports the cuts it renders and pairs them with
`@fontsource/manrope` 800 for the lockup.

## Working on it

Adding a weight means: subset it (`scripts/subset-fixel.mts`), add its CSS
entry, then import it from the surfaces that need it — and check that something
actually renders that weight first. Every cut here is ~45 KB on the wire, and
the extension popup pays it on open.

Changing the _family_ is a `@movar/theme` change (`fontFamily`), not a change
here — and it moves the whole product, so read `fontFamily.brand`'s comment
before touching `sans` or `display`.

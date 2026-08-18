# @movar/i18n

## 0.0.3

### Patch Changes

- 0150a77: settings: derive the block list from the priority list instead of storing it as a user-editable set. Closes #89.

  Which language is imposed over which is product policy, not a preference — and it could not be exposed safely. Detection distinctiveness is candidate-set-relative: `ы` cleanly separates Russian from Ukrainian, and goes inert the moment Belarusian joins the candidate set. A user adding a language to a free-form block list therefore weakened rung-1 Russian detection, and the failure mode was under-concealing Russian with no visible signal.

  `blocked` is now `deriveBlocked(priority)` — `((⋃ IMPOSED_OVER[priority].imposed) ∪ ['ru']) \ priority` — recomputed at every settings read and before every write, so a value synced from an older build or hand-edited in storage converges on its own. Russian stays unconditionally locked and can never enter the priority list; every other imposer is overridable by putting it in `priority`. The four runtime consumers (redirect trigger, picker stripping, conceal candidates, popup hero) keep reading `settings.blocked` unchanged — only its provenance moved. Behaviour for the shipped default profile is identical.

  The unmounted `BlockedSection` component and its now-unused copy are deleted rather than restored.

- 4bb2e87: Make the version stamp in the popup and options footers a link to the public changelog, anchored at the version the user is actually running.

  The stamp was inert text on both surfaces. It is the only place in the UI that names a release, so it is where someone goes after noticing the number changed — and it went nowhere. The store listings are no answer either: Chrome has no release-notes field at all, and the Firefox and App Store listings only ever show the newest version's notes. `movar.fyi/changelog` renders `apps/extension/store-assets/RELEASE-NOTES.md` — the same file those listings read — so it is the one surface that holds the whole history, in both languages.

  `changelogUrl(locale, version)` (`apps/extension/src/lib/changelog-url.ts`) builds `https://movar.fyi/changelog#v1.6.2`, or `/uk/changelog` when the resolved UI locale is Ukrainian, mirroring the site's own `localeChangelogHref`. The anchor is emitted only for a real semver: the static-serve preview renders `version = 'preview'` (no `browser.runtime.getManifest()`), and an anchor for that would resolve to nothing, so it opens the top of the page — the newest release — instead. Each release in `Changelog.astro` now carries the matching `id`, plus `scroll-mt-24`; the site's header is sticky and measures 73px, so without the offset a jump would land the release underneath it.

  Both footers render one shared `VersionLink`, so the two surfaces cannot drift into linking differently. Resting appearance is unchanged — same type ramp, no underline — and it opens in a new tab (`noopener`), since navigating in place would throw away the popup the user is standing in. The new `versionLink` catalogue string starts with the visible stamp (`v1.6.2 — what's new`) so the accessible name contains the visible label, as WCAG 2.5.3 requires.

  `@movar/brand` gains `SITE_URL` — the origin only. The `/uk` prefix is the marketing site's own routing concern, and that package is constants without logic, so callers compose the path they need.

  Not covered here: the Safari host app's About tab shows the same stamp as plain text. Its WKWebView runs under `default-src 'self'`, so external links route through the native bridge, and the `open-url` case does not exist in `ViewController.swift` yet — the existing "Source code" button is already a no-op on device. Linking the stamp there needs that native pass first.

- Updated dependencies [0150a77]
  - @movar/settings@0.0.2

## 0.0.2

### Patch Changes

- 1a5f277: onboarding: stop delivering the privacy guarantee as fine print. The reassurance was a faint, centred trailing line under the steps — arriving exactly where the reader has just handed over access to every site, in the one typographic register that reads as "safe to skip". It is now a titled card with a shield mark and a link to the public source, so the answer to "why is this safe to grant?" reads as part of the guide.

  The copy picks up the two claims it was missing (no accounts, no analytics — already the wording carried by the marketing privacy section) and closes on the source being public.

  Mirrors the same change to the marketing site's `/install` guide, which the onboarding page is deliberately kept in step with.

## 0.0.1

### Patch Changes

- Updated dependencies [c4689b0]
- Updated dependencies [3a5ca20]
  - @movar/lang-detect@0.0.1
  - @movar/events@0.0.1
  - @movar/settings@0.0.1

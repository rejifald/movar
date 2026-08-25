# @movar/brand

## 0.0.1

### Patch Changes

- deb7d72: Link the Safari host app's version stamp to the changelog, and teach the native shell to open external URLs at all.

  The previous change linked the version stamp in the extension's popup and options footers. The host app's About tab shows the same stamp and was left as plain text, because it could not have been anything else: its `WKWebView` runs under `default-src 'self'`, so every external link routes through the native bridge, and `ViewController.swift` had no case for opening one. The "Send feedback" and "Source code" buttons already in that footer were posting messages nothing consumed — silent no-ops on a real device. Adding a third dead control would not have been an improvement, so the native side comes first.

  `userContentController(_:didReceive:)` gains the two cases the host bridge has been posting all along. `feedback` opens the support `mailto:` from a Swift-side constant and carries no payload, so the address can never be chosen by the page. `open-url` opens its payload — but validates it first through `httpsURL(from:)`, which accepts only an absolute `https` URL with a host. Everything we send is a baked-in `@movar/brand` constant, yet it arrives as an untrusted string over a JS bridge, and that check is what keeps the case from becoming a launcher for `file:` or a custom app scheme if a script ever ran in that WebView. A future link needing another scheme gets its own payload-free case, the way `feedback` did. Both share one `openExternally(_:)` — `UIApplication.shared.open` on iOS, `NSWorkspace.shared.open` on macOS — since the footer shows on both platforms.

  The stamp then becomes a button posting `open-url`, labelled `v1.6.2 — what's new` in the same shape as the extension's `versionLink`, so the accessible name leads with the visible text (WCAG 2.5.3). Its resting appearance is unchanged: it carries `.link` for the button reset, tap target and focus ring, and keeps `.version` for the mono build-stamp look. Measured against the span it replaces, the box is the same width, the same left edge, and the text sits on the same baseline, so the About tab's visual baselines are untouched.

  With three surfaces now linking to the same page, `changelogUrl` moves into `@movar/brand` alongside the `SITE_URL` it is built from, and gains a `changelogPath` companion. The extension's `src/lib/changelog-url.ts` is gone; the host app never grew its own copy; and `localeChangelogHref` in the marketing site's `i18n.ts` — which is where the `/uk` prefix rule otherwise lives, one helper per page — now delegates to `changelogPath`, keeping its name, signature and call sites. Four surfaces, one definition of both the route and the `#v<version>` anchor. That anchor is a contract with `Changelog.astro`'s per-release ids that nothing enforces: if it drifts, the link silently lands at the top of the page, so both sides move together.

  This widens `@movar/brand` past "constants only" for the second time — `FEEDBACK_URL` was always derived — so the boundary is now written down explicitly: a function may live there only if it takes primitives, returns a URL or path, needs no workspace dependency, and exists because more than one app would otherwise write the same shape by hand. The seven `locale*Href` siblings meet none of that last test and stay in the marketing app.

- 4bb2e87: Make the version stamp in the popup and options footers a link to the public changelog, anchored at the version the user is actually running.

  The stamp was inert text on both surfaces. It is the only place in the UI that names a release, so it is where someone goes after noticing the number changed — and it went nowhere. The store listings are no answer either: Chrome has no release-notes field at all, and the Firefox and App Store listings only ever show the newest version's notes. `movar.fyi/changelog` renders `apps/extension/store-assets/RELEASE-NOTES.md` — the same file those listings read — so it is the one surface that holds the whole history, in both languages.

  `changelogUrl(locale, version)` (`apps/extension/src/lib/changelog-url.ts`) builds `https://movar.fyi/changelog#v1.6.2`, or `/uk/changelog` when the resolved UI locale is Ukrainian, mirroring the site's own `localeChangelogHref`. The anchor is emitted only for a real semver: the static-serve preview renders `version = 'preview'` (no `browser.runtime.getManifest()`), and an anchor for that would resolve to nothing, so it opens the top of the page — the newest release — instead. Each release in `Changelog.astro` now carries the matching `id`, plus `scroll-mt-24`; the site's header is sticky and measures 73px, so without the offset a jump would land the release underneath it.

  Both footers render one shared `VersionLink`, so the two surfaces cannot drift into linking differently. Resting appearance is unchanged — same type ramp, no underline — and it opens in a new tab (`noopener`), since navigating in place would throw away the popup the user is standing in. The new `versionLink` catalogue string starts with the visible stamp (`v1.6.2 — what's new`) so the accessible name contains the visible label, as WCAG 2.5.3 requires.

  `@movar/brand` gains `SITE_URL` — the origin only. The `/uk` prefix is the marketing site's own routing concern, and that package is constants without logic, so callers compose the path they need.

  Not covered here: the Safari host app's About tab shows the same stamp as plain text. Its WKWebView runs under `default-src 'self'`, so external links route through the native bridge, and the `open-url` case does not exist in `ViewController.swift` yet — the existing "Source code" button is already a no-op on device. Linking the stamp there needs that native pass first.

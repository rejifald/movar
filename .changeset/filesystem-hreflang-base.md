---
'@movar/audit': patch
---

Resolve a declared target against the build path when the page has no URL.

`resolveTargetPage` threaded `from.url` as `parseLocator`'s base, and `PageEvidence.url` is documented "present on network evidence" — a page collected off disk carries `path` instead. So `new URL(href, undefined)` could not resolve, and every relative href on filesystem evidence fell back to the site-root reading #430 removed for pages that do carry a url: `../uk/guide.html` declared on `/docs/en/guide.html` became the literal path `/../uk/guide.html`, and a bare `./` self-reference became `/.`. #430 fixed exactly this defect for network evidence and left the filesystem case out of scope.

**The dogfood gate over `apps/marketing/dist` is filesystem evidence** — the path Movar audits itself on was the one still carrying the defect. Any site audited from a build directory got the pre-#430 behaviour: a relative alternate false-failing `core/hreflang-target-unresolvable`, which is a `fail` published against markup `core/hreflang-target-relative` only _warns_ about, so the catalogue expects it.

`declaredLocator(page, href)` is now the one place that base is decided, and every family reads a declared href through it — the local copy in `inventory-hreflang.ts` that passed `page.url` is gone, and so is the same expression in `switch.ts` and `ua.ts`. A build path is lifted into the **non-special** `movar-build:` scheme, which is the whole of the design: relative resolution folds `..` exactly as a browser does, and the lifted base reports an _empty host_, which `parseLocator` now reads as `null` like any other host-less locator. An `https://` stand-in fabricates an origin the page never claimed, and `locatorOf` reads a page's own location through the same lift — so the synthetic host would land on every page in the build, `sameLocation` would weigh it against the real host each absolute href names, and no absolute alternate would resolve to a collected page at all. That is the dogfood gate's own shape, where every hreflang is absolute and every page is a build path.

`locatorOf` reads a page's own path through that lift too, so both sides of a comparison are percent-encoded by one `URL` parse. Read raw, a page at `/пошук/` spelled its path literally while every declared href spelled it `/%D0%BF…`, and no alternate naming it — relative or absolute — could resolve to it.

The build path is spelled for the lift before it happens. `#` and `?` are percent-encoded, because both end a URL's _path_: `collectFilesystem` takes any `*.html` name, so `a#b.html` and `a#c.html` would each truncate to `/a`, become one locator, and have `ua/state-language-version-lesser` count the pair as a single page. And leading slashes collapse to one, because `movar-build://evil.example/uk/index.html` opens an _authority_ and hands a build page a host it never had — unreachable from `collectFilesystem`, which joins exactly one slash, but it is precisely the fabricated origin the scheme was chosen to prevent, and it must not arrive through the scheme itself.

The resolver is shared, so the verdicts move in three families, in both directions:

- **B** — `core/hreflang-target-unresolvable` passes a relative alternate that resolves, and `core/hreflang-self-missing` stops warning that a page declaring `./` is missing from its own translation set.
- **D** — `core/switch-no-effect` and `core/switch-loses-path` adjudicate a build's relative targets instead of reading `not-applicable` on "no declared target resolved": a switch that serves the source language again is now a `fail`, and one that keeps its path is now the `pass` it was owed.
- **F** — `ua/state-language-version-lesser` joins a build's duplicated version through a relative alternate, so a build at exact 1:1 parity is no longer published as ru 2 / uk 1 with Law 2704-VIII cited on it; and it measures a paired volume deficit that off disk was never compared at all.

One existing test changed rather than being added to: `core/hreflang-target-unresolvable`'s "resolves targets on a filesystem build" declared `href="ru/index.html"` from `/uk/index.html` and expected it at `/ru/` — the site-root reading, which is the defect. A browser reads that href as `/uk/ru/index.html`; the fixture now says `../ru/index.html`, which is what the site meant.

The dogfood gate is unchanged: `apps/marketing` emits absolute hreflang hrefs, has no picker, and no route on it is non-ASCII.

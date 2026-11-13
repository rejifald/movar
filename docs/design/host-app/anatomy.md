# Safari host app — anatomy

Reference: `./reference/*.png` (frozen 2026-11-13) · Canvas:
https://claude.ai/artifact/3BaPSNGDcRk4QZi5mj5pYx (page «Рішення») · Decided: 2026-11-13

The reference images were rendered headlessly from the canvas files, so system fonts fall
back to a serif. Read them for structure, order, grouping and states — the type face is
the platform's own (SF), as everywhere in this app.

## 1. The screen

**Purpose.** The app that ships the Safari Web Extension. It exists to (1) get the
extension switched on, (2) run Movar Audit on a site, (3) change the few settings the
extension has. Users called the three-tab version confusing: it opened on the Detector, a
diagnostic most people never need, and the one thing a new user must do — enable the
extension in Safari — sat at the top of the third tab and vanished once dismissed.

**Who.** Someone who just installed Movar from the App Store (first launch), or comes back
to audit a site or change a setting (returning).

**Data.** `HostState` (platform, iOS version, macOS extension-enabled state), the settings
record via `SettingsStore` (priority, allowlist, content modification, conceal mode), and
`AuditModel` (session-only list of runs, each a `Report` from `@movar/audit-engine`).

**Entry points.** App launch only. The app is one screen («Мовар») with pushed detail
screens (iOS) or a sidebar with a detail pane (macOS).

**Primary viewports.** iPhone 402 pt wide (iPhone 17 Pro); macOS window 940×640 with a
720×480 floor. iPad keeps the iPhone structure with the existing 660 pt column cap.

**Sparsest real data.** First launch: no audits, default priority (uk, en), empty
allowlist, content modification off. On iOS the extension's state is unknowable.

## 2. Decisions

- **One list, no tab bar (iOS).** The root is one navigation stack titled «Мовар». Order:
  Safari setup card (until confirmed) → Audit (URL field + this session's audits) → Мови
  (priority, skipped sites, hide content) → Більше (Мовар у Safari, Про Мовар). — Tabs
  made three peers out of one primary job and two rare ones.
- **The setup card leads until the user confirms, then collapses to a row** («Мовар у
  Safari», under Більше). iOS cannot query extension state (`SFSafariExtensionManager` is
  macOS-only), so the card shows the steps and asks the user to confirm.
- **macOS: the same list becomes a sidebar** (`NavigationView`, two columns, macOS 11
  safe); the detail pane shows what iOS pushes. The segmented `Picker` and `HSplitView`
  go. The status row is real on macOS (extension state + «Відкрити налаштування Safari»)
  and is auto-selected while the extension is off.
- **The Detector is removed from the app**, including the engine's `detect.run`. The
  owner made this call knowing the Detector was the documented App Review 4.2 (minimum
  functionality) remediation; Audit now carries that case alone, and
  `store-assets/apple/REVIEW-NOTES.md` is rewritten in the same change.
- **Report keeps every existing rule** (count not score; coverage on the headline line;
  one card per rule with deduplicated pages; sections by rule family; every all-rules
  row is a disclosure). New: the site is the screen title, share/re-run are rows under
  the headline, and rules that passed collapse into one «Ще N правил пройдено» row per
  family.
- **Settings rows show their current value and push one screen each.** Language priority
  follows the iOS system pattern: numbered «Ваш порядок» with remove + drag, «Додати»
  list underneath (macOS: an «Додати мову» menu). Conceal mode is shown only while hiding
  is on.
- **MovarKit.** Every screen is assembled from `Shared (App)/MovarKit/` — palette roles,
  a per-platform metric ladder, and shared components. Raw `.font(.system(size:))`,
  numeric `.padding`/`.frame`/`spacing`, and `Color(red:…)` are banned outside MovarKit
  by a guard with a shrink-only baseline.
- Rejected: two tabs «Мовар» + «Аудит» (B) — still splits one job; Audit as the whole
  home with a status pill (C) — buries settings; macOS single column with sheets (M2) —
  reintroduces the stranded column `docs/native-shells.md` already fixed.

### Divergences from the reference (all confirmed by the owner 2026-11-13)

- **D1 · Audit in progress.** Artboard: each language row fills in as its answer
  arrives, plus «Скасувати». → Built: progress bar + «N з M запитів», rows show
  «чекаємо…» until the run completes; no Cancel. — The engine reports only a count
  (`audit.progress`), results arrive in one `audit.complete`, and `EngineHost.cancel`
  does not stop the engine. Per-leg results and a real cancel are an engine protocol
  change (out of scope).
- **D2 · Clipboard suggestion.** Artboard: «З буфера · rozetka.com.ua/… · Перевірити».
  → Built: nothing in this PR. — Reading the pasteboard on iOS 16+ raises the system
  paste prompt on every launch; the prompt-free `PasteButton` is iOS 16+ while the app
  ships to 15.4. Follow-up.
- **D3 · Where the Audit options live.** Artboard: the home Audit section shows only the
  field and history. → Built: the field row gets a trailing «Перевірити» button (return
  key also submits); the `ua` law-pack toggle stays as a row under the field; «Що таке
  Мовар Аудит» moves to «Більше»; the «nothing is stored» footer stays under the
  history. — The toggle and footer are existing invariants (opt-in law pack; privacy
  statement next to the list), and an audit needs a visible submit.
- **D4 · «Ще N правил пройдено».** Artboard: a row with a chevron per family. → Built:
  the row scrolls to «Кожне правило та його підсумок» filtered to «пройдено». — Passing
  rules live only in the all-rules list today; a per-family destination would be a new
  screen.
- **D5 · macOS reorder.** Artboard: drag handles on «Ваш порядок». → Built: rows reorder
  by drag (`onMove`) and by the existing context menu; no handle glyph. — macOS lists do
  not draw handles; the context menu is the only reorder path on macOS 11.
- **D6 · Design-token guard.** Foundation board names SwiftLint. → Built: a dependency-free
  node guard `scripts/check-swift-design-tokens.mts` with a shrink-only baseline, in
  `pnpm validate`. — No SwiftLint in the repo, and CI's Xcode job only archives.

### Open (must be empty before dispatch, G1)

None. Copy handling (confirmed 2026-11-13): new strings ship as drafts in both locales;
every new key is listed in the PR body for the owner's sign-off before merge.

## 3. Code archaeology

S = `apps/extension/safari/Movar/Shared (App)/`.

**Navigation**

- `S/MovarRootView.swift:83-160` — iOS `TabView`, macOS segmented `Picker` + `switch`;
  `selection` defaults to `.detector` (L91). Both go.
- `S/PlatformSeams.swift:156-179` — `movarNavigationContainer` is the only place a stack
  is created (iOS `NavigationStack` 16+ / `NavigationView(.stack)`; macOS no-op). It is
  called per tab today (`AuditView.swift:481`, `SettingsView.swift:102`); after the
  change it is called ONCE, at the root.
- `S/PlatformSeams.swift:231-262` — `movarDetailSheet` is the macOS push substitute. In
  the sidebar shell, detail destinations render in the detail column instead; sheets
  remain only for the audit confirm and the add-site form.
- `S/ViewController.swift:285-293` — the 720×480 floor, justified by the Detector split.
  Keep the floor (sidebar + detail needs it); rewrite the comment.

**Setup state**

- `S/ViewController.swift:322-344` — macOS `refreshExtensionState` via
  `SFSafariExtensionManager`, run on load and on `didBecomeActive`. iOS publishes
  `isExtensionEnabled: nil` permanently (L232-237).
- `S/HostState.swift:79-173` — `EnablementBanner`: `.note` (iOS) / `.openSafariSettings`
  (macOS); iOS steps include the «Застосунки» hop on iOS ≥ 18; `nil` banner when macOS
  reports enabled. Render these real steps — the artboard's three lines are sample data.
- `S/SettingsView.swift:75` — dismissal is `@AppStorage("about.setupCardDismissed")`; the
  odd `about.` prefix is deliberate (existing installs). Keep the key. One-way, iOS only.
- `S/HostActions.swift:153-163` — `openSafariPreferences` (macOS), deliberately does not
  quit the app.

**Audit**

- `S/AuditView.swift:29-85` — `AuditActivity` idle/running(done,total)/failed;
  `maxRememberedRuns = 25`; runs in memory only; success opens the report; confirm sheet
  once per session (`acknowledged`); `applyUaPack` default false.
- Every history row must stay removable (swipe on iOS) — privacy invariant in
  `apps/safari-host-app/AGENTS.md`.
- `S/AuditReportView.swift:102-110` — section order verdict → actions → matrix → findings
  → observations → all rules → colophon. Findings hold only fail/warn (L322); passes
  appear only in all rules (L393-407). `core/serving-default-language` gets no card
  (L505, the matrix renders it). Headline and coverage are one panel (L128-153).
- `S/AuditReportView.swift:73-85` — macOS back row exists only for the in-pane swap; in
  the sidebar shell the report is a detail destination and needs no back row.

**Settings**

- `S/SettingsStore.swift:31-87` writes the App Group record directly; `update{}` writes
  the whole record; `HostSettings` carries unknown keys through. Do not route through
  the WebView.
- `S/HostSettings.swift:113, 144-152, 206-233` — default priority `[uk, en]`; `ru`
  locked and never addable; domain normalise → validate → duplicate check.
- `S/SettingsView.swift:135-204` — priority `.onMove/.onDelete`, delete disabled at one
  language, context menu move/remove (the only macOS path).
- `S/SettingsView.swift:476-482` — the add-site primary is deliberately NOT disabled when
  empty (a disabled prominent button is invisible on bar material); validate on press.

**Load-bearing platform traps** (keep when moving code)

- `S/SetupBanner.swift:54-87` — macOS footer `lineLimit(nil)` + vertical padding; U+2060
  WORD JOINER to stop hyphenation; U+202F inside crumbs.
- `S/MovarRootView.swift:173-196` — apply BOTH `.tint` and `.accentColor`.
- `S/PlatformSeams.swift:251-257` — re-apply `.movarTint()` on every sheet.
- `S/PlatformSeams.swift:612-621` — AppKit sheets are not clipped by the window.
- `S/HostState.swift:197-204` — explicit `import Combine` for the SDK 26 build.
- `S/EngineHost.swift:232-257` — engine WebView attached at zero size, or it is
  suspended mid-audit.

**Detector blast radius**

- Swift: `DetectorView.swift`, `DetectorModel.swift`; `MovarRootView` (`HostTab`,
  `detector` model); `ViewController` (`detectorModel`, `refreshDerivedRoster`);
  `HostStrings.swift:46, 51-183`; `detector.*` + `tabs.detector` in both
  `Localizable.strings`; `EngineHost.swift:46` (`detect.result` terminal kind);
  `HostSettings.blocked` (Detector-only reader — remove if no other reader);
  `project.pbxproj` (build files, file refs, group, both Sources phases).
- Engine: `packages/audit-engine/src/{host.ts:16,121-134, protocol.ts:28,209-237,291-307,
detect.ts, index.ts:10-11}`. Keep `@movar/lang-detect` while `settings.ts:25` imports
  its type and `@movar/audit` may bundle it.
- React bundle: `apps/safari-host-app/src/{App.tsx, tabs/DetectorTab*.tsx,
i18n/messages-{en,uk}.ts}`.
- e2e: `apps/e2e/src/offline/safari-host-app.visual.spec.ts` (detector states + header
  counts) and its `safari-host-app-detector-*` PNG baselines.
- `ScreenshotsUITests/ScreenshotTests.swift:85-137` asserts three segmented tabs and
  drives the Detector — rewrite for the sidebar.
- Docs: `apps/extension/store-assets/apple/REVIEW-NOTES.md`, `docs/native-shells.md`,
  `apps/safari-host-app/AGENTS.md`, `apps/e2e/AGENTS.md`, root `AGENTS.md` table row.

**Verification reality**

- CI (`ci.yml` job `safari-archive`) only archives unsigned macOS + iOS builds when
  wrapper paths change; no Swift tests run anywhere. `ScreenshotTests` is the only test
  target (macOS UI, run by hand). Acceptance therefore runs on this machine: simulator
  (iPhone 17 Pro) + the macOS app.

## 4. Component inventory

All new code lives in `S/` (the app target); MovarKit in `S/MovarKit/`. Every new
`.swift` file must be registered in `project.pbxproj` for BOTH app targets.

| Element on artboard                                       | Component                                   | Status                                                      | File                             | Fidelity                                               | Artboards  |
| --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- | -------------------------------- | ------------------------------------------------------ | ---------- |
| Colours by role                                           | `MovarPalette`                              | new                                                         | MovarKit/MovarPalette.swift      | as-drawn                                               | 00         |
| Spacing / control ladder                                  | `MovarMetrics`                              | new                                                         | MovarKit/MovarMetrics.swift      | as-drawn (iOS 32/44/50; macOS 22/28 controls, 36 rows) | 00         |
| Grouped section + footer                                  | `MovarSection`                              | new (wraps SwiftUI `Section`, absorbs the macOS footer fix) | MovarKit/MovarSection.swift      | as-drawn                                               | 01–04      |
| Row: label + value + chevron                              | `MovarRow.nav`                              | new                                                         | MovarKit/MovarRow.swift          | as-drawn                                               | 01, 03, 04 |
| Row: toggle / choice / action / reorder / add             | `MovarRow` variants                         | new                                                         | MovarKit/MovarRow.swift          | as-drawn; reorder → D5 on macOS                        | 01, 02, 03 |
| Numbered steps                                            | `MovarStepList`                             | new                                                         | MovarKit/MovarStepList.swift     | as-drawn                                               | 01, 03     |
| Setup card (iOS) / status row + pane (macOS)              | `MovarStatusCard`                           | new (absorbs `SetupBannerSection`)                          | MovarKit/MovarStatusCard.swift   | as-drawn                                               | 01, 04     |
| Verdict pill (порушено / пройдено / не перевірено dashed) | `MovarVerdictBadge`                         | extend (from the report's existing verdict styling)         | MovarKit/MovarVerdictBadge.swift | as-drawn                                               | 01, 02, 04 |
| Empty state (ghost + line + CTA)                          | `MovarEmptyState`                           | new                                                         | MovarKit/MovarEmptyState.swift   | as-drawn                                               | 01, 03     |
| Primary / secondary button                                | `MovarCallToAction`, `MovarSecondaryAction` | reuse                                                       | PlatformSeams.swift              | as-drawn                                               | 01, 02     |
| Audit field + history + options                           | `AuditHomeSection`                          | extend (from `AuditView` composer)                          | AuditHomeSection.swift           | diverges → D2, D3                                      | 01, 04     |
| Audit running                                             | `AuditProgressView`                         | extend                                                      | AuditView.swift                  | diverges → D1                                          | 02         |
| Report                                                    | `AuditReportView`                           | extend                                                      | AuditReportView.swift            | as-drawn; D4                                           | 02, 04     |
| Home (iOS root)                                           | `HomeView`                                  | new                                                         | HomeView.swift                   | as-drawn                                               | 01         |
| Sidebar shell (macOS)                                     | `MacSidebarShell`                           | new                                                         | MacSidebarShell.swift            | as-drawn                                               | 04         |
| Language priority screen                                  | `LanguagePriorityView`                      | new (from SettingsView)                                     | LanguagePriorityView.swift       | as-drawn; D5                                           | 03, 04     |
| Skipped sites screen                                      | `SkippedSitesView`                          | new (from SettingsView + AddSiteSheet)                      | SkippedSitesView.swift           | as-drawn                                               | 03         |
| Hide content screen                                       | `HideContentView`                           | new (from SettingsView)                                     | HideContentView.swift            | as-drawn                                               | 03         |
| Мовар у Safari help                                       | `SafariHelpView`                            | new                                                         | SafariHelpView.swift             | as-drawn                                               | 03         |
| About                                                     | `AboutView`                                 | reuse                                                       | AboutView.swift                  | as-drawn                                               | —          |
| Token guard                                               | `check-swift-design-tokens`                 | new                                                         | scripts/                         | D6                                                     | —          |

## 5. Components

**MovarPalette** — semantic colours, the only place a colour is named. Roles:
`background` (systemGroupedBackground / macOS windowBackground), `row`
(secondarySystemGroupedBackground / controlBackground), `label`, `secondaryLabel`,
`separator`, `brandFill` (Forest 700 `#15803d`, moved from `MovarBrand.accent`),
`brandText` (`#166534` light / `#86efac` dark — `@movar/theme` `accent-text`),
`brandTint` (brandFill at 12% opacity), `danger` (systemRed), `dangerTint`. Static
`Color` values; dark mode via asset-free dynamic colours (`UIColor { trait in … }` /
`NSColor(name:dynamicProvider:)`). Test: guard script proves no colour literal outside.

**MovarMetrics** — the ladder. `space` 4/8/12/16/20/24/32 (`.xxs…xxl`); control
height iOS `compact 32 / regular 44 / prominent 50`, macOS `compact 22 / regular 28`
with list rows at platform default (36); `cornerCard` = platform list radius (no
override). Type is Dynamic Type roles only (`.largeTitle`, `.title`, `.headline`,
`.body`, `.subheadline`, `.footnote`, `.caption`) — no point sizes.

**MovarSection** — `Section` with header/footer typography; footer gets `lineLimit(nil)`

- the macOS vertical padding and `movarUnhyphenated` (moved from SetupBanner).

**MovarRow** — one row API, variants: `.nav(title, value?)` (chevron = the
NavigationLink's own on iOS; selection highlight in the macOS sidebar), `.toggle(title,
subtitle?, isOn)`, `.choice(title, subtitle?, selected)` (checkmark in `brandText`),
`.action(title)` (`brandText`, semibold), `.reorder(index, title, onRemove)` (red minus

- index in `secondaryLabel`), `.add(title)` (green plus). Min height = control
  `regular`. A11y: the whole row is the hit target; reorder rows expose «Видалити …» and
  move up/down accessibility actions; choice rows announce selected.

**MovarStepList** — numbered steps from `EnablementBanner` steps; number in a
`brandTint` circle with `brandText` digit; body `.subheadline`. VoiceOver reads «Крок N
з M, …».

**MovarStatusCard** — iOS: icon + «Увімкніть Мовар у Safari» + subtitle + steps +
`MovarCallToAction` «Готово, увімкнено» (sets `about.setupCardDismissed`). After
dismissal it is not rendered; «Мовар у Safari» under Більше opens `SafariHelpView`.
macOS: a sidebar row with a dot (`brandFill` enabled / orange `warning` disabled —
add `warning` = systemOrange to the palette) and title «Мовар увімкнений» / «Мовар
вимкнений у Safari»; its detail pane is title + paragraph + prominent «Відкрити
налаштування Safari» (`HostActions.openSafariPreferences`) + footnote. The row is
auto-selected while disabled; it updates on `didBecomeActive`.

**MovarVerdictBadge** — capsule, word + style: fail = `dangerTint`/`danger` text, pass
= `brandTint`/`brandText`, warn = neutral fill + word, not-collected = dashed
`secondaryLabel` stroke, no fill. Never colour alone (existing rule). `.caption`
semibold.

**MovarEmptyState** — a ghost of the real row at 45% opacity (hidden from
accessibility), one `.footnote` line, a secondary CTA.

**AuditHomeSection** — field row (`movarURLField`, placeholder «Адреса сайту», trailing
«Перевірити» compact button, return submits) → `ua` toggle row → history rows
(`host` + relative time, `MovarVerdictBadge` with the broken-promise count, swipe to
remove) → footer «nothing stored» (existing string). Empty: `MovarEmptyState` with
ghost «приклад.ua» and CTA «Перевірити movar.fyi» (runs the normal flow incl. confirm).
macOS: the field + toggle + explainer form is the «Новий аудит» detail; history rows
are sidebar items with the count in `secondaryLabel`.

**AuditProgressView** (D1) — on the report destination while running: site as title,
«Аудит триває…», determinate bar (`done/total`), matrix rows with «чекаємо…», footnote
`audit.runningNote`. Failure → the existing failed state (full-screen error with retry).

**AuditReportView** (extend) — title = host (iOS large title; macOS toolbar title);
order: headline panel → actions rows («Поділитися звітом» = existing export, «Перевірити
знову») → matrix → findings by family, each family ending with «Ще N правил пройдено»
(D4) when N > 0 → observations → all rules → colophon. macOS: share and re-run move to
the toolbar; the in-pane back row is removed.

**LanguagePriorityView** — «Ваш порядок» (`MovarRow.reorder`, delete disabled at one
language) + footer; «Додати» (`MovarRow.add` per `addableLanguages`) + footer «Російська
заблокована завжди…». macOS: «Додати мову» menu button instead of the second list; D5.

**SkippedSitesView** — empty: `MovarEmptyState` (ghost «приклад.ua», CTA «Додати сайт»
→ reveals the field, focused). Non-empty: domain field (`movarDomainField`, submit
validates, error in the footer, primary never disabled) + footnote «Піддомени теж
пропускаються.» + monospaced rows, swipe/context-menu remove.

**HideContentView** — toggle row + footnote; «Як ховати» choice rows (curtain / hide),
shown only while on; stored mode kept while off.

**SafariHelpView** — «Увімкнути» steps (real `EnablementBanner` steps) + «Перевірити,
що працює» steps + footnote that iOS cannot report the state. macOS: not used (the
status pane covers it).

**HomeView** (iOS) — the root list: status card (until dismissed) → Аудит
(`AuditHomeSection`) → Мови (three `.nav` rows with values: priority names joined,
skipped count or «немає», hide mode or «Вимкнено») → Більше («Мовар у Safari» once
dismissed, «Що таке Мовар Аудит», «Про Мовар»). Large title «Мовар».

**MacSidebarShell** (macOS) — `NavigationView { sidebar; detail }`, sidebar 240 pt,
`.listStyle(.sidebar)`; groups: status row → Аудит («Новий аудит» + runs) → Мови →
Більше. Default selection: status when disabled, else «Новий аудит». Detail content
capped by `movarColumnMeasure`. New audit run → selection moves to that run.

**Test contract (all)** — no Swift unit target exists; adding one is out of scope.
Verification: `swiftc -typecheck` per file group, full `xcodebuild` for both schemes,
then the acceptance pass (§6) on the iPhone 17 Pro simulator and the macOS app, every
state above, light + dark. `ScreenshotTests.swift` rewritten for the sidebar (select
«Новий аудит», «Пріоритет мов», «Про Мовар» by accessibility identifier). e2e: remove
the Detector states and baselines.

## 6. Composition

- **iOS** — one `movarNavigationContainer` at the root; inset grouped list; section
  gap = platform default; large title collapses on scroll; pushed screens use inline
  titles via `movarPushedTitle`. iPad: same list under the existing 660 pt cap.
- **macOS** — window 940×640, floor 720×480; sidebar 240 pt fixed min 200; detail form
  content capped by the existing `movarColumnMeasure` (660 pt — the artboard's 560 pt
  was drawn before checking; the shipped cap is the system's value, not a new one) and
  top-leading aligned; the report fills the detail width with its two upper blocks
  (matrix, findings) side by side at ≥ 640 pt detail width, stacked below.
- Between widths: rows truncate values with a trailing ellipsis before wrapping the
  title; history hosts truncate in the middle.

## 7. Out of scope

- Share Extension («Поділитися › Мовар» from Safari) — later, its own Xcode target.
- iPad-specific layout beyond the existing column cap.
- Deleting the React host bundle (`apps/safari-host-app`) — the ADR's own last step;
  only its Detector tab goes here.
- Android / Windows shells.
- Regenerating the App Store host-app screenshots (`08-host-app-about`,
  `09-host-app-setup`) — the capture pipeline is updated only as far as the UI test
  needs to keep passing.
- Per-leg audit progress and a real audit cancel (engine protocol change, D1).
- Clipboard URL suggestion (D2).
- Copy sign-off: new strings ship as drafts in both locales and are listed in the PR for
  the owner's review (see §2 open items).

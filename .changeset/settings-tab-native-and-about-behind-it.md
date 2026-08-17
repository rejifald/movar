---
'@movar/extension': minor
'@movar/safari-host-app': minor
---

Rebuild the Safari host app's Settings tab in SwiftUI, and move About behind it. The tab bar goes from four tabs to three.

Settings was the last web form pretending to be an app screen, and it had the same defect the About tab had before it: a `List` with no navigation bar has nothing to draw the scroll-edge material, so rows passed under the clock and the Dynamic Island at full contrast. It is now a stock grouped list with a real bar. Everything it hand-rolled has a stock counterpart doing the same job better — `↑ ↓ ×` typed as literal text glyphs become drag-to-reorder, swipe-to-delete and a row context menu; the `h3` headings sized off a web type ramp become section headers; the two grey "how it works" cards become the section footers they always wanted to be. The priority list is modelled on Settings ▸ General ▸ Language & Region, which is the same list with the same semantics.

About is no longer a tab. Apple's tab-bar guidance weighs a tab against "the need for people to frequently access each section", and an About screen is a once-ever destination; across eighteen sampled iOS apps, not one carried About as a peer tab and every About screen was a push from Settings. So About keeps the screen it was rebuilt into last release and loses only the slot: it is the last row of Settings, pushed on iOS and presented as a sheet on macOS, where `NavigationView` is a split view and there is no stack to push onto.

The enablement banner moved the other way, from About to the top of Settings. It is the one task standing between someone and a working install, and Settings is where you look when Movar is doing nothing — leaving it one push deep under "Legal" would have been the only real regression the merge could have caused.

**The "Movar enabled" master switch is gone**, from the native screen and from the web panel behind it. Safari's own extension settings are the system-provided version of that control, and an app is not supposed to ship a redundant copy of a systemwide setting — least of all two sections below a card that teaches you where the real one is. No other browser's Movar had one: the extension's only live writer of that flag is the popup's off-state hero, which only ever turns it back on, which is also why removing it strands nobody.

Two things did not have to cross into Swift. The native screen edits four keys of the stored settings object and passes the rest through untouched, so a field a newer extension added still survives a host write; and the block list stays derived on the web side, so the policy table behind it needs no Swift twin. The Ukrainian accusative-endonym table behind "Видалити українську" is not needed either — a context menu is already scoped to its row, so the verb stands alone.

Both schemes build clean under Xcode 26.3, and the screen was exercised on an iPhone 17 Pro simulator: reorder, add and remove a language, the conceal-mode picker, domain normalisation (`https://WWW.Example.COM/path` → `example.com`), the push to About, and the setup banner's dismissal.

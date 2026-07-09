---
'@movar/extension': patch
---

Fix the macOS wrapper app opening at a too-small, non-resizable window.

The Safari host app's macOS window used the stock Apple extension-template geometry — a fixed 425×350 content rect with a `titled + closable` style mask — so the three-tab host UI (fixed top brand bar, scrolling Settings panel, fixed bottom tab bar) was clipped, and the window could be neither resized nor minimised. Enlarge the default to 480×700 and add `resizable` + `miniaturizable` to the window style mask in `Main.storyboard`; pin `contentMinSize` to 380×480 in `ViewController.viewWillAppear()` so a resize can't shrink it below usability. macOS-only (`#if os(macOS)`); iOS is unaffected. The window keeps `restorable="NO"` with no frame-autosave, so it opens at the new size on every launch.

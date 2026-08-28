---
'@movar/extension': patch
---

Measure the iPad's column, instead of running the phone layout at 1032pt.

#551 gave macOS its own layout and said so in its own title; iPad was left out of both, and it is the surface where the omission showed worst. The seam that decides this — `movarFormMeasure`, now `movarColumnMeasure` — was written as a phone/desktop branch whose iOS half was a bare `self`, on the reading that "on iOS the list is the screen". That is true of a phone and false of every iPad: rows ran edge to edge across 1032pt in portrait, the "Hide content in blocked languages" toggle sat a full screen-width from the label naming it, the Detector's explainer paragraph gained about eleven words per line over anything it was written for, and the call to action was a 1380pt green slab pinned across the bottom.

**It is now stated as a `maxWidth`, not as an idiom test.** 660pt, which is within a few points of what UIKit's own `readableContentGuide` resolves to on a 1024pt iPad — the platform's answer rather than a taste, and the reason macOS did not need a second number. Saying it as a ceiling rather than as `if iPad` is what makes it correct at every size class _including the ones multitasking invents at runtime_: at 402pt (phone) or 320pt (Slide Over) a 660pt cap is already a no-op, so no view has to ask what device it is on, and none has to watch for a size-class change. iPhone output is provably untouched — a pixel diff of the Settings screen before and after differs only in the status-bar clock, 1610 of 3.8M pixels, all of them in rows 78–117.

Applied to the five iOS surfaces that are a whole screen: the Detector and Audit composers, the audit report (the longest read in the app), Settings, and About. About takes it at the `NavigationLink` DESTINATION rather than inside `AboutView`, because the measure is a fact about where the screen is being shown — pushed on iOS it owns an iPad, while macOS hands the same view to a sheet that is already sized.

Two things came with it that a width cap alone would have got wrong:

- **The background.** A `List` paints its grouped fill inside its own frame, so a capped list on its own leaves a white gutter down both sides of a grey column — worse than the stretched layout it replaces. The fill is painted behind the full width and the column sits on it, which is the relationship the macOS branch already gets from the window. Verified in dark mode too, where the gutter would have been the more obvious failure.
- **The action bar is two things, not one.** Its material and hairline are chrome and have to reach both edges of the surface; the button is content, and content that does not line up with the column it acts on reads as belonging to a different screen. Only the actions are capped. iOS only — the macOS surfaces using this bar are sheets and split panes, both already narrower than the cap and both measured by hand in #552.

The Detector's pre-run emptiness is not a defect and is left alone: a form flows from the top, and running a detection fills the column to roughly 85% of an iPad's height.

macOS is unchanged — `movarColumnMeasure`'s macOS branch is `movarFormMeasure`'s verbatim, and the bar's cap is behind `#if os(iOS)`. Both schemes rebuilt; the iPad screenshots in `store-assets/screenshots/ipad/` are re-shot against the fixed layout.

---
'@movar/extension': minor
---

Rebuild the Safari host app's About tab around identity and links, and give it the navigation bar it was missing.

The screen scrolled its rows under the status bar at full contrast, because a `List` sitting directly in a `TabView` has no navigation bar and therefore nothing to draw the scroll-edge material. It now has one, inline-titled so it does not compete with the lockup.

What the tab says changed more than how it looks. It used to carry a four-line summary and three capability rows explaining what Movar does — store-listing copy, read by someone who had already installed from that listing — and a row of trust claims that were not tappable. Both are gone. In their place are the things the tab could not previously reach: the privacy policy, Movar's own MIT licence, the dependency licence notices required by the 41 MIT/ISC packages the extension bundles, and an App Store review link. Every claim that survived is now a link to the document that proves it.

The rest is grouping and repair. Rows are sorted into App / Support / Legal; the version and the changelog became one row rather than a masthead line and a separate link; footer rows are label-coloured instead of tinted, with an external-link mark rather than a chevron; and the "one last step" card is a single row instead of five, so `List` stops drawing separators through the middle of one message. The card now hides itself — off `SFSafariExtensionManager` on macOS, and off an explicit "I've done this" control on iOS, which has no API to know.

Ukrainian body copy no longer hyphenates mid-word. SwiftUI hyphenates tight paragraphs on its own and ignores a bridged `NSParagraphStyle`, so the words are joined with U+2060; the web original this screen was ported from has never hyphenated.

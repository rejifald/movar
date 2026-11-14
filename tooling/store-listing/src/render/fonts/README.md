# Fonts for the listing renderer

`fixel-display-800.otf` is Fixel Display ExtraBold (800), the same Latin + Cyrillic
subset shipped in `packages/fonts/files/fixel-display-800.woff2`. Satori cannot parse
WOFF2, so the woff2 was decoded once, losslessly, to its plain SFNT (CFF outlines,
hence `.otf`) with `wawoff2`; no glyph was changed.

Fixel is by MacPaw, licensed under the SIL Open Font License 1.1 — see
`packages/fonts/OFL.txt`. The renderer loads fonts only from local files.

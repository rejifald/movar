# Marketing screenshots

Drop PNG files here. The marketing site references them by exact filename.

| Filename                   | What it shows                                                        | Aspect | Approx. dimensions |
| -------------------------- | -------------------------------------------------------------------- | ------ | ------------------ |
| `google-without-movar.png` | Cyrillic query on google.com.ua, Russian-language results dominating | 16:10  | 1280×800           |
| `google-with-movar.png`    | Same query, Ukrainian-language results                               | 16:10  | 1280×800           |
| `popup.png`                | Extension popup open on a real page                                  | 4:3    | 480×360            |
| `options.png`              | Extension options page with edited priority list                     | 16:10  | 1280×800           |

The `BeforeAfter.astro` component will render placeholder cards until
`google-without-movar.png` and `google-with-movar.png` exist at this path.

For store-listing screenshots (Chrome Web Store, Edge, AMO), see
`apps/extension/store-assets/` (ticket #9).

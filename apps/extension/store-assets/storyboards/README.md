# Storyboards

Static HTML mock-ups used as backdrops for the store-listing screenshots in
[`../shared/`](../shared/). Each file renders a fictitious website at
1280×800 with the real Movar popup composited over it (via iframe to the
`extension-popup-preview` server on port 4322) where the scenario needs it.

Five files, mapping to the four screenshot scenarios in
[`../REQUIREMENTS.md`](../REQUIREMENTS.md) §5:

| File               | Screenshot | What's on the page                                                                                                    | Popup overlay?                    |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `news.html`        | #1         | Fictitious UA news article — _Світанок_                                                                               | yes                               |
| `site-before.html` | #2 (left)  | Fictitious services site — _Tochka24_ — in Russian                                                                    | no                                |
| `site-after.html`  | #2 (right) | Same site in Ukrainian                                                                                                | yes (counter ticking)             |
| `picker.html`      | #3         | Fictitious settings page — _Kolesnyk_ — with the language picker open; the Russian entry is dimmed with a "Movar" tag | no — the picker is the foreground |
| `serp.html`        | #4         | Fictitious search engine — _Vector_ — with `?hl=uk` in the URL bar and Ukrainian results                              | no — the SERP is the foreground   |

All four brands (Світанок, Tochka24, Kolesnyk, Vector) are invented; the
URLs use the IANA-reserved `.example` TLD.

## Capture workflow

1. **Start two preview servers** (or use the `storyboards` and
   `extension-popup-preview` launch.json entries):

   ```sh
   pnpm --filter @movar/extension preview:popup        # popup → localhost:4322
   pnpm --filter @movar/extension preview:storyboards  # storyboards → localhost:4324
   ```

2. **Open each storyboard at exactly 1280×800** in Chrome. Empty profile,
   no toolbar extensions visible:

   ```sh
   open -na "Google Chrome" --args --new-window \
     --window-size=1280,800 --window-position=0,0 \
     "http://localhost:4324/news.html"
   ```

3. **Capture** with `Cmd-Shift-4` → `Space` → click window. Save to
   `../shared/01-popup.png`, `../shared/02-correction-applied.png`,
   `../shared/03-picker-survivor.png`, `../shared/04-search-rewrite.png`.

4. **Stitch the before/after shot**. Capture `site-before.html` and
   `site-after.html` separately, then composite side-by-side:

   ```sh
   pnpm dlx sharp-cli composite shared/_before.png shared/_after.png \
     --gravity east > shared/02-correction-applied.png
   ```

   Or open both in Preview.app and use Tools → Adjust Size to splice.

## Synthetic guard rails (from REQUIREMENTS.md §5)

- No third-party brand logos
- No fake URLs that look like real domains
- Each backdrop has its own typography + palette (per the "generic neutral
  design" decision in §7.4)
- The popup is captured from the actual built extension, never redrawn

## Popup state for capture

The preview build seeds the popup with the default `MovarSettings` from
[`packages/shared/src/index.ts`](../../../../packages/shared/src/index.ts).
To show non-default state (paused, counter at a specific value, hidden
language list populated) you'll need to either edit the preview seed or
mock chrome.storage in the preview entry. Tracked as a follow-up — for
v1, default state is fine for shot #1; the counter value in shot #2 can
be edited in the popup PNG before saving if needed.

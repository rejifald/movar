# Store-listing assets

PNG screenshots and promotional artwork for the Chrome Web Store, Edge Add-ons,
and Firefox AMO submissions. This folder is the source of truth for what
ships to each marketplace.

## Layout

```
store-assets/
  shared/          # PNGs that work across every store
    01-popup.png
    02-options.png
    03-correction-applied.png
    04-marketing-hero.png
    05-popup-hidden-panel.png        # optional
  chrome/          # Chrome-only extras
    promo-tile-440x280.png
  edge/            # Edge-only extras (often none — uses Chrome shots)
  firefox/         # Firefox-only extras (often none — uses Chrome shots)
```

## Required shots

Numbered to match the upload order in the Chrome Web Store dashboard.

| #   | File                        | Size     | Aspect | What it shows                                                                                                                |
| --- | --------------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `01-popup.png`              | 1280×800 | 16:10  | Popup open on a real page (e.g. google.com.ua results), Status header + Pause controls                                       |
| 2   | `02-options.png`            | 1280×800 | 16:10  | Options page with a non-default priority list (e.g. uk → en → de), one exempt site set                                       |
| 3   | `03-correction-applied.png` | 1280×800 | 16:10  | Browser window after Movar switched a UA site from its RU default — popup open showing today's correction counter ticking    |
| 4   | `04-marketing-hero.png`     | 1280×800 | 16:10  | Top-of-fold screenshot of https://movar.fyi/ — frames the project rather than the UI                                         |
| 5   | `05-popup-hidden-panel.png` | 1280×800 | 16:10  | Optional. Popup with HiddenPanel visible (requires `contentModification: true` + a site whose picker has blocked-lang items) |

### Chrome-specific

| File                            | Size    | What it shows                                             |
| ------------------------------- | ------- | --------------------------------------------------------- |
| `chrome/promo-tile-440x280.png` | 440×280 | Optional small promo tile shown on the store listing card |

## Capture recipe

1. **Build a fresh extension.** From the repo root:

   ```sh
   pnpm --filter @movar/extension build
   ```

   Output lands at `apps/extension/.output/chrome-mv3/`.

2. **Load it into Chrome.**
   - `chrome://extensions` → toggle Developer mode → Load unpacked → pick `apps/extension/.output/chrome-mv3/`.
   - Pin Movar to the toolbar so the popup is one click away.

3. **Set up a clean profile / window.** Empty bookmarks bar, no other extensions visible, a clean wallpaper. Use a 1280×800 window — Chrome's built-in window-size shortcut on macOS:

   ```sh
   osascript -e 'tell application "Google Chrome" to set bounds of front window to {0, 0, 1280, 800}'
   ```

4. **Capture each shot.**
   - macOS: `Cmd-Shift-4` then `Space` then click the window to grab a window-bounded PNG (drop shadow disabled with `defaults write com.apple.screencapture disable-shadow true; killall SystemUIServer`).
   - Save to `apps/extension/store-assets/shared/<filename>` per the table above.

5. **Verify dimensions.** Chrome Web Store accepts 1280×800 or 640×400. If a shot is slightly off (e.g. retina pixel-density), resize:

   ```sh
   pnpm dlx sharp-cli -i 01-popup.png -o 01-popup.png resize 1280 800
   ```

   (Or use Preview's Tools → Adjust Size.)

6. **Edit any privacy leaks.** Blur user-visible URLs that aren't part of the demo (your bookmarks bar, other tabs' favicons, etc.).

## Verification claims to keep honest

Per `deployment-checklist.md`, every shot must reflect functionality the
extension actually delivers as of the listing version. If you screenshot the
options page with a feature that didn't ship, the reviewer will flag it.

When ready to submit, copy:

- `shared/*.png` to all three stores' upload UIs
- `chrome/promo-tile-440x280.png` to the Chrome dashboard only

The screenshots referenced from the marketing site live in
`apps/marketing/public/screenshots/` and have a separate, smaller spec — see
that folder's README.

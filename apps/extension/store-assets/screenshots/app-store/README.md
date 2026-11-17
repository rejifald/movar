# App Store screenshots

The screenshots the App Store listing shows, one folder per display and locale:

```text
app-store/<display>/<locale>/NN-name.png
```

- **Produced by** [`tooling/store-listing`](../../../../../tooling/store-listing/)
  (`pnpm --filter @movar/store-listing frame`). **Never hand-edit** a PNG here:
  regenerate it.
- **Uploaded by** [`scripts/apple-submit.mjs`](../../../../../scripts/apple-submit.mjs)
  during the release job. For every localization of an editable version it replaces
  the set for each display folder present, in filename order, and leaves a set that
  already matches alone. `SCREENSHOTS=0` skips it.
- `<locale>` is a language subtag: `uk`, `en`. App Store Connect's `en-US` and
  `en-GB` both take `en`.
- A display folder that doesn't exist is skipped; an unknown folder name, a PNG of the
  wrong size, or more than 10 files in one folder fails the run before anything is
  written.

| Folder       | `screenshotDisplayType` | Platform | Accepted sizes (px, either orientation)  |
| ------------ | ----------------------- | -------- | ---------------------------------------- |
| `iphone-6.9` | `APP_IPHONE_67`         | iOS      | 1320×2868, 1290×2796, 1260×2736          |
| `ipad-13`    | `APP_IPAD_PRO_3GEN_129` | iOS      | 2064×2752, 2048×2732                     |
| `mac`        | `APP_DESKTOP`           | macOS    | 1280×800, 1440×900, 2560×1600, 2880×1800 |

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Opt-in via the `dev:firefox:installed` script: launches Firefox against a
// persistent profile under `.firefox-profile/` so storage, toolbar pin, and
// about:addons state survive between dev runs (mimics a real install).
const persistFirefoxProfile = process.env['MOVAR_FIREFOX_PERSIST'] === '1';
const firefoxProfileDir = path.resolve(import.meta.dirname, '.firefox-profile');
if (persistFirefoxProfile) {
  // web-ext requires the path to exist as a directory; otherwise it falls back
  // to treating it as a named profile and errors with "cannot be resolved to a
  // profile path". An empty dir is enough — FirefoxProfile populates it.
  mkdirSync(firefoxProfileDir, { recursive: true });
}

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react'],
  ...(persistFirefoxProfile && {
    webExt: {
      firefoxProfile: firefoxProfileDir,
      keepProfileChanges: true,
    },
  }),
  // Force MV3 on every target (WXT defaults Firefox to MV2 otherwise).
  // Drops Firefox < 109 (Jan 2023); the realistic AMO audience is well past that.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'declarativeNetRequest', 'alarms', 'tabs'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    // Firefox-only: stable add-on identity for AMO + self-hosted updates,
    // plus the explicit floor matching the MV3 decision above.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'movar@movar.fyi',
          strict_min_version: '109.0',
        },
      },
    }),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});

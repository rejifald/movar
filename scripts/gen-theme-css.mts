#!/usr/bin/env node
/**
 * Generate (or verify) `@movar/theme`'s CSS from its typed token source.
 *
 *   pnpm gen:theme                              # (re)write the generated stylesheets
 *   tsx scripts/gen-theme-css.mts --check       # exit 1 if any generated file would change
 *
 * `packages/theme/src/tokens.ts` is the single source of truth; the three CSS
 * files under `packages/theme/styles/` are build artifacts committed for
 * consumer ergonomics (apps `@import` them directly — no build step needed at
 * dev time). This script keeps them in sync; `--check` is wired into
 * `pnpm validate` so committed CSS can never drift from the tokens.
 *
 * Same pattern as `gen-readme-metrics.mts`: a committed generated artifact with
 * a tool-free parity guard.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderTokensCss, renderHostCss, renderThemeCss } from '../packages/theme/src/render';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = resolve(repoRoot, 'packages/theme/styles');

const outputs = [
  { file: resolve(stylesDir, 'tokens.css'), render: renderTokensCss },
  { file: resolve(stylesDir, 'tokens.host.css'), render: renderHostCss },
  { file: resolve(stylesDir, 'theme.css'), render: renderThemeCss },
] as const;

const check = process.argv.includes('--check');

let drifted = false;
for (const { file, render } of outputs) {
  const next = render();
  const rel = file.slice(repoRoot.length + 1);
  if (check) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== next) {
      drifted = true;
      console.error(`✗ ${rel} is out of date — run \`pnpm gen:theme\``);
    }
  } else {
    writeFileSync(file, next);
    console.log(`✓ wrote ${rel}`);
  }
}

if (check && drifted) process.exit(1);
if (check) console.log('✓ @movar/theme CSS is in sync with src/tokens.ts');

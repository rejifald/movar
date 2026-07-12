#!/usr/bin/env node
/**
 * Generate `@movar/theme`'s CSS from its typed token source.
 *
 *   pnpm gen:theme    # (re)create packages/theme/styles/*.css
 *
 * `packages/theme/src/tokens.ts` is the single source of truth; this writes one
 * stylesheet per token set into `packages/theme/styles/` (git-ignored — a build
 * artifact, not source). Wired into the root `prepare` (so a fresh `pnpm install`
 * materialises them for dev servers) and the `build` script (so every build is
 * fresh). Consumers `@import '@movar/theme/<set>.css'` for the sets they use.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderColorCss,
  renderTypographyCss,
  renderShadowCss,
  renderSpaceCss,
  renderRadiusCss,
  renderSizeCss,
  renderBreakpointCss,
} from '../packages/theme/src/render';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = resolve(repoRoot, 'packages/theme/styles');

const outputs = [
  { file: 'color.css', render: renderColorCss },
  { file: 'typography.css', render: renderTypographyCss },
  { file: 'shadow.css', render: renderShadowCss },
  { file: 'space.css', render: renderSpaceCss },
  { file: 'radius.css', render: renderRadiusCss },
  { file: 'size.css', render: renderSizeCss },
  { file: 'breakpoint.css', render: renderBreakpointCss },
] as const;

mkdirSync(stylesDir, { recursive: true });
for (const { file, render } of outputs) {
  writeFileSync(resolve(stylesDir, file), render());
}
console.log(`✓ generated ${outputs.length} stylesheets in packages/theme/styles/`);

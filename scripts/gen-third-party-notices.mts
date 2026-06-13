#!/usr/bin/env node
/**
 * Generate `apps/extension/THIRD-PARTY-NOTICES.md` from the extension's bundled
 * third-party runtime dependencies.
 *
 * Why this exists: WXT bundles third-party runtime code into the shipped
 * artifact, and that code carries attribution duties the repo's own `LICENSE`
 * does not cover. Two closures ship: (1) the background worker statically
 * imports `franc` (via `@movar/lang-detect/franc`), pulling in franc's runtime +
 * dependency closure (trigram-utils → n-gram + collapse-white-space, all MIT)
 * for on-device language detection; and (2) the popup/options UI bundles a React
 * runtime (react, react-dom, scheduler — MIT), the Lucide icon set (lucide,
 * lucide-react — ISC), and two web fonts (@fontsource/manrope,
 * @fontsource/ibm-plex-mono — OFL-1.1, which ships the actual font binaries).
 * MIT and ISC require the copyright-and-permission notice to travel "in all
 * copies or substantial portions of the Software"; OFL-1.1 adds reserved-font-
 * name and same-name-redistribution clauses. The repo's own `LICENSE` covers
 * Movar's code, not its dependencies — so without this file the shipped package
 * is out of compliance with the terms of the code it bundles, and store
 * reviewers do spot-check attribution.
 *
 * The list is GENERATED, never hand-maintained: it walks a fixed set of bundled
 * runtime roots, resolves each (and its transitive `dependencies`) against the
 * installed packages, and reads each package's license text + manifest. If a
 * bundled dep is added or removed, regenerate and the file follows. Run:
 *
 *   pnpm tsx scripts/gen-third-party-notices.mts          # write the file
 *   pnpm tsx scripts/gen-third-party-notices.mts --check  # fail if stale (CI)
 *
 * The generated file is copied into the build via WXT's `publicDir`
 * (`apps/extension/src/public/`), so it lands at the root of
 * `apps/extension/.output/<target>/`. We emit to BOTH the package root (a
 * human-facing pointer alongside `LICENSE`) and `src/public/` (the shipped
 * copy) from a single render so the two never drift.
 *
 * Note: some packages ship no license file in their published tarball (franc,
 * for instance — only its `readme.md` carries the `## License` line). For those
 * we synthesize the canonical text from the declared `license` field + its
 * copyright/author, but only for license families whose wording is fixed (MIT,
 * ISC). OFL-1.1 carries substantive, package-specific terms (reserved-font-name
 * + redistribution clauses) and is reproduced verbatim from the package's
 * shipped license file — never synthesized — see `licenseTextFor`.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/**
 * Roots of the bundled third-party closure this file attributes. Two groups,
 * each resolved against the package that declares it (see `resolvePackageDir`):
 *
 *   • Background service worker — `franc` and its transitive `dependencies`
 *     (trigram-utils → n-gram + collapse-white-space, all MIT), bundled for
 *     on-device language detection.
 *   • Popup/options UI — the React runtime (`react`, `react-dom`, which pulls in
 *     `scheduler`, all MIT), the Lucide icon set (`lucide`, `lucide-react`, both
 *     ISC), and the two bundled web fonts (`@fontsource/manrope`,
 *     `@fontsource/ibm-plex-mono`, both OFL-1.1).
 *
 * The closure walk picks up transitive `dependencies` automatically, so naming a
 * root is enough (e.g. `scheduler` arrives via `react-dom`). `licenseTextFor`
 * handles the MIT/ISC/OFL-1.1 families these span: MIT and ISC may be
 * synthesized from the declared license + copyright when a package ships no
 * file, but OFL-1.1 (reserved-font-name + redistribution clauses) is only ever
 * reproduced verbatim from the font package's own license file.
 *
 * Build/test-only tooling (vitest, wxt, storybook, react devtools, …) is never
 * shipped and carries no attribution duty, so it stays out of this list.
 */
const BUNDLED_ROOTS = [
  // Background service worker: on-device language detection (all MIT).
  'franc',
  // Popup/options UI: React runtime (MIT) + Lucide icons (ISC) + web fonts (OFL-1.1).
  'react',
  'react-dom',
  'lucide',
  'lucide-react',
  '@fontsource/manrope',
  '@fontsource/ibm-plex-mono',
] as const;

interface PackageManifest {
  name: string;
  version: string;
  license?: string;
  author?: string | { name?: string; email?: string; url?: string };
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
}

interface ResolvedPackage {
  manifest: PackageManifest;
  dir: string;
}

/** Locate an installed package's directory by resolving its `package.json`. We
 *  resolve relative to the packages that declare the roots — the extension
 *  package (react, lucide, @fontsource/*) and the lang-detect package (`franc`)
 *  — so pnpm's strict, non-hoisted layout finds the right copy of each. The
 *  script's own `require` is the final fallback for transitively-hoisted deps. */
function resolvePackageDir(name: string): string {
  const fromExtension = createRequire(path.resolve(repoRoot, 'apps/extension/package.json'));
  const fromLangDetect = createRequire(path.resolve(repoRoot, 'packages/lang-detect/package.json'));
  const tryResolvers = [fromExtension, fromLangDetect, require];
  for (const resolver of tryResolvers) {
    try {
      return path.dirname(resolver.resolve(`${name}/package.json`));
    } catch {
      // try the next resolver
    }
  }
  throw new Error(
    `Cannot resolve bundled dependency "${name}". Is it installed? ` +
      `(looked from apps/extension, packages/lang-detect and ${repoRoot})`,
  );
}

function readManifest(dir: string): PackageManifest {
  return JSON.parse(readFileSync(path.resolve(dir, 'package.json'), 'utf8')) as PackageManifest;
}

/** Walk the bundled roots + their transitive `dependencies`, de-duplicating by
 *  `name@version`. Sorted by name for a stable, diffable output. */
function collectClosure(roots: readonly string[]): ResolvedPackage[] {
  const seen = new Map<string, ResolvedPackage>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined) continue;
    const dir = resolvePackageDir(name);
    const manifest = readManifest(dir);
    const key = `${manifest.name}@${manifest.version}`;
    if (seen.has(key)) continue;
    seen.set(key, { manifest, dir });
    for (const dep of Object.keys(manifest.dependencies ?? {})) queue.push(dep);
  }
  return [...seen.values()].toSorted((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

const LICENSE_FILE_NAMES = [
  'license',
  'LICENSE',
  'license.md',
  'LICENSE.md',
  'license.txt',
  'LICENSE.txt',
  // OFL fonts most often ship `LICENSE`, but some name it `OFL.txt`/`OFL`.
  'OFL.txt',
  'ofl.txt',
  'OFL',
];

/** The verbatim license file from the package, if it shipped one. */
function readLicenseFile(dir: string): string | null {
  const present = new Set(readdirSync(dir));
  for (const candidate of LICENSE_FILE_NAMES) {
    if (present.has(candidate)) return readFileSync(path.resolve(dir, candidate), 'utf8').trim();
  }
  return null;
}

function authorString(author: PackageManifest['author']): string {
  if (!author) return '';
  if (typeof author === 'string') return author.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return [author.name, author.email && `<${author.email}>`].filter(Boolean).join(' ').trim();
}

/** Canonical MIT text, used when a package declares MIT but ships no license
 *  file (franc's case — its license lives only in readme.md). The caller passes
 *  an already-resolved copyright holder (falling back to a generic credit when
 *  the manifest names no author). */
function canonicalMit(copyrightHolder: string): string {
  return `MIT License

Copyright (c) ${copyrightHolder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}

/** Canonical ISC text, used when a package declares ISC but ships no license
 *  file. ISC's wording is fixed (the OpenBSD-style permissive license), so
 *  synthesizing it from the declared copyright holder is faithful — the same
 *  approach as `canonicalMit`. In practice lucide/lucide-react DO ship a LICENSE
 *  file (reproduced verbatim above), so this is the safety net for a future ISC
 *  dependency that ships none. */
function canonicalIsc(copyrightHolder: string): string {
  return `ISC License

Copyright (c) ${copyrightHolder}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;
}

/** License text for one package: the shipped file verbatim if present, else the
 *  canonical text for its declared SPDX id. We synthesize only license families
 *  whose wording is fixed and short — MIT and ISC. OFL-1.1 carries substantive,
 *  package-specific terms (reserved-font-name + same-name-redistribution
 *  clauses) that must be reproduced verbatim and never synthesized, so an OFL
 *  package missing its license file is a hard error — as is any unhandled
 *  license family, so we assert loudly rather than silently under-attribute. */
function licenseTextFor(pkg: ResolvedPackage): string {
  const fileText = readLicenseFile(pkg.dir);
  if (fileText) return fileText;
  const spdx = pkg.manifest.license ?? '';
  const holder = authorString(pkg.manifest.author) || 'the package authors';
  if (spdx === 'MIT') return canonicalMit(holder);
  if (spdx === 'ISC') return canonicalIsc(holder);
  throw new Error(
    `Bundled dependency ${pkg.manifest.name}@${pkg.manifest.version} declares license ` +
      `"${spdx}" and ships no license file. ` +
      (spdx === 'OFL-1.1'
        ? `OFL-1.1 carries reserved-font-name and redistribution clauses that must be ` +
          `reproduced verbatim from the package's own LICENSE/OFL.txt — it is never ` +
          `synthesized, and this font package appears to be missing its license file.`
        : `Add explicit handling in scripts/gen-third-party-notices.mts before shipping it.`),
  );
}

function repoUrl(repository: PackageManifest['repository']): string {
  if (!repository) return '';
  const raw = (typeof repository === 'string' ? repository : (repository.url ?? ''))
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
  if (!raw) return '';
  // npm allows a bare `owner/repo` shorthand for GitHub; expand it to a real URL.
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw}`;
  return raw;
}

export interface RenderedNotices {
  text: string;
  /** `name@version` of every package rendered, in output order. */
  packages: string[];
}

export function generateNotices(): RenderedNotices {
  const closure = collectClosure(BUNDLED_ROOTS);
  const header = `# Third-party notices

<!-- GENERATED FILE — do not edit by hand.
     Produced by \`pnpm tsx scripts/gen-third-party-notices.mts\` from the
     extension's bundled runtime dependency closure. Re-run after adding or
     removing a bundled dependency; \`--check\` mode (used in CI) fails if this
     file is stale. -->

Movar ships its own MIT-licensed code (see [\`LICENSE\`](./LICENSE)). The shipped
extension additionally bundles the third-party packages listed below: the
background service worker bundles a language-detection closure (franc and its
dependencies), and the popup/options UI bundles a React runtime, the Lucide icon
set, and two web fonts. Each is reproduced here under the terms of its license;
the notices travel with the shipped artifact (this file is copied into
\`apps/extension/.output/<target>/\` via WXT's \`publicDir\`).

> Scope: this file covers the full third-party runtime closure bundled into the
> shipped artifact — the franc language-detection closure in the background
> worker (MIT) plus the popup/options UI dependencies: react + react-dom (and
> their \`scheduler\` dependency), all MIT; lucide + lucide-react (ISC); and the
> @fontsource fonts (OFL-1.1, whose reserved-font-name and redistribution terms
> are reproduced verbatim from each package's shipped license file). Build- and
> test-only tooling is never shipped and carries no attribution duty. See the
> scope note in \`scripts/gen-third-party-notices.mts\`.

`;

  const blocks = closure.map((pkg) => {
    const { name, version, license } = pkg.manifest;
    const url = repoUrl(pkg.manifest.repository);
    const heading = url ? `## ${name}@${version} ([source](${url}))` : `## ${name}@${version}`;
    const licenseLine = license ? `\n_License: ${license}_\n` : '\n';
    return `${heading}\n${licenseLine}\n\`\`\`\n${licenseTextFor(pkg)}\n\`\`\`\n`;
  });

  return {
    text: `${header}${blocks.join('\n')}`,
    packages: closure.map((p) => `${p.manifest.name}@${p.manifest.version}`),
  };
}

/** Where the rendered notices are written. The package-root copy sits next to
 *  `LICENSE` as the canonical reference; the `src/public/` copy is what WXT
 *  copies into the build output. Both are written from the same render. */
export const NOTICE_TARGETS = [
  'apps/extension/THIRD-PARTY-NOTICES.md',
  'apps/extension/src/public/THIRD-PARTY-NOTICES.md',
] as const;

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const { text, packages } = generateNotices();
  const stale: string[] = [];
  for (const rel of NOTICE_TARGETS) {
    const abs = path.resolve(repoRoot, rel);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    if (current === text) continue;
    if (checkOnly) {
      stale.push(rel);
    } else {
      writeFileSync(abs, text);
    }
  }
  if (checkOnly) {
    if (stale.length > 0) {
      console.error(
        `✗ THIRD-PARTY-NOTICES is stale:\n${stale.map((s) => `    ${s}`).join('\n')}\n` +
          `  Run \`pnpm tsx scripts/gen-third-party-notices.mts\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`✓ THIRD-PARTY-NOTICES up to date (${packages.length} bundled packages).`);
    return;
  }
  console.log(
    `✓ Wrote THIRD-PARTY-NOTICES for ${packages.length} bundled packages: ${packages.join(', ')}`,
  );
}

// Run only when invoked as a CLI, not when imported by the test.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

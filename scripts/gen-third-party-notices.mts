#!/usr/bin/env node
/**
 * Generate `apps/extension/THIRD-PARTY-NOTICES.md` from the extension's bundled
 * third-party runtime dependencies.
 *
 * Why this exists: the background worker statically imports `franc` (via
 * `@movar/lang-detect/franc`), and WXT bundles franc's runtime + its dependency
 * closure (trigram-utils → n-gram + collapse-white-space) into the shipped
 * artifact. Every one of those packages is MIT, and the MIT license requires the
 * copyright-and-permission notice to travel "in all copies or substantial
 * portions of the Software." The repo's own `LICENSE` covers Movar's code, not
 * its dependencies — so without this file the shipped package is out of
 * compliance with the terms of the code it bundles, and store reviewers do
 * spot-check attribution.
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
 * Note: franc ships no lowercase `license`/`LICENSE` file in its published
 * tarball (only `readme.md` carries the `## License` line), so for any package
 * missing a license file we synthesize the canonical MIT text from the package's
 * declared `license` field + its copyright/author — see `licenseTextFor`.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/**
 * Roots of the bundled third-party closure this file attributes. franc and its
 * transitive `dependencies` (trigram-utils → n-gram + collapse-white-space, all
 * MIT) are bundled into the background service worker for on-device language
 * detection — the compliance gap this script was written to close.
 *
 * Scope note (deliberate): the popup/options UI also bundles other third-party
 * runtime code — react + react-dom (MIT), lucide + lucide-react (ISC), and the
 * @fontsource/* font packages (OFL-1.1, which ship the actual font binaries
 * under the SIL Open Font License). Those are NOT yet covered here. They sit in
 * the UI bundle rather than the franc worker closure, and the ISC/OFL families
 * need handling this generator does not have (the OFL in particular has
 * reserved-font-name and redistribution clauses worth a human read), so the
 * `licenseTextFor` guard would reject them today. Extending attribution to the
 * full UI dependency set is a follow-up; this script intentionally stays scoped
 * to the franc closure called out in the issue. Build/test tooling (vitest, wxt,
 * react devtools, …) is never shipped and carries no attribution duty.
 */
const BUNDLED_ROOTS = ['franc'] as const;

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
 *  resolve relative to the lang-detect package (which declares `franc`) so pnpm's
 *  strict, non-hoisted layout finds the right copy. */
function resolvePackageDir(name: string): string {
  const fromLangDetect = createRequire(path.resolve(repoRoot, 'packages/lang-detect/package.json'));
  const tryResolvers = [fromLangDetect, require];
  for (const resolver of tryResolvers) {
    try {
      return path.dirname(resolver.resolve(`${name}/package.json`));
    } catch {
      // try the next resolver
    }
  }
  throw new Error(
    `Cannot resolve bundled dependency "${name}". Is it installed? ` +
      `(looked from packages/lang-detect and ${repoRoot})`,
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

/** License text for one package: the shipped file verbatim if present, else the
 *  canonical text for its declared SPDX id (only MIT supported today — assert
 *  loudly if a bundled dep ever ships under anything else, so we don't silently
 *  under-attribute). */
function licenseTextFor(pkg: ResolvedPackage): string {
  const fileText = readLicenseFile(pkg.dir);
  if (fileText) return fileText;
  const spdx = pkg.manifest.license ?? '';
  if (spdx !== 'MIT') {
    throw new Error(
      `Bundled dependency ${pkg.manifest.name}@${pkg.manifest.version} declares license ` +
        `"${spdx}" and ships no license file. Add explicit handling in ` +
        `scripts/gen-third-party-notices.mts before shipping it.`,
    );
  }
  return canonicalMit(authorString(pkg.manifest.author) || 'the package authors');
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

Movar ships its own MIT-licensed code (see [\`LICENSE\`](./LICENSE)). The
background service worker additionally bundles the third-party packages listed
below for on-device language detection. Each is reproduced here under the terms
of its license; the notices travel with the shipped artifact (this file is
copied into \`apps/extension/.output/<target>/\` via WXT's \`publicDir\`).

> Scope: this file covers the franc language-detection closure bundled into the
> background worker. The popup/options UI bundles further third-party code
> (react, lucide, @fontsource fonts) whose attribution is tracked separately;
> see the scope note in \`scripts/gen-third-party-notices.mts\`.

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

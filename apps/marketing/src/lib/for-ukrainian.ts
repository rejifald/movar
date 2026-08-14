/*
 * Routes, spheres and ordering for the «Для української» directory.
 *
 * What is here vs. in `i18n.ts`: this module holds the things that are the
 * same in both locales — the route, the sphere ids, their fixed order, and the
 * sort. The *words* (sphere names, headings, the disclaimer) live in `i18n.ts`
 * under the bilingual parity contract, because the page ships in English and
 * Ukrainian and a missing half should be a build failure.
 *
 * The entries themselves are one Markdown file each under
 * `src/content/projects/` — see `src/content.config.ts` for the schema and
 * `docs/articles/for-ukrainian.plan.md` for why the directory works the way it
 * does (unconditional listing, nothing ranked, consent before naming anyone).
 */
import type { Locale } from '../i18n';

/*
 * No `localeForUkrainianHref` here yet, deliberately. The rest of the site's
 * pages have one in `i18n.ts`, but those are linked from the footer and this
 * page is not — it is `noindex`, out of the sitemap, and unlinked while it is
 * finished. An href helper with no caller is dead code, and the metrics gate
 * says so. Add it alongside the footer entry when the page goes public.
 */

/**
 * The seven spheres, in the order the page renders them.
 *
 * Grouped by what a reader arrives wanting — games, a way to write better, a
 * typeface — rather than by what a project does to the language. That ordering
 * is deliberate and is also why there is no rank, score or tier anywhere in
 * this feature: the directory promotes these projects, and it is in no
 * position to grade them.
 *
 * Fixed enum, mirrored by the collection schema. Adding a sphere is a
 * deliberate edit here and there; a submission cannot invent one, or the
 * taxonomy dissolves within a month.
 */
export const SPHERES = [
  'games',
  'education',
  'writing',
  'books',
  'media',
  'typography',
  'technology',
] as const;

export type Sphere = (typeof SPHERES)[number];

/**
 * Sort entries within a sphere alphabetically, by the *page locale's* rules.
 *
 * Alphabetical is not an aesthetic choice: any other order is a ranking, and
 * the top of a list is a position of favour. The two locales therefore show
 * different orders — a Ukrainian collator sorts «Горох» and `Fixel` differently
 * from an English one — and that is correct rather than a bug. The page says
 * so in as many words, which is what stops the result reading as arbitrary.
 */
export function sortEntriesByName<T extends { data: { name: string } }>(
  entries: readonly T[],
  lang: Locale,
): T[] {
  const collator = new Intl.Collator(lang === 'uk' ? 'uk' : 'en');
  return entries.toSorted((a, b) => collator.compare(a.data.name, b.data.name));
}

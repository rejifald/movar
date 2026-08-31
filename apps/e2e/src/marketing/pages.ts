/**
 * The marketing site's page matrix — the single list of what "every page"
 * means, shared by the visual suite and the contrast suite next door.
 *
 * It lives in its own module because two suites need it and a second
 * hand-maintained copy is exactly the drift this repo keeps getting bitten by:
 * a page added to one list and forgotten in the other is invisible until
 * something ships broken on it.
 */

/** The page types, with their en (root) and uk (/uk/…) URLs. `stem` is the
 *  baseline-filename stem (`marketing-<stem>-<locale>[-dark]`). The 404 lives at
 *  a literal `.html` (Astro emits `dist/404.html`); the rest use Astro's default
 *  directory URLs.
 *
 *  `en` is optional because the blog is deliberately Ukrainian-only (see
 *  `apps/marketing/src/content.config.ts`): those two rows have no English URL
 *  to shoot, so they contribute uk baselines only and the matrix below skips
 *  them for the en locale. */
export const PAGES = [
  { stem: 'home', en: '/', uk: '/uk/' },
  { stem: 'install', en: '/install', uk: '/uk/install' },
  { stem: 'why-this-happens', en: '/why-this-happens', uk: '/uk/why-this-happens' },
  { stem: 'how-movar-works', en: '/how-movar-works', uk: '/uk/how-movar-works' },
  { stem: 'why-not-ai', en: '/why-not-ai', uk: '/uk/why-not-ai' },
  { stem: 'transparency', en: '/transparency', uk: '/uk/transparency' },
  { stem: 'privacy', en: '/privacy', uk: '/uk/privacy' },
  { stem: '404', en: '/404.html', uk: '/uk/404.html' },
  // Built and served, but noindex + out of the sitemap + unlinked while it
  // is finished (see apps/marketing/astro.config.mjs). Visual coverage does
  // not wait for a page to be public — the point is to notice when it
  // changes, and an unlinked page is exactly the kind that changes unwatched.
  { stem: 'for-ukrainian', en: '/for-ukrainian', uk: '/uk/for-ukrainian' },
  { stem: 'blog', en: undefined, uk: '/uk/blog' },
  { stem: 'blog-post', en: undefined, uk: '/uk/blog/tykha-kapitulyatsiya' },
  // The guide: the hub carries both islands and the card grid, and one page
  // stands in for the twenty, which share a single template.
  { stem: 'guide', en: undefined, uk: '/uk/guide' },
  { stem: 'guide-page', en: undefined, uk: '/uk/guide/windows' },
] as const satisfies readonly { stem: string; en: string | undefined; uk: string }[];

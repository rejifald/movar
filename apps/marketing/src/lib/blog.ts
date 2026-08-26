/*
 * The blog's routes and its Ukrainian chrome copy.
 *
 * Why this is not in `i18n.ts`: that module's whole shape is a parity
 * contract — `Record<Locale, Strings>` forces every string to exist in both
 * English and Ukrainian, which is exactly what you want for a bilingual site.
 * The blog is deliberately Ukrainian-only (see `src/content.config.ts` for the
 * reasoning), so putting its copy there would mean inventing an English half
 * that nothing renders and that would rot unnoticed. A single-locale section
 * gets a single-locale dictionary, and the type system stops pretending
 * otherwise.
 *
 * Post *bodies* live in Markdown under `src/content/blog/`; only the chrome
 * around them (headings, labels, the closing calls to action) is here.
 */

/** Index of the blog. Ukrainian-only, so the `/uk` prefix is unconditional. */
export const BLOG_INDEX_HREF = '/uk/blog';

/** Permalink for one post, keyed by its content-collection id (the filename). */
export function blogPostHref(id: string): string {
  return `${BLOG_INDEX_HREF}/${id}`;
}

/** The RSS feed. Linked from the index, the subscribe block, and `<head>`. */
export const BLOG_FEED_HREF = `${BLOG_INDEX_HREF}/rss.xml`;

/**
 * Format a post date the way the index and the post byline show it —
 * `13 серпня 2026`. `Intl` has the Ukrainian month names, so the only thing
 * worth pinning here is the locale and the field widths.
 */
export function formatPostDate(date: Date): string {
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export const blogStrings = {
  /** The section's own name — the footer link and the index's eyebrow. */
  navLabel: 'Блог',
  index: {
    /** Browser tab + OG title for the index. */
    pageTitle: 'Блог — Movar',
    pageDescription:
      'Статті про те, чому інтернет навʼязує російську і як налаштувати його на українську.',
    title: 'Про мову в інтернеті',
    lead: 'Розбори того, чому інтернет підсовує російську попри ваш вибір, і практичні інструкції, як це виправити.',
    /** Link label on each card. */
    readMore: 'Читати',
    /** Screen-reader label for the list of posts. */
    listLabel: 'Статті',
  },
  post: {
    /** Back-link above the article title. */
    backToIndex: 'Усі статті',
    /** Prefix before the publication date in the byline. */
    published: 'Опубліковано',
    /** Prefix before `updatedDate`, shown only when a post has one. */
    updated: 'Оновлено',
  },
  /**
   * The closing block under every post: install the extension, then follow
   * along. The article argues that the internet ignores your language choice;
   * this is where the reader can do something about it, so it says so plainly
   * rather than hinting.
   */
  /**
   * The one-line strip above a post's body, opposite the panel that closes it.
   *
   * Deliberately a PROMISE and not a byline: «this article is by Movar» is not
   * news to someone standing on movar.fyi, and a row that spends space on a
   * fact the address bar already gave them earns nothing. What a reader does
   * not know is what the thing does.
   *
   * «на ЇХНЮ українську версію» is load-bearing. «Перемикає сайти на
   * українську» reads as «перекладає сайти українською», which is the one
   * misreading this product cannot afford — Movar switches to a version the
   * site already has and never translates (§7.4). «Щоразу» carries the
   * tirelessness without personifying anything.
   *
   * Posts only. A guide page is a reference someone landed on mid-problem, and
   * the steps have to win the fold there; a post is something they chose to
   * read.
   */
  topStrip: {
    claim: 'Мовар щоразу перемикає сайти на їхню українську версію',
  },
  cta: {
    heading: 'Перемкніть інтернет на українську',
    body: 'Мовар — безкоштовне розширення з відкритим кодом. Воно мовчки знаходить українську версію сайту й перемикає на неї, а пошук просить видавати українські результати. Усе працює на вашому пристрої.',
  },
  subscribe: {
    heading: 'Стежити за оновленнями',
    body: 'Нові статті, релізи й те, над чим я зараз працюю.',
    /** Accessible labels for the channel links. */
    discord: 'Спільнота в Discord',
    instagram: 'Instagram',
    facebook: 'Facebook',
    rss: 'RSS',
  },
  feed: {
    title: 'Блог Movar',
    description:
      'Статті про те, чому інтернет навʼязує російську і як налаштувати його на українську.',
  },
} as const;

/** Movar brand & contact constants — shared by the extension and marketing site. */

/** Movar's support inbox. Reports and feedback are addressed here; nothing is
 *  ever sent automatically — the user's own mail client composes and sends. */
export const SUPPORT_EMAIL = 'support@movar.fyi';

/**
 * Where users can send feedback. Used by the options page and marketing site.
 * (The popup uses a contextual "report an issue" mailto instead — it prefills
 * the active page's URL; see the popup's report-mailto builder.)
 */
export const FEEDBACK_URL = `mailto:${SUPPORT_EMAIL}?subject=Movar%20feedback`;

/** Public source repository. Movar is open source under the MIT license. */
export const SOURCE_URL = 'https://github.com/rejifald/movar';

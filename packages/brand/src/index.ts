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

/**
 * Movar's Discord server — the community channel, alongside `FEEDBACK_URL` for
 * anything that needs a private reply.
 *
 * MUST be a never-expiring invite ("Expire after: Never", "Max uses: No limit"
 * in Discord's invite settings). Discord's default invite dies after 7 days,
 * and this link is printed on a static site that nobody re-checks — verify with
 * `curl -s https://discord.com/api/v10/invites/<code>` and confirm the response
 * carries `"expires_at": null` before changing it.
 */
export const DISCORD_URL = 'https://discord.gg/tRfbndt6C';

/** Movar on Instagram. */
export const INSTAGRAM_URL = 'https://www.instagram.com/movar.fyi/';

/** Movar on Facebook. Numeric profile URL — the page has no vanity handle. */
export const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61591986419299';

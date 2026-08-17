/**
 * How an audit's target is shown to a reader.
 *
 * Display only, and deliberately separate from `collect.ts`, which needs the
 * exact normalized URL: every request, every export filename and the report's
 * own subject keep the machine's form. This module exists because both the
 * composer's history list and the report screen render the same address, and
 * they each grew their own `hostOf` — one place is one answer.
 */

/** The host of a normalized target: `https://shop.example.ua/uk/` → `shop.example.ua`. */
export function hostOf(target: string): string {
  try {
    return new URL(target).host;
  } catch {
    return target;
  }
}

/**
 * A normalized target, back in the form a person would have typed it.
 *
 * `normalizeAuditUrl` turns `example.com` into `https://example.com/` because
 * that is what the prober needs; showing that back is the machine's version of
 * the address, not the reader's. Drops the scheme and one trailing slash, and
 * keeps everything that carries meaning — the path, the query, and `www.`,
 * which is a different host from the apex and can serve a different language.
 */
export function prettyTarget(target: string): string {
  try {
    const url = new URL(target);
    const shown = `${url.host}${url.pathname}${url.search}${url.hash}`;
    return shown.endsWith('/') ? shown.slice(0, -1) : shown;
  } catch {
    // Not parseable — show it exactly as it is rather than mangling it.
    return target;
  }
}

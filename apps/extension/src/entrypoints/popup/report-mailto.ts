import type { Messages } from '../../lib/i18n';

/** Everything the report email needs, gathered by the popup. All of it is the
 *  user's own browser/config; it's shown in the composed mail before sending,
 *  and the prompt asks them to review and trim it. */
export interface ReportContext {
  /** Active tab's http(s) URL, or null on a non-web tab (chrome://, store, …). */
  pageUrl: string | null;
  /** Extension version, e.g. "1.0.1". */
  version: string;
  /** Short browser label, e.g. "Chrome 120" (see {@link browserInfo}). */
  browser: string;
  /** Short OS label, e.g. "macOS" (see {@link osInfo}). */
  os: string;
  /** Resolved UI locale the popup is showing, e.g. "uk". */
  locale: string;
  /** Movar's master toggle. */
  enabled: boolean;
  /** Temporarily suspended (even if enabled). */
  paused: boolean;
  /** Content-hiding (contentModification) on/off. */
  hiding: boolean;
  /** Language priority order, e.g. ["uk","en"]. */
  priority: readonly string[];
  /** Blocked languages, e.g. ["ru"]. */
  blocked: readonly string[];
  /** Whether the active site is allowlisted (only meaningful with a page). */
  exempt: boolean;
}

/**
 * Compose the `mailto:` href behind the popup's "Report an issue" link.
 *
 * Pure and side-effect-free: the extension never opens a socket. The user's own
 * mail client composes the message and they decide whether to send it. The body
 * is a localised prompt (which asks them to review and trim the details) above
 * a compact, English diagnostic footer — kept neutral on purpose so the
 * maintainer's inbox reads uniformly across reporter locales.
 */
export function buildReportMailto(
  email: string,
  t: Messages['report'],
  ctx: ReportContext,
): string {
  const host = ctx.pageUrl == null ? null : hostnameOf(ctx.pageUrl);
  const body = `${t.bodyPrompt(ctx.pageUrl !== null)}\n\n\n—\n${detailsBlock(ctx)}`;
  return `mailto:${email}?subject=${encodeURIComponent(t.subject(host))}&body=${encodeURIComponent(body)}`;
}

/** The diagnostic footer: page URL (if any), an environment line, and a Movar
 *  state line. Intentionally terse + English — maintainer-facing triage data,
 *  not UI copy. The "this site" field is page-only. */
function detailsBlock(ctx: ReportContext): string {
  const status = ctx.enabled ? (ctx.paused ? 'paused' : 'on') : 'off';
  const state = [
    `status ${status}`,
    `hiding ${ctx.hiding ? 'on' : 'off'}`,
    `priority ${ctx.priority.join(' → ') || 'none'}`,
    `blocked ${ctx.blocked.join(', ') || 'none'}`,
  ];
  if (ctx.pageUrl != null) state.push(`this site ${ctx.exempt ? 'exempt' : 'not exempt'}`);

  return [
    ctx.pageUrl,
    `Movar v${ctx.version} · ${ctx.browser} · ${ctx.os} · UI ${ctx.locale}`,
    state.join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Best-effort short browser label ("Chrome 120", "Firefox 121", "Safari 17",
 *  "Edge 120") from a user-agent string. Order matters: Edge/Opera UAs contain
 *  "Chrome", and Chrome's contains "Safari", so the more specific brands are
 *  tested first. Returns "Unknown browser" when nothing matches. */
export function browserInfo(userAgent: string): string {
  const checks: [RegExp, string][] = [
    [/Edg\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[.\d]* Safari/, 'Safari'],
  ];
  for (const [re, name] of checks) {
    const match = re.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return 'Unknown browser';
}

/** Best-effort OS family ("Windows", "macOS", "Android", "iOS", "ChromeOS",
 *  "Linux") from a user-agent string. Order matters: Android/ChromeOS UAs
 *  contain "Linux", and iOS UAs contain "Mac OS X". No version — UAs freeze it
 *  (macOS sticks at 10_15_7, Windows at NT 10.0), so it'd mislead. Returns
 *  "Unknown OS" when nothing matches. */
export function osInfo(userAgent: string): string {
  const checks: [RegExp, string][] = [
    [/Windows NT/i, 'Windows'],
    [/Android/i, 'Android'],
    [/iPhone|iPad|iPod/i, 'iOS'],
    [/CrOS/i, 'ChromeOS'],
    [/Mac OS X/i, 'macOS'],
    [/Linux/i, 'Linux'],
  ];
  for (const [re, name] of checks) {
    if (re.test(userAgent)) return name;
  }
  return 'Unknown OS';
}

/** Hostname for the subject line. Falls back to the raw string if `pageUrl`
 *  somehow isn't parseable — the caller already filters to http(s). */
function hostnameOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return pageUrl;
  }
}

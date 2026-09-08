/*
 * The `mailto:` behind each row of the uninstall page's ask ladder.
 *
 * The site's counterpart to the popup's `report-mailto.ts`, and deliberately a
 * much smaller thing. The popup can gather context — the active tab, the
 * settings, the running version — and offers to let the reader trim it before
 * sending. By the time this page renders, the extension is gone: there is no
 * state to read, so nothing is attached and there is nothing to trim. The
 * subject names which failure the reader picked; the body is a prompt and then
 * their own words.
 *
 * No backend, here or anywhere on this site — a feedback form would need one,
 * and `verifyNetworkSilent` in `scripts/lib/promises.mts` is the promise that
 * forbids it.
 */
import { SUPPORT_EMAIL } from '@movar/brand';

/**
 * Compose the `mailto:` for one ladder row.
 *
 * Pure and side-effect-free: the page opens no socket, and the reader's own
 * mail client composes the message and decides whether it is ever sent.
 *
 * The trailing blank lines put the cursor below the prompt rather than at the
 * end of it, so the reader types into space instead of editing the prompt away
 * — the same shape the popup's builder uses.
 */
export function buildUninstallMailto(subject: string, bodyPrompt: string): string {
  const body = `${bodyPrompt}\n\n\n`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

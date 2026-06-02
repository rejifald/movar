/**
 * Core types for the page-mode module.
 *
 * PageMode          — the binary verdict every overlay needs: light or dark.
 * PageModeDetector  — site-specific strategy; same shape as PageExtractor in
 *                     page-content/. Detectors live in a registry keyed by
 *                     host; most pages use the generic chained detector and
 *                     never touch this — site-specific overrides exist only
 *                     for pages whose theme switch ignores every signal in
 *                     the generic chain (none today; the registry is in
 *                     place for the day one shows up).
 */

export type PageMode = 'light' | 'dark';

export interface PageModeDetector {
  id: string;
  /** Return true when this detector handles the given hostname. */
  matches(host: string): boolean;
  /**
   * Inspect `doc`/`win` and return the detected mode, or null to defer to
   * the generic chain. Deferring (not returning a guess) is the correct
   * answer when the site's own theme attributes haven't been written yet
   * or are set to "auto"/"system".
   */
  detect(doc: Document, win: Window): PageMode | null;
}

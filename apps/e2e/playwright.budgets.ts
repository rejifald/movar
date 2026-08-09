/**
 * Time budgets that differ between asserting and regenerating.
 *
 * `scripts/e2e-baselines.sh` runs the pinned Playwright image with
 * `--platform linux/amd64` so the committed PNGs match CI byte-for-byte. On an
 * Apple Silicon host that platform is emulated, and a 5-7k-px full-page capture
 * then takes seconds rather than milliseconds — while `toHaveScreenshot` needs
 * TWO consecutive identical captures before it will write a baseline.
 *
 * At CI's budgets the tallest pages lose that race, and they lose it in the
 * worst possible way: `--update-snapshots=all` writes nothing for a test that
 * timed out, so the run "completes" leaving those few baselines at their
 * PREVIOUS content. On disk that is indistinguishable from "this page didn't
 * change" — until CI rejects them. Observed regenerating the marketing set on a
 * loaded host: the three tallest pages came back stale while the other 21 were
 * correct.
 *
 * Hence `E2E_SLOW_HOST=1`, set only by the regeneration entry point. The
 * scoping is the point: while `--update-snapshots=all` is rewriting the
 * expectations, a timeout asserts nothing — it can only cost you a baseline.
 * CI leaves the variable unset and keeps its tighter budgets, where a timeout
 * is genuine signal about the product.
 */
export const SLOW_HOST = process.env['E2E_SLOW_HOST'] === '1';

/** The CI budget, or a roomier one when regenerating under emulation. */
export function budget(ci: number, regenerating: number): number {
  return SLOW_HOST ? regenerating : ci;
}

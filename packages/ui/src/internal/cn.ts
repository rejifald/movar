/**
 * `clsx`-style class joiner — filters out falsy values and joins with a space.
 *
 * Re-exported publicly from `src/index.ts` so consumers compose conditional
 * classNames with `cn(...)` instead of template literals. Every primitive needs
 * the same helper; rather than copy-paste it into each file, they import from
 * here. If we ever need a richer variant API (Tailwind merge, prefix
 * collapsing, …), this is the single seam to change.
 */
export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

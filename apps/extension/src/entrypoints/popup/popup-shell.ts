/**
 * The popup shell's fixed width, as a Tailwind class.
 *
 * A static literal (not `` `w-[${size.popup}]` ``) so Tailwind can scan and
 * generate the utility — a template literal would leave `w-[360px]`
 * ungenerated. `popup-shell.test.ts` asserts this literal stays equal to
 * `@movar/theme`'s `size.popup`, so the token stays the source of truth and a
 * drift is caught in CI.
 *
 * No imports on purpose: the popup's last-resort {@link SafeCrashCard} pulls
 * this in, and that card renders only crash-safe primitives — so this module
 * must not reintroduce any dependency that could itself throw. Shared by the
 * live popup ({@link App}) and both crash cards, which otherwise mirror the
 * shell by hand.
 */
export const POPUP_WIDTH_CLASS = 'w-[360px]';

---
type: design-spec
id: priority-driven-switching
status: proposed
date: 2026-05-28
summary: Replace the blocked-language switch trigger with a priority-rank model; add a consent wall for blocked pages with no alternative; relax the options-UI guard against empty priority.
---

# Priority-driven switching

## Context

Today, Movar's auto-switch trigger is _"page language is in `settings.blocked`"_ — see [content.ts:270](../apps/extension/src/entrypoints/content.ts). This makes `priority` a passive list: it only answers _"where do we switch to?"_, never _"should we switch?"_.

Concrete gap: `priority = ['uk', 'en']`, `blocked = ['ru']`. A page renders in `en` and advertises a `uk` version via `hreflang`. Today, no switch fires — `en` isn't blocked, so the gate at content.ts:270 bails. Expected behaviour: switch to `uk` because it's higher priority.

## Goal

Make `priority` an _active_ preference, not a fallback target. Movar switches whenever a higher-priority alternative is available — regardless of whether the current language is blocked. `blocked` becomes a hard "this is worse than anything else" marker, not the switch trigger.

## Rank model

For any language code `L`:

- `L ∈ priority` at index `i` → rank `i` (0 = best)
- `L ∉ priority` AND `L ∉ blocked` → rank `N + 0.5` where `N = priority.length`
- `L ∈ blocked` → rank `+∞`

Both lists feed one rank function: priority assigns ranks `0..N-1` to wanted languages, blocked assigns `+∞` to unwanted ones, everything else sits between. The switch trigger reduces to _"is there a rank-better alternative available?"_.

## Switching algorithm

Rewrite `attemptLanguageSwitch` ([content.ts:256-280](../apps/extension/src/entrypoints/content.ts)):

1. Detect `pageLang`. Compute `currentRank`.
2. Scan available alternatives (site rule, `hreflang` links, on-page picker). Compute `bestAvailableRank` and `bestTarget`.
3. If `bestAvailableRank < currentRank` → switch to `bestTarget` via the existing strategy/hreflang/picker fallback chain.
4. Else if `pageLang ∈ blocked` AND `settings.contentModification` → show consent wall.
5. Else → silent no-op.

**Cost note:** today the alternative scan happens only on blocked pages. After the change it happens on any page where `currentRank > 0`. The DOM is already loaded; the scan is cheap. But the rank-0 short-circuit (page already in top priority → done) needs to be the first thing checked.

**Loop guard:** `clearAttempt()` at [content.ts:349](../apps/extension/src/entrypoints/content.ts) currently fires when `pageLang ∉ blocked`. Update it to fire when `currentRank === bestAvailableRank` — _"we landed at the best Movar can offer here, drop the guard so future navigation can redirect again."_

## Consent wall

A full-page interstitial covering `document.body`. Appears when:

- A switch was attempted but no rank-better alternative exists, AND
- `pageLang ∈ blocked`, AND
- `settings.contentModification` is enabled.

Top frame only: `if (window.top !== window) return;`. Iframes don't get walls.

### Primitive

Extend [lib/curtain.ts](../apps/extension/src/lib/curtain.ts) with a third mode alongside `cover` and `replace`:

- `page` mode → `position: fixed`, `inset: 0`, z-index near `2147483647` (defeat any site stacking context)
- Implements the focus trap deferred in the v1 a11y note ([curtain.ts:30-34](../apps/extension/src/lib/curtain.ts)) — locally it's fine to tab past a card overlay; on a full-page wall, focus must not leak underneath
- `Escape` key as a documented shortcut for "Show this time" (or "back to previous page" — see open question)

### Copy

EN: _"This page is in **{language}**. Movar couldn't find a **{priority[0]}** version, so it can't switch automatically. Continuing means reading content in a language you've blocked."_

UK: equivalent translation, same tone.

Names rendered via the existing `displayLanguage()` helper in [options/shared.tsx](../apps/extension/src/entrypoints/options/shared.tsx). When `priority.length > 1`, mention the top two ("Ukrainian or English"); when 1, mention just the top entry.

### Actions

**"Show this time"** / _"Показати цього разу"_

- Write `sessionStorage` key `movar:bypass:${hostname}` = `"1"`.
- At content-script bootstrap ([content.ts:381](../apps/extension/src/entrypoints/content.ts)), check this flag alongside `allowlist` and `paused` and short-circuit the entire content script when set.
- Effect: drops _all_ DOM modifications on this host for the session — wall, picker hiding, card blur. Closer to a per-host pause than a wall-specific bypass. Rationale: the wall fires precisely when Movar has no useful switching to offer; once the user waves it through, continuing to blur and hide things below the line is inconsistent.
- Scoped to the current tab. Dies on tab close.

**"Always allow this site"** / _"Завжди дозволяти цей сайт"_

- Append `location.hostname` to `settings.allowlist`, persist.
- Reload the page so already-applied DOM modifications unwind cleanly via the existing bootstrap allowlist short-circuit ([content.ts:382](../apps/extension/src/entrypoints/content.ts)).

### Gating

The wall is bound to `settings.contentModification` — the same toggle that controls picker hiding and card blur ([messages-en.ts:174](../apps/extension/src/lib/i18n/messages-en.ts)). When the toggle is off, no wall — the page just renders. Picker hiding, blur, and wall all share one user-facing switch.

## Empty priority

When `settings.priority.length === 0`:

- **Runtime:** silent no-op on every page. No switching, no wall, no picker hiding, no card blur. Movar is effectively paused.
- **Options UI:** allow removing every entry. Render an inline warning panel above the list:

  EN: _"**Movar is paused.** No priority languages are set, so Movar can't switch pages or filter content. Add at least one language below to resume."_

  UK: _"**Movar призупинено.** Жодної пріоритетної мови не задано, тому Movar не може переключати сторінки або фільтрувати вміст. Додайте принаймні одну мову нижче, щоб відновити роботу."_

- **Extension icon:** display a `!` badge via `browser.action.setBadgeText` to surface the broken config when the user is away from the options page. Clear when `priority.length > 0`.

**Code change:** remove the guards at [PrioritySection.tsx:32](../apps/extension/src/entrypoints/options/PrioritySection.tsx) (`if (settings.priority.length <= 1) return;`) and [:55](../apps/extension/src/entrypoints/options/PrioritySection.tsx) (`canRemove: settings.priority.length > 1`). Both currently prevent removing the last entry.

## Related: priority/blocked overlap

The rank function gives precedence to `blocked` when a language is in both lists. Today the options UI silently allows this contradiction. By the same principle as empty priority, the UI should warn but not prevent:

EN: _"`{language}` is also in your blocked list and will be ignored."_

Surfaced inline next to the affected priority entry, in the options page.

## Naming follow-ups

After this change, two existing strings become inaccurate and need replacement:

- Popup toggle [messages-en.ts:174](../apps/extension/src/lib/i18n/messages-en.ts): _"Hide blocked-language content"_. Now also controls the wall.
- Options paragraph [messages-en.ts:192](../apps/extension/src/lib/i18n/messages-en.ts): _"Blocked languages trigger an automatic switch away."_ Trigger is now priority-rank, not blocked-membership.

Replacement copy TBD when implementation lands.

## Design principle established

This spec establishes a distinction worth carrying forward: **policy locks stay, config validity guards relax.**

- `ru` stays unremovable from blocked — that's Movar's product mission, not a user-configurable choice.
- Empty priority becomes removable — a user choice with explainable consequences.
- Priority/blocked overlap becomes warn-only — same shape.

When in doubt: if the constraint defends the product's reason for existing, lock it. If it defends the user from a config mistake they can recover from, explain it instead.

## Open questions

- **Escape key on the wall.** Treat as "Show this time" (semantic match to dismissal), or as "go back to previous page" (semantic match to native browser modal-cancel)? Default to the former unless user testing pushes otherwise.
- **Wall fires after a partial switch failure.** If `attemptLanguageSwitch` triggers a navigation that lands back on the same blocked URL (rule/hreflang misconfigured), the loop guard short-circuits subsequent attempts. The wall should still appear on that second pass — verify the ordering in the implementation.
- **First-install UX shift.** A user with `priority=['uk']` will, after this change, attempt to switch every non-`uk` page that advertises a `uk` version — a notably more active behaviour than today. Worth a release note and a check that the rank-0 short-circuit really does no work when the page is already best.

## Out of scope for this spec

- Badge styling and exact "!" representation.
- Wall visual design (typography, palette, illustration). Defer to styleguide tokens; specifics decided in implementation.
- Whether to add a "configure Movar" deep link from the wall to the options page. Possible follow-up; not required for v1.

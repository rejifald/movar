---
type: reference
id: store-policy-stance
status: accepted
date: 2026-06-13
summary: Movar permanently locks Russian (`ru`) as a blocked language, which sits adjacent to Chrome Web Store / AMO discouraged-content and hate-speech policies. This doc records the deliberate maintainer stance so a store reviewer (or a contributor) reads intent rather than inferring it: Movar blocks, never translates; only `ru` is locked; fellow Cyrillic / "victim" languages such as Belarusian stay visible; the product is framed as user-preference language enforcement, not as targeting speakers of any language. Linked from the deployment checklist.
---

# Store-policy stance: the locked `ru` block and discouraged-content policy

## Why this document exists

Movar ships with one language permanently locked as blocked: Russian (`ru`). This
is enforced in code, not user-configurable —
[`LOCKED_BLOCKED_LANGUAGES = ['ru']`](../packages/settings/src/index.ts), with
`enforceLockedLanguages()` re-asserting it at the storage boundary so a stale
sync, a hand-edited storage value, or a UI bug cannot quietly disable it.

A permanent, non-removable block keyed on one national language sits adjacent to
the marketplaces' discouraged-content and hate-speech rules:

- **Chrome Web Store** — [Program Policies](https://developer.chrome.com/docs/webstore/program-policies):
  hate speech and content that incites hatred against groups (including by
  national origin) is prohibited; "discouraged content" guidance covers items a
  reviewer may flag even when not outright disallowed.
- **Firefox AMO** — [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/):
  no content that promotes hatred or discrimination.
- **Microsoft Edge Add-ons** — equivalent prohibitions in the
  [Edge extension policies](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/edge-extension-policies).

We do not believe Movar violates any of these. But "block Russian" can be
misread at a glance as "target Russian speakers," and we would rather a reviewer
read our intent than infer it. This document is the written stance, kept ready
to hand if a discouraged-content question is raised. It is product/policy
posture, not legal advice.

## The stance

**1. Movar blocks; it never translates.** The product hides or switches away from
blocked-language content — it never machine-translates it, by deliberate design
(see [no-content-translation.md](./no-content-translation.md)). Translating
Russian into fluent Ukrainian would launder the content and strip the provenance
signal users install Movar for. Blocking is the honest, narrow mechanism.

**2. The block is a user-preference enforcement tool, not a content judgement
about speakers.** Movar's whole purpose is to make the web appear in the
languages the user wants. A Ukrainian user who has chosen not to consume Russian
content gets that preference enforced consistently — at the request layer
(`Accept-Language`) and, opt-in, on the page (concealment). The tool acts on the
_language of the content as served to that user_, on that user's own device. It
makes no claim about Russian speakers, Russian people, or the Russian language as
such; it expresses one user's media-consumption choice.

**3. Only `ru` is locked. Fellow Cyrillic / "victim" languages stay visible.**
This is the load-bearing distinction. Movar's language detection deliberately
distinguishes Russian from its Cyrillic neighbours and treats those neighbours as
_visible candidates_, never as blocks:

- The detection profiles
  ([`packages/lang-detect/src/profiles.ts`](../packages/lang-detect/src/profiles.ts))
  carry distinct ISO 639-3 entries for Ukrainian (`ukr`), Russian (`rus`),
  **Belarusian (`bel`)**, and English (`eng`). Belarusian is identified as its own
  language and stays visible — it is never folded into the `ru` block.
- Nothing locks any language other than `ru`. The default `priority` is
  `['uk', 'en']`; a user can add or remove any non-locked language freely.

The choice to lock _only_ Russian — and specifically to keep Belarusian and other
Cyrillic-script languages visible — is what marks this as a targeted
user-preference tool rather than a blanket "hide Cyrillic" or anti-Slavic filter.
Belarusian is a fellow target of the same Russification pressure Movar's users are
pushing back on; concealing it would betray the mission, not serve it.

**4. Why `ru` specifically is locked rather than user-toggleable.** The lock
exists to remove a footgun, not to make a political statement in the UI. Movar's
reason for existing is helping users who do not want Russian content avoid it
reliably; a toggle invites "I switched it off and forgot" failures that silently
break the product's premise (see the rationale comment on
`LOCKED_BLOCKED_LANGUAGES`). The constraint defends the product's reason for
existing, so it is locked — consistent with the design principle in
[priority-driven-switching.md](./priority-driven-switching.md#design-principle-established).

## One-line summary for a reviewer

> Movar is a language-preference tool. It lets a user keep the web in the
> languages they want and, at the user's option, hide content in a language they
> have chosen to block. Only Russian is locked-on by default, reflecting the core
> user need the extension was built for; every other language — including fellow
> Cyrillic languages such as Belarusian — is detected, kept visible, and fully
> user-controllable. The extension never translates, never transmits page
> content, and makes no judgement about any group of speakers.

## Related

- [no-content-translation.md](./no-content-translation.md) — why Movar blocks
  rather than translates (the integrity argument).
- [priority-driven-switching.md](./priority-driven-switching.md) — the
  "if the constraint defends the product's reason for existing, lock it"
  principle.
- [deployment-checklist.md](../deployment-checklist.md) — links here from the
  store-policy-stance entry.

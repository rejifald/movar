---
summary: Catalogue of recurring bug *classes* — recognise the signature, apply the guard.
---

# Pitfalls & recurring issue signatures

A catalogue of bug **classes** we've hit (or expect to hit) more than once. Unlike a
changelog of individual fixes, each entry describes a _pattern_: how to recognise it,
where it bites, why it happens, and the durable guard that prevents the whole class.

**Add an entry** when a fix turns out to be an instance of a general pattern rather than
a one-off — especially if the failure was silent (green tests, wrong behaviour in the wild).

**Each entry must be self-sufficient.** A reader should be able to **identify** the bug and
**tackle** it from the entry alone — without following any link, opening a PR, or reading the
implementation. Code paths are pointers to _where_ the pattern lives, never a substitute for
explaining _what_ it is and _how_ to fix it. Write the fix as a recipe, not a reference.

**Per-entry template**

- **Signature** — recognise it from the _symptom_, before you know the cause.
- **Blast radius** — every place in the codebase where the pattern can occur.
- **Root cause** — the underlying mechanism, stated in full.
- **Guard** — a concrete, implementable recipe that kills the class, not just the instance.
- **Instances** — concrete sightings (in-repo file + symbol; describe each self-containedly).
- **Review checklist** — what to ask when touching the blast-radius code.

---

## 1. Language detection fed non-content text ("sample contamination")

> _Tags: language-detection, content-filter, page-content, lang-detect_

**Signature.** A foreign-language item is **kept** (not hidden, not switched) even though a
human plainly reads it as the blocked language. Tell-tales: the item is **short**, and/or it
sits among host UI rendered in the _keep_ language (a "translate" link, store ratings, view
counts, badges). Unit tests stay green because synthetic fixtures use clean, single-language text.

**Blast radius.** Anywhere text is extracted and handed to a language classifier:

- Per-card content filtering — each site extractor serialises a card's text, which is then
  classified to decide hide/keep.
- Page-language detection's text fallback — a whole-page visible-text sample classified to
  decide a redirect, used only when the structural signals (active picker entry, `<html lang>`,
  subdomain, path, self-hreflang) all abstain. Those structural signals carry no free text and
  are immune; only the text fallback is exposed.
- Any new extractor, detector, or text-serialiser added later.

**Root cause.** The serialised sample includes text that is **not the item's own language**:
host-injected UI chrome rendered in the user's UI language (a "Translate this page" link, a
store-rating/delivery annotation row), platform-translated titles, boilerplate, nav/footer.
The classifier is **count-based and provenance-blind** — it cannot tell the site's content from
the platform's chrome — so a couple of keep-language tokens outvote a short blocked-language
body. Russian running text is especially exposed: its distinctive-vs-Ukrainian letters
(`ы`/`э`/`ъ`/`ё`) are rare, so a short Russian snippet may carry only one, which two words of
injected Ukrainian chrome cancel out — flipping the verdict to "Ukrainian, keep".

**Guard — classify the content, not the container.**

1. Serialise an **allow-list** of the item's _own_ content (its title + main snippet/body),
   **not** the whole element. Because an allow-list is a closed set, any chrome the host injects
   _later_ (new annotation rows, badges, links) is excluded automatically — there is no
   ignore-list to grow. This is the opposite of a "strip known chrome" block-list, which is an
   open set: every new chrome type is a silent miss until someone notices and adds a selector.
2. If the allow-list comes up short (a content anchor is missing or rotated, so you'd be
   classifying a bare title), **fall back** to the whole element with known-chrome subtrees
   pruned — but treat this as the rare safety net, not the default path.
3. Anchor every selector on **durable** signals — stable `data-*` attributes, ids, semantic
   tags. **Never** obfuscated/minified styling classes: they rotate without notice, so a
   class-based selector silently matches zero nodes after a redesign while unit tests stay green.
4. For a whole-page detector with no per-item anchor, scope to landmarks (`<main>`/`<article>`),
   treat the verdict as **coarse**, and never let it drive an irreversible action without a guard
   (loop-guard, mode gate).
5. **Validate with a real saved page**, never a synthetic single-language fixture — the bug only
   appears once real host chrome is in the sample.

**Instances.**

- **Google SERP** (`packages/page-content/src/google.ts`) — an injected "Translate this page"
  link plus a store-annotation row (rendered in the UI language) were swept into the whole-card
  text and flipped a short Russian shopping result to "Ukrainian", so it survived the filter.
  Fixed per the recipe: serialise the result's title + snippet via an allow-list of durable
  selectors, with a whole-card-minus-chrome fallback (`serializeContentText`).
- **YouTube** (`packages/page-content/src/youtube.ts`) — already allow-list (video title +
  channel name only), so injected metadata (view counts, timestamps) never enters the sample;
  **not** exposed to this bug. _Adjacent, still open:_ YouTube sometimes **auto-translates the
  title itself** into the UI language — a different mechanism (the platform rewrites the content,
  not separate chrome), with no reliable DOM signal to recover the original yet.
- **Page-language text fallback** (`apps/extension/src/lib/page-text.ts`) — a coarse whole-page
  sample; shares the DNA but is gated behind the structural detector and a loop-guarded redirect,
  so it's by-design, not a defect.

**Review checklist** (when adding or maintaining an extractor or a detector):

- Does the serialised text include anything the _site_ renders in the UI language — links,
  badges, ratings, "translate", view counts, timestamps?
- Is the text an **allow-list** of content selectors (good), or a whole-element / whole-page
  grab (suspect)?
- Would a **short** blocked-language item survive being mixed with a couple of keep-language
  tokens of chrome?
- Are the selectors **durable** (`data-*`, ids, semantic tags) rather than obfuscated styling
  classes?
- Did you test with a **real saved page**, not a synthetic single-language fixture?

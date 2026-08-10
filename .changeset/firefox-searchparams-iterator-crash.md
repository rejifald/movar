---
'@movar/extension': patch
---

Fix a crash that disabled Movar entirely on Google in Firefox.

`scrubSearchParams` iterated `url.searchParams.keys()`. A Firefox content script is an Xray-wrapped sandbox where `URLSearchParams`'s WebIDL iterator methods do not survive the wrapper, so that `for…of` threw `TypeError: searchParams.keys() is not iterable` — out of `applyStrategy`, out of `applyOnce`, out of the content-script bootstrap. On Google (the only host whose rule scrubs params) Firefox users therefore got no `hl`/`lr` rewrite — so Google served the Russian corpus — and no content filtering at all, while the popup kept answering normally because its message bridge is installed before the throw. Now uses `forEach`, and a `no-restricted-syntax` guard bans these iterator methods repo-wide: Chromium and jsdom both iterate them fine, so no unit test or Chromium e2e run can catch a reintroduction. Note `Array.from(searchParams.keys())` does not throw in that sandbox — it silently returns `[]`, which would have scrubbed nothing while looking correct.

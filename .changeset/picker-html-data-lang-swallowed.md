---
'@movar/extension': patch
---

Fix Movar failing to find a site's language switcher at all — automatic switching silently did nothing, with no error — on sites that stamp a `data-lang`/`data-locale` attribute on `<html>` (a common CMS pattern for page-level locale metadata; UMI.CMS shops like ds-electronics.com.ua do this as `data-lang="ru"`). Movar's picker scan seeds candidates on `data-lang`/`data-locale`, meant for individual switcher items, but `<html>` matched too — and being the ancestor of every other element on the page, it crowded out the real switcher from consideration entirely. Movar now ignores `<html>` and `<body>` as switcher candidates; they're never legitimate switcher items themselves.

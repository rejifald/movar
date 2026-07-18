---
'@movar/extension': minor
---

Manage exempt sites (the allowlist) directly from the extension. The options page now shows an "Exempt sites" editor to add, review, and remove domains where Movar takes no action, and the popup gains an "Always skip this site" action that exempts the current site in one click. Exempt domains are normalised to one canonical form — a bare `example.com`, with `www.`/scheme/path stripped — so a site you exempt from the popup is matched consistently by both the content script and the network-level rewrite, and covers its subdomains.

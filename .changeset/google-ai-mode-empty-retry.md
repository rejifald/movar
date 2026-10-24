---
'@movar/extension': patch
---

Stop reloading Google AI Mode just before its answer appears, and leave Google News search alone.

- The empty-results retry (retry a Google results page once without `lr` when it shows zero results) now only runs on the pages the Google rewrite covers: plain results with no `udm`, `udm=14` or `udm=web`. AI Mode (`udm=50`) still picks up `lr` from the network-layer redirect, and its page has a `#search` container with no organic result cards. The retry read that as an empty results page and reloaded the chat while the answer was loading, which left the answer blank until a manual refresh.
- The Google rule now only applies on `google.<tld>` and `www.google.<tld>`, both in the content script and in the network-layer redirect. It used to match every Google subdomain, and `news.google.com` has its own `/search?q=`: when the URL names a different edition (`ceid=US:en`), its server sends a rewritten `hl=uk` straight back to the edition's language, so Movar and Google News fought over the URL.

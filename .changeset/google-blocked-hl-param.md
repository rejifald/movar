---
'@movar/extension': patch
---

Google products and YouTube no longer open in Russian from a link that asks for it. Google's own search results can point to pages like Google Classroom with `?hl=ru` already in the address, and those pages ignored Movar's language preference. Movar now swaps a blocked language in `hl` for your preferred one; links without `hl`, or with an allowed language, are left untouched.

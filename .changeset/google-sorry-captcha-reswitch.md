---
'@movar/extension': patch
---

Re-apply Movar's Google language switch after you solve a Google captcha (the "unusual traffic" / `/sorry` interstitial). Previously the results came back in the blocked language: the page you were returned to still counted as recently-redirected, so Movar treated the captcha detour as a redirect loop and skipped the switch. Movar now recognises the `/sorry` interstitial as an external interruption and re-applies the `hl`/`lr` switch on the search page you land back on.

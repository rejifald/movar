---
'@movar/extension': patch
---

Fix Movar giving up on Ukrainian shops that run on UMI.CMS and model language as a prefix-less URL for Ukrainian (e.g. `/rele/`) versus `/ru/…` for Russian. These sites advertise a language link that actually 301-redirects straight back to the Russian page; Movar followed it, got bounced, and — as a side effect of the bounce-loop protection — also stopped trying the shop's own, correct on-page language switcher. That switcher was separately going undetected because its link was labeled "UKR" in Latin letters, which language detection previously only recognized in the Cyrillic spelling "укр". Movar now recognizes the Latin label and will still try the shop's own switcher after a broken language link bounces, while still refusing to retry a link that bounces on its own.

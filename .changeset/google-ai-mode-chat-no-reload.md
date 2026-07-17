---
'@movar/extension': patch
---

Stop Google's AI Mode chat from forcing a full page reload after every message. Google updates the page's URL after each chat turn without an actual navigation, and Movar mistook that URL change for a mistranslated search and hard-reloaded to correct it — interrupting the conversation. Movar now recognizes normal AI Mode chat activity and leaves it alone, reloading only when the page's language settings are genuinely wrong.

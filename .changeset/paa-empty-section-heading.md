---
'@movar/extension': patch
---

Hide Google's "Схожі запитання" (People also ask) section heading when every question inside it is concealed, instead of leaving the label dangling over an empty box. The empty-container cleanup now treats a lone section heading as a passive label rather than content that keeps the section alive — while still preserving functional controls beside an emptied list, such as the AI Overview "5 сайтів" sources toggle. "Show everything" brings the whole section back together with its rows.

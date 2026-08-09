---
'@movar/host-match': minor
---

host-match: add `isYouTubeContentHost` and `isGoogleSerpHost` — the hosts the page-content extractors actually parse (www/m/bare youtube.com; optional-`www.` + the curated google set). Deliberately narrower than `isYouTubeHost`/`isGoogleHost`, which the redirect layer keeps: sibling frontends (music/studio/kids.youtube.com, news/scholar/translate.google.\*) render entirely different components, so provisioning a model chunk there could never conceal anything (#372).

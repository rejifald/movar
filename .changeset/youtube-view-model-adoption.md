---
'@movar/page-content': minor
---

page-content: cover YouTube's polymer→wiz "view-model" migration and the channel Posts surface.

Three main surfaces had silently stopped extracting: watch-sidebar recommendations and the /results Mix card are `yt-lockup-view-model` now, the Shorts shelf is `grid-shelf-view-model` with `ytm-shorts-lockup-view-model` tiles (desktop AND mobile), and m.youtube.com tiles lost their `[id="video-title"]` anchor. Both markup generations are covered: classic shapes gain an `h3` fallback consulted only when the classic anchors yield nothing, view-model cards classify on their single `<h3>` title alone (the byline bakes channel names together with UI-language view-count/date chrome), kind resolves per element (collection thumbnail → playlist, shorts-less grid shelf → shelf), and a Google-style outermost-wins dedup collapses nested cards onto the unit the user sees. The channel Posts surface (`ytd-backstage-post-renderer`) is modelled with the reserved `post` kind, sampling `#content-text` alone. Real-capture corpus fixtures pin every new surface with classifier-verified verdicts.

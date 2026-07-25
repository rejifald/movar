---
'@movar/host-match': patch
---

host-match: strip a trailing dot from FQDN hostnames so `isGoogleHost`/`isYouTubeHost` match `google.com.` and `youtube.com.` (previously the content-script site rule and model chunk silently no-op'd on trailing-dot hosts). Closes #295.

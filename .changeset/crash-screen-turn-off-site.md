---
'@movar/extension': patch
---

Let the popup's crash screen turn Movar off for the current site. The crash screen previously offered only a Reload button, leaving no way out if reloading didn't fix the crash short of digging through the browser's extension settings. It now offers "Turn off for this site" — and the exemption lasts only until Movar's next update, after which the site is automatically retried, so a since-fixed crash doesn't leave the site disabled forever. The popup's messaging distinguishes this temporary "off until update" state from a permanent exemption set in settings.

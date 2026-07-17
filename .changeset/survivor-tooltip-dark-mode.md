---
'@movar/extension': patch
---

Fix dark-mode styling of the tooltip shown on a language-switcher link that survived filtering. In dark mode the tooltip card blended into the page background and its "Show hidden options" button rendered in light-mode colors, making it nearly invisible; it now has proper dark styling matching the rest of Movar's dark-mode UI.

function show(platform, enabled, useSettingsInsteadOfPreferences) {
  document.body.classList.add(`platform-${platform}`);

  // macOS 12 and earlier called the pane "Safari Preferences", not "Settings".
  // Each localized Main.html carries its own legacy wording in data-legacy, so
  // this swap stays correct in every language.
  if (useSettingsInsteadOfPreferences === false) {
    for (const element of document.querySelectorAll('[data-legacy]')) {
      element.textContent = element.dataset.legacy;
    }
  }

  // "On" is the only distinct state. Anything else — not yet enabled, or still
  // unknown — shows the same setup instructions, because the action is
  // identical: turn Movar on in Safari. (`enabled` is undefined on iOS.)
  document.body.classList.toggle('state-on', enabled === true);
}

function openPreferences() {
  webkit.messageHandlers.controller.postMessage('open-preferences');
}

document.querySelector('button.open-preferences').addEventListener('click', openPreferences);

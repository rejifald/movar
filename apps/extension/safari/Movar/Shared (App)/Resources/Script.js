function show(platform, enabled, useSettingsInsteadOfPreferences) {
  document.body.classList.add(`platform-${platform}`);

  // ViewController.swift passes `useSettingsInsteadOfPreferences=false` on
  // macOS 12 and earlier (where the Safari Settings → Extensions UI was
  // still labelled "Safari Preferences"). The Main.html copy assumes the
  // modern "Settings" wording, so flip it back to the legacy label here.
  if (useSettingsInsteadOfPreferences === false) {
    document.getElementsByClassName('platform-mac state-on')[0].innerText =
      'Movar is on. Manage it in Safari → Preferences → Extensions.';
    document.getElementsByClassName('platform-mac state-off')[0].innerText =
      'Movar is off. Turn it back on in Safari → Preferences → Extensions.';
    document.getElementsByClassName('platform-mac state-unknown')[0].innerText =
      'Turn on Movar in Safari → Preferences → Extensions.';
    document.getElementsByClassName('platform-mac open-preferences')[0].innerText =
      'Quit and Open Safari Preferences…';
  }

  if (typeof enabled === 'boolean') {
    document.body.classList.toggle(`state-on`, enabled);
    document.body.classList.toggle(`state-off`, !enabled);
  } else {
    document.body.classList.remove(`state-on`);
    document.body.classList.remove(`state-off`);
  }
}

function openPreferences() {
  webkit.messageHandlers.controller.postMessage('open-preferences');
}

document.querySelector('button.open-preferences').addEventListener('click', openPreferences);

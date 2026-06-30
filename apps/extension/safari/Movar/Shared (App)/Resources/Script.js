/*
 * Host-app screen behaviour. Runs in a WKWebView (ViewController.swift) under a
 * `default-src 'self'` CSP. Jobs:
 *   1. show()        — platform/enabled reveal, called by Swift after load.
 *   2. tabs          — Detector / Settings / About switching.
 *   3. detector      — local UA/RU detection via window.Movar (movar-app.js).
 *   4. settings      — reads/writes MovarSettings through the native bridge into
 *      the shared App Group; the extension reconciles it.
 *
 * window.Movar is the pre-bundled shared logic — the detector
 * (@movar/lang-detect), the settings schema (@movar/settings), AND the
 * extension's own i18n (messagesEn/messagesUk + makeLanguageDisplay). The
 * settings panel's copy comes straight from that i18n (data-i18n = message
 * path), so the host app and the extension can't drift; only host-specific
 * strings (the detector, the enabled toggle) live here.
 */
(function () {
  'use strict';

  /** @type {any} */
  var M = window.Movar;
  var locale = document.documentElement.lang === 'uk' ? 'uk' : 'en';

  // The extension's translated message catalogue for this locale, plus its
  // language-endonym resolver — both straight from the bundle. Null only if
  // movar-app.js failed to load (then the panel stays hidden, the tool errors).
  var messages = M ? (locale === 'uk' ? M.messagesUk : M.messagesEn) : null;
  var displayName =
    M && typeof M.makeLanguageDisplay === 'function'
      ? M.makeLanguageDisplay(locale)
      : function (code) {
          return code;
        };

  // Host-only strings (no equivalent in the extension i18n): the detector
  // verdicts and the host's "enabled" master switch.
  var HOST = {
    en: {
      enabledLabel: 'Movar enabled',
      enabledHelp: 'Master switch for all language steering.',
      notDetected: 'No Cyrillic language detected',
      unavailable: 'Language detection is unavailable.',
    },
    uk: {
      enabledLabel: 'Movar увімкнено',
      enabledHelp: 'Головний перемикач усього керування мовою.',
      notDetected: 'Кириличну мову не виявлено',
      unavailable: 'Визначення мови недоступне.',
    },
  };
  var T = HOST[locale];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Walk the extension message catalogue by dot path, e.g. 'options.priority.title'. */
  function msg(path) {
    if (!messages) return undefined;
    return path.split('.').reduce(function (obj, key) {
      return obj == null ? undefined : obj[key];
    }, messages);
  }

  // ---------------------------------------------------------------------------
  // Platform reveal — unchanged contract with Swift: show('ios') /
  // show('mac', enabled, useSettingsInsteadOfPreferences).
  // ---------------------------------------------------------------------------
  function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add('platform-' + platform);

    // macOS 12 and earlier called the pane "Safari Preferences", not "Settings".
    // Each localized Main.html carries its own legacy wording in data-legacy.
    if (useSettingsInsteadOfPreferences === false) {
      var legacy = document.querySelectorAll('[data-legacy]');
      for (var i = 0; i < legacy.length; i++) {
        legacy[i].textContent = legacy[i].dataset.legacy;
      }
    }

    // "On" is the only distinct state; anything else shows the same setup banner.
    document.body.classList.toggle('state-on', enabled === true);
  }
  window.show = show;

  // ---------------------------------------------------------------------------
  // Native bridge. The web layer can't touch the App Group directly, so it posts
  // to the `controller` WKScriptMessageHandler (ViewController.swift) and awaits
  // a reply delivered via window.__movarReply(id, json). Absent outside the app
  // (e.g. a plain browser) — callNative resolves undefined so the page still
  // renders with defaults.
  // ---------------------------------------------------------------------------
  var hasBridge =
    typeof webkit !== 'undefined' &&
    webkit &&
    webkit.messageHandlers &&
    webkit.messageHandlers.controller;

  var seq = 0;
  var pending = new Map();

  window.__movarReply = function (id, json) {
    var resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    var value;
    try {
      value = json == null || json === '' ? null : JSON.parse(json);
    } catch (e) {
      value = null;
    }
    resolve(value);
  };

  function callNative(type, payload) {
    if (!hasBridge) return Promise.resolve(undefined);
    return new Promise(function (resolve) {
      var id = ++seq;
      pending.set(id, resolve);
      webkit.messageHandlers.controller.postMessage({
        type: type,
        id: id,
        payload: payload === undefined ? null : payload,
      });
      // A dropped reply must not wedge the form forever.
      setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          resolve(undefined);
        }
      }, 4000);
    });
  }

  // "Open Safari Settings" (macOS) — fire-and-forget.
  function openPreferences() {
    callNative('open-preferences');
  }
  var prefButtons = document.querySelectorAll('button.open-preferences');
  for (var b = 0; b < prefButtons.length; b++) {
    prefButtons[b].addEventListener('click', openPreferences);
  }

  // ===========================================================================
  // Tabs — Detector / Settings / About
  // ===========================================================================
  (function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    if (tabs.length === 0) return;

    function activate(name, focus) {
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        var on = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
        if (on && focus) tab.focus();
      }
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        activate(tab.dataset.tab, false);
      });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          next = tabs[(index + 1) % tabs.length];
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          next = tabs[(index - 1 + tabs.length) % tabs.length];
        }
        if (next) {
          e.preventDefault();
          activate(next.dataset.tab, true);
        }
      });
    });
  })();

  // ===========================================================================
  // Detector
  // ===========================================================================
  (function initTool() {
    var input = document.getElementById('tool-input');
    var result = document.getElementById('tool-result');
    var run = document.getElementById('tool-run');
    var clear = document.getElementById('tool-clear');
    if (!input || !result || !run || !clear) return;

    function render() {
      var text = input.value;
      if (!text || !text.trim()) {
        result.hidden = true;
        result.textContent = '';
        return;
      }
      // No bundle (movar-app.js failed to load) — fail honestly.
      if (!M || typeof M.detectCyrillicLanguage !== 'function') {
        result.hidden = false;
        result.className = 'tool-result is-unknown';
        result.textContent = T.unavailable;
        return;
      }

      // The detector is a Cyrillic letter-signal classifier — it names the
      // language it recognises (uk/ru/be) or reports nothing for Latin/other.
      var v = M.detectCyrillicLanguage(text);
      var verdict, cls;
      if (v.language === 'unknown') {
        verdict = T.notDetected;
        cls = 'is-unknown';
      } else {
        var name = displayName(v.language);
        verdict = name.charAt(0).toUpperCase() + name.slice(1);
        cls = v.language === 'uk' ? 'is-uk' : v.language === 'ru' ? 'is-ru' : 'is-other';
      }

      result.hidden = false;
      result.className = 'tool-result ' + cls;
      result.textContent = '';

      var head = el('div', 'result-verdict');
      head.appendChild(el('span', 'result-dot'));
      head.appendChild(el('span', null, verdict));
      result.appendChild(head);
    }

    var debounce = null;
    input.addEventListener('input', function () {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(render, 150);
    });
    run.addEventListener('click', render);
    clear.addEventListener('click', function () {
      input.value = '';
      result.hidden = true;
      result.textContent = '';
      input.focus();
    });
  })();

  // ===========================================================================
  // Settings
  // ===========================================================================
  (function initPanel() {
    var panel = document.getElementById('panel');
    if (!panel || !M || typeof M.migrateSettings !== 'function' || !messages) return;

    var enabledEl = document.getElementById('set-enabled');
    var priorityEl = document.getElementById('set-priority');
    var contentEl = document.getElementById('set-content');
    var concealField = document.getElementById('conceal-field');
    var concealEl = document.getElementById('set-conceal');
    var allowInput = document.getElementById('allow-input');
    var allowAdd = document.getElementById('allow-add');
    var allowlistEl = document.getElementById('set-allowlist');
    var lockedNote = document.getElementById('locked-note-text');

    /** @type {any} */
    var state = M.defaultSettings;

    // Static labels: data-i18n from the extension catalogue, data-host from HOST.
    function fillLabels() {
      var i18nNodes = panel.querySelectorAll('[data-i18n]');
      for (var i = 0; i < i18nNodes.length; i++) {
        var val = msg(i18nNodes[i].getAttribute('data-i18n'));
        if (typeof val === 'string') i18nNodes[i].textContent = val;
      }
      var hostNodes = panel.querySelectorAll('[data-host]');
      for (var j = 0; j < hostNodes.length; j++) {
        var hv = T[hostNodes[j].getAttribute('data-host')];
        if (typeof hv === 'string') hostNodes[j].textContent = hv;
      }
      var inputLabel = msg('options.allowlist.inputLabel');
      if (typeof inputLabel === 'string') allowInput.setAttribute('aria-label', inputLabel);
      // Russian-is-locked note: the extension's lockedHint, sentence-cased.
      var hint = messages.options.blocked.lockedHint(displayName('ru'));
      lockedNote.textContent = hint.charAt(0).toUpperCase() + hint.slice(1);
    }

    function persist() {
      state = M.enforceLockedLanguages(state);
      callNative('writeSettings', state);
    }

    function renderPriority() {
      priorityEl.textContent = '';
      var list = state.priority;
      var P = messages.options.priority;
      list.forEach(function (code, index) {
        var name = displayName(code);
        var li = el('li', 'priority-item');
        li.appendChild(el('span', 'priority-rank', String(index + 1)));
        li.appendChild(el('span', 'priority-name', name));

        var moves = el('span', 'priority-moves');
        var up = el('button', 'move', '↑');
        up.type = 'button';
        up.setAttribute('aria-label', P.moveUp(name));
        up.disabled = index === 0;
        up.addEventListener('click', function () {
          swap(index, index - 1);
        });
        var down = el('button', 'move', '↓');
        down.type = 'button';
        down.setAttribute('aria-label', P.moveDown(name));
        down.disabled = index === list.length - 1;
        down.addEventListener('click', function () {
          swap(index, index + 1);
        });
        moves.appendChild(up);
        moves.appendChild(down);
        li.appendChild(moves);
        priorityEl.appendChild(li);
      });
    }

    function swap(a, b) {
      var next = state.priority.slice();
      var tmp = next[a];
      next[a] = next[b];
      next[b] = tmp;
      state = Object.assign({}, state, { priority: next });
      renderPriority();
      persist();
    }

    function renderAllowlist() {
      allowlistEl.textContent = '';
      var list = state.allowlist;
      var A = messages.options.allowlist;
      if (list.length === 0) {
        allowlistEl.appendChild(el('li', 'chips-empty', A.empty));
        return;
      }
      list.forEach(function (domain) {
        var li = el('li', 'chip removable');
        li.appendChild(el('span', null, domain));
        var rm = el('button', 'chip-remove');
        rm.type = 'button';
        rm.setAttribute('aria-label', A.remove(domain));
        var ico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ico.setAttribute('class', 'ico');
        ico.setAttribute('aria-hidden', 'true');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#ic-x');
        ico.appendChild(use);
        rm.appendChild(ico);
        rm.addEventListener('click', function () {
          state = Object.assign({}, state, {
            allowlist: state.allowlist.filter(function (d) {
              return d !== domain;
            }),
          });
          renderAllowlist();
          persist();
        });
        li.appendChild(rm);
        allowlistEl.appendChild(li);
      });
    }

    function addDomain() {
      var raw = (allowInput.value || '').trim().toLowerCase();
      allowInput.value = '';
      if (!raw) return;
      // Mirror coerceDomainList: strip an accidental scheme/path, dedupe.
      raw = raw.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '');
      if (!raw || state.allowlist.indexOf(raw) !== -1) return;
      state = Object.assign({}, state, { allowlist: state.allowlist.concat([raw]) });
      renderAllowlist();
      persist();
    }

    function syncConcealVisibility() {
      concealField.hidden = !state.contentModification;
    }

    function renderAll() {
      enabledEl.checked = state.enabled;
      contentEl.checked = state.contentModification;
      var radios = concealEl.querySelectorAll('input[type=radio]');
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = radios[i].value === state.concealMode;
      }
      syncConcealVisibility();
      renderPriority();
      renderAllowlist();
    }

    enabledEl.addEventListener('change', function () {
      state = Object.assign({}, state, { enabled: enabledEl.checked });
      persist();
    });
    contentEl.addEventListener('change', function () {
      state = Object.assign({}, state, { contentModification: contentEl.checked });
      syncConcealVisibility();
      persist();
    });
    concealEl.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.name !== 'conceal') return;
      state = Object.assign({}, state, { concealMode: t.value });
      persist();
    });
    allowAdd.addEventListener('click', addDomain);
    allowInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDomain();
      }
    });

    fillLabels();

    // Load current values from the App Group (defaults when none/standalone),
    // then reveal the panel. migrateSettings tolerates null/partial input.
    callNative('readSettings').then(function (res) {
      var raw = res && res.settings ? res.settings : M.defaultSettings;
      state = M.enforceLockedLanguages(M.migrateSettings(raw));
      renderAll();
      panel.hidden = false;
    });
  })();
})();

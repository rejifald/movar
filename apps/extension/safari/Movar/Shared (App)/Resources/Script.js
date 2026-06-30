/*
 * Host-app screen behaviour. Runs in a WKWebView (ViewController.swift) under a
 * `default-src 'self'; font-src 'self' data:` CSP. Jobs:
 *   1. show()        — platform/enabled reveal, called by Swift after load.
 *   2. tabs          — Detector / Settings / About switching.
 *   3. detector      — local UA/RU/BE detection via window.Movar (movar-app.js).
 *   4. settings      — reads/writes MovarSettings through the native bridge into
 *      the shared App Group; the extension reconciles it.
 *
 * window.Movar is the pre-bundled shared logic — the detector
 * (@movar/lang-detect), the settings schema (@movar/settings), AND the
 * extension's own i18n (messagesEn/messagesUk + makeLanguageDisplay). The
 * settings panel's copy comes straight from that i18n (data-i18n = message
 * path), so the host app and the extension can't drift; only host-specific
 * strings (the detector verdicts, the enabled toggle) live here.
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
  // verdicts/signal and the host's "enabled" master switch.
  var HOST = {
    en: {
      enabledLabel: 'Movar enabled',
      enabledHelp: 'Master switch for all language steering.',
      notDetected: 'No Cyrillic language detected',
      ambiguous: 'Mixed signals — no clear language',
      unavailable: 'Language detection is unavailable.',
      evidence: 'Evidence',
      closestMatch: 'closest match',
      nativeName: 'Native name',
      matchedBy: 'Matched by',
      // Which rung of the classifier produced the verdict — keyed by SnippetVerdict.rung.
      matched: {
        1: 'distinctive letters',
        '2a': 'function words',
        '2b': 'common words',
        3: 'letter patterns',
      },
      // Same levels, nominative case for use as standalone clue labels.
      clueLabels: {
        1: 'Distinctive letters',
        '2a': 'Function words',
        '2b': 'Common words',
        3: 'Letter patterns',
      },
    },
    uk: {
      enabledLabel: 'Movar увімкнено',
      enabledHelp: 'Головний перемикач усього керування мовою.',
      notDetected: 'Кириличну мову не виявлено',
      ambiguous: 'Змішані сигнали — мова нечітка',
      unavailable: 'Визначення мови недоступне.',
      evidence: 'Ознаки',
      closestMatch: 'найближчий збіг',
      nativeName: 'Власна назва',
      matchedBy: 'Визначено за',
      matched: {
        1: 'характерними літерами',
        '2a': 'функційними словами',
        '2b': 'частотними словами',
        3: 'буквосполученнями',
      },
      // Same levels, nominative case for use as standalone clue labels.
      clueLabels: {
        1: 'Характерні літери',
        '2a': 'Функційні слова',
        '2b': 'Частотні слова',
        3: 'Буквосполучення',
      },
    },
  };
  var T = HOST[locale];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Build an inline <svg class="ico"><use href="#id" /></svg>. */
  function icon(id, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', cls || 'ico');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  /** Title-case the first letter (language endonyms come back lower-cased). */
  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Endonym — a language's name in its own language (e.g. 'uk' → 'українська'). */
  function endonymOf(code) {
    if (M && typeof M.makeLanguageDisplay === 'function') {
      try {
        return M.makeLanguageDisplay(code)(code);
      } catch (e) {
        /* fall through */
      }
    }
    return code;
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
      // Jump back to the top whenever the surface changes (the body scrolls).
      window.scrollTo(0, 0);
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
    if (!input || !result || !run) return;

    // The verdict comes from the full rung classifier (classifyBySnippet) scoped
    // to the Cyrillic candidates — the same ladder the extension runs: distinctive
    // letters → function words → frequent words → franc trigrams.
    var CANDIDATES = M && M.PROFILES ? [M.PROFILES.uk, M.PROFILES.ru, M.PROFILES.be] : null;

    // Distinctive Cyrillic letters per language — mirrors langtell/cyrillic's own
    // rung-1 sets. Each is exclusive to one language, so a hit is a clue on its own.
    var SIGNAL_SETS = { uk: /[іїєґ]/gi, ru: /[ыё]/gi, be: /ў/gi };
    var SIGNAL_ORDER = ['uk', 'ru', 'be'];

    // Discriminating word sets per tier: words in one candidate's list that no
    // other candidate shares. (The lists overlap on common Cyrillic words, which
    // point to no single language — only the exclusive ones are real clues.)
    function discriminatingSets(tier) {
      var lists = SIGNAL_ORDER.map(function (_code, i) {
        var p = CANDIDATES[i];
        return (p && p.words && p.words[tier]) || [];
      });
      var sets = lists.map(function (l) {
        return new Set(l);
      });
      return lists.map(function (own, i) {
        return new Set(
          own.filter(function (w) {
            for (var j = 0; j < sets.length; j++) {
              if (j !== i && sets[j].has(w)) return false;
            }
            return true;
          }),
        );
      });
    }
    var FUNCTION_SETS = CANDIDATES ? discriminatingSets('function') : null;
    var FREQUENT_SETS = CANDIDATES ? discriminatingSets('frequent') : null;

    function tokenize(text) {
      return text.toLowerCase().match(/[\p{L}́]+/gu) || [];
    }

    /** Words from `set` present in `tokens`, de-duped, capped at `limit`. */
    function wordsFound(tokens, set, limit) {
      var seen = {};
      var out = [];
      for (var i = 0; i < tokens.length && out.length < limit; i++) {
        var t = tokens[i];
        if (set.has(t) && !seen[t]) {
          seen[t] = true;
          out.push(t);
        }
      }
      return out;
    }

    /** Unique distinctive letters of `code` found in `text`. */
    function lettersFound(text, code) {
      var hits = text.match(SIGNAL_SETS[code]) || [];
      var seen = {};
      var out = [];
      hits.forEach(function (ch) {
        var l = ch.toLowerCase();
        if (!seen[l]) {
          seen[l] = true;
          out.push(l);
        }
      });
      return out;
    }

    // Run every level and collect each language's clues — distinctive letters,
    // function words, frequent words, and (the franc layer) whether its letter
    // patterns are the closest match. Languages with no clue are dropped.
    function gatherClues(text) {
      var tokens = tokenize(text);
      var francPick = null;
      try {
        var fv = M.francResidualVerdict ? M.francResidualVerdict(text, CANDIDATES) : null;
        if (fv && fv.language && fv.language !== 'unknown') francPick = fv.language;
      } catch (e) {
        /* franc unavailable — skip the letter-patterns clue */
      }
      return SIGNAL_ORDER.map(function (code, i) {
        var clue = {
          code: code,
          letters: lettersFound(text, code),
          functionWords: FUNCTION_SETS ? wordsFound(tokens, FUNCTION_SETS[i], 6) : [],
          frequentWords: FREQUENT_SETS ? wordsFound(tokens, FREQUENT_SETS[i], 6) : [],
          franc: francPick === code,
        };
        clue.has =
          clue.letters.length > 0 ||
          clue.functionWords.length > 0 ||
          clue.frequentWords.length > 0 ||
          clue.franc;
        return clue;
      }).filter(function (c) {
        return c.has;
      });
    }

    // Verdict head — circular badge, then the language name + ISO code on one
    // line and, below, the native name (endonym) under a "Native name" label.
    function buildHead(tone, iconId, verdict, code) {
      var head = el('div', 'result-head');
      var badge = el('div', 'badge' + (tone ? ' ' + tone : ''));
      badge.appendChild(icon(iconId));
      head.appendChild(badge);

      var textBox = el('div', 'result-text');
      if (code) {
        var nameRow = el('div', 'result-name-row');
        nameRow.appendChild(el('span', 'result-verdict', verdict));
        nameRow.appendChild(el('span', 'result-code', code));
        textBox.appendChild(nameRow);

        // Native name — only when the endonym differs from the displayed name
        // (e.g. nothing to add when the UI is already in that language).
        var endo = endonymOf(code);
        if (endo && endo.toLowerCase() !== verdict.toLowerCase()) {
          var native = el('div', 'result-native');
          native.appendChild(el('span', 'result-native-label', T.nativeName));
          var value = el('span', 'result-native-value', endo);
          value.setAttribute('lang', code);
          native.appendChild(value);
          textBox.appendChild(native);
        }
      } else {
        textBox.appendChild(el('span', 'result-verdict', verdict));
      }
      head.appendChild(textBox);
      return head;
    }

    // "Matched by <layer>" — which rung of the classifier produced the verdict
    // (distinctive letters / function words / common words / franc trigrams).
    function buildMethod(rung) {
      var label = T.matched[rung];
      if (!label) return null;
      var p = el('p', 'result-method');
      p.appendChild(el('span', 'result-method-by', T.matchedBy + ' '));
      p.appendChild(el('span', 'result-method-layer', label));
      return p;
    }

    // Evidence report — for each matched language, the clues found at each level.
    // Only languages with a clue appear; the verdict's block is highlighted.
    function buildClues(clues, detectedCode) {
      var box = el('div', 'clues');
      box.appendChild(el('span', 'eyebrow', T.evidence));
      clues.forEach(function (c) {
        var block = el(
          'div',
          'clue-lang is-' + c.code + (c.code === detectedCode ? ' is-detected' : ''),
        );
        var head = el('div', 'clue-head');
        head.appendChild(el('span', 'clue-name', cap(displayName(c.code))));
        head.appendChild(el('span', 'result-code', c.code));
        block.appendChild(head);

        function clueRow(rung, valueNode) {
          var r = el('div', 'clue-row');
          r.appendChild(el('span', 'clue-label', T.clueLabels[rung]));
          r.appendChild(valueNode);
          block.appendChild(r);
        }
        // Token clues — literal fragments found in the text, shown as chips.
        function tokens(list, mono) {
          var wrap = el('span', 'clue-tokens');
          list.forEach(function (tok) {
            wrap.appendChild(el('span', 'clue-token' + (mono ? ' mono' : ''), tok));
          });
          return wrap;
        }
        if (c.letters.length) clueRow(1, tokens(c.letters, true));
        if (c.functionWords.length) clueRow('2a', tokens(c.functionWords, false));
        if (c.frequentWords.length) clueRow('2b', tokens(c.frequentWords, false));
        // Letter patterns — a verdict, not a fragment from the text; render it as
        // a checked status so it doesn't read like the token chips above.
        if (c.franc) {
          var verdict = el('span', 'clue-verdict');
          verdict.appendChild(icon('ic-check'));
          verdict.appendChild(el('span', null, T.closestMatch));
          clueRow(3, verdict);
        }
        box.appendChild(block);
      });
      return box;
    }

    function render() {
      var text = input.value;
      if (!text || !text.trim()) {
        result.hidden = true;
        result.textContent = '';
        return;
      }
      result.hidden = false;
      result.textContent = '';

      // No bundle (movar-app.js failed to load) — fail honestly.
      if (!M || typeof M.classifyBySnippet !== 'function' || !CANDIDATES) {
        result.className = 'tool-result';
        result.appendChild(buildHead('', 'ic-info', T.unavailable, null));
        return;
      }

      // Verdict from the full rung ladder (short-circuits at the first confident
      // rung); `rung` says which one. Clues are gathered separately by running
      // every level, so the report can show evidence the verdict didn't rely on.
      var v = M.classifyBySnippet(text, CANDIDATES, M.francRung3Resolver);
      var clues = gatherClues(text);
      var detected = v.language !== 'unknown';
      var tone = v.language === 'uk' ? 'is-accent' : v.language === 'ru' ? 'is-danger' : '';
      var verdict = detected
        ? cap(displayName(v.language))
        : clues.length > 0
          ? T.ambiguous
          : T.notDetected;

      result.className = 'tool-result ' + (detected ? 'is-' + v.language : 'is-unknown');
      result.appendChild(
        buildHead(
          tone,
          detected ? 'ic-check' : 'ic-languages',
          verdict,
          detected ? v.language : null,
        ),
      );

      // Which layer decided — the evidence of *how* (surfaces function words / franc).
      if (detected) {
        var method = buildMethod(v.rung);
        if (method) result.appendChild(method);
      }

      // Clues from every level, for each language that matched.
      if (clues.length) {
        result.appendChild(buildClues(clues, v.language));
      }
    }

    var debounce = null;
    input.addEventListener('input', function () {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(render, 150);
    });
    run.addEventListener('click', render);
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

    /** @type {any} */
    var state = M.defaultSettings;

    // Static labels: data-i18n from the extension catalogue, data-host from HOST.
    function fillLabels() {
      var i18nNodes = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < i18nNodes.length; i++) {
        var val = msg(i18nNodes[i].getAttribute('data-i18n'));
        if (typeof val === 'string') i18nNodes[i].textContent = val;
      }
      var hostNodes = document.querySelectorAll('[data-host]');
      for (var j = 0; j < hostNodes.length; j++) {
        var hv = T[hostNodes[j].getAttribute('data-host')];
        if (typeof hv === 'string') hostNodes[j].textContent = hv;
      }
      var inputLabel = msg('options.allowlist.inputLabel');
      if (typeof inputLabel === 'string') allowInput.setAttribute('aria-label', inputLabel);
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
        var li = el('li', 'lang-row' + (index === 0 ? ' is-primary' : ''));
        li.appendChild(el('span', 'lang-ord', String(index + 1)));
        li.appendChild(el('span', 'lang-name', cap(name)));

        var moves = el('span', 'lang-moves');
        var up = el('button', 'icon-btn');
        up.type = 'button';
        up.setAttribute('aria-label', P.moveUp(name));
        up.appendChild(icon('ic-chevron-up'));
        up.disabled = index === 0;
        up.addEventListener('click', function () {
          swap(index, index - 1);
        });
        var down = el('button', 'icon-btn');
        down.type = 'button';
        down.setAttribute('aria-label', P.moveDown(name));
        down.appendChild(icon('ic-chevron-down'));
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
        var li = el('li', 'chip');
        li.appendChild(el('span', null, domain));
        var rm = el('button', 'chip-remove');
        rm.type = 'button';
        rm.setAttribute('aria-label', A.remove(domain));
        rm.appendChild(icon('ic-x'));
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

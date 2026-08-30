---
type: research
id: movna-hihiiena-research
status: reference
date: '2026-08-13'
summary: >-
  Verified settings inventory behind the «Мовна гігієна» guide
  (movna-hihiiena.plan.md): every known surface where a user declares their
  language — Google, browsers, operating systems, keyboards, and popular
  apps — with current (2025-2026) menu paths, traps, verification steps, and
  official sources. Gathered 2026-08-13 by four parallel research agents
  against official vendor help pages; claims that could not be verified from
  official docs are flagged inline and collected in the closing checklist.
---

# «Мовна гігієна» — verified settings inventory

Target state for every surface: **Ukrainian first, English second, Russian
removed** (not demoted — presence at any priority still lets a site pick it).
Each finding cites the official page it was verified against. Items the
official docs do not confirm are flagged in their _Gotchas_ and repeated in
[Must re-verify before publishing](#must-re-verify-before-publishing).

## Google surfaces

### Google Account-wide language (myaccount.google.com)

- **Set:** Preferred language = Українська (uk) FIRST; add English as second via '+ Add another language'; remove Russian if present, including any 'Added for you' auto-detected entry, and disable the auto-add feature.
- **Steps:** myaccount.google.com/language → Language → Edit (pencil) → pick Українська; '+ Add another language' → English. Delete unwanted entries from the list.
- **Gotchas:** Applies to 'Google services on the web only' — mobile apps follow the device language, changes do not sync to apps. Google can silently re-add a language it sees you use ('Added for you'): if you keep reading Russian pages, Russian can reappear in this list — the auto-detection can be disabled on the same page. The help article does not explicitly document reordering; in practice the first/'Preferred language' entry is the one that wins, so make sure Ukrainian is the top entry, not just present.
- **Impact:** The single broadest switch: sets the default UI language for Google web services (Search UI, Docs, Drive, etc.) and feeds the 'show your content and results in one or more of your preferred languages' signal.
- **Verify:** Reload google.com — footer and buttons should be Ukrainian; open Drive/Docs and check menus.
- **Sources:** https://support.google.com/accounts/answer/32047

### Google Search: display language

- **Set:** Display language = Українська.
- **Steps:** google.com/preferences (Search settings) → left panel 'Languages' → 'Display language' → select Українська → Confirm.
- **Gotchas:** The article states explicitly: 'This doesn't change the language of your search results' — it only changes buttons/interface. People change this and think results are fixed; results are governed by the Results Language Filter plus ranking signals (see next finding). Note the old help URL support.google.com/websearch/answer/173424 is dead (404) — the topic was split into 'Change your display language' (3333234) and 'Results Language Filter' (13485060).
- **Impact:** UI language of Search, and one of the signals Google weighs when picking result language.
- **Verify:** Google Search page chrome (Знайти, Налаштування, etc.) renders in Ukrainian.
- **Sources:** https://support.google.com/websearch/answer/3333234?co=GENIE.Platform%3DDesktop

### Google Search: results language — the 'Results Language Filter' (this IS the current results-language control, 2025-2026)

- **Set:** Results Language Filter = Українська (consider Ukrainian ONLY, not Ukrainian+English — see gotcha).
- **Steps:** Desktop: Search settings → Languages → under 'Results Language Filter' click Edit → select languages → Confirm. Mobile (Google app): Profile picture → Settings → Language & region → Search language. Ad-hoc per query: Tools menu on the results page → 'Any language' → pick language.
- **Gotchas:** Multiple selections are a UNION, not a priority order: 'if you set the filter to French, Indonesian and Arabic, it will filter results to show all of those languages' — so uk+en means English results still flood in; set the filter to Ukrainian only when you want Ukrainian to win, and drop to 'Any language' via Tools when you genuinely need English. Also: 'The Results Language Filter won't appear if the only selected language is English', and 'Language filtering may not work for some search features or if the language can't be detected.' Separately, Google documents that result language is decided by weighing query language, display language, device language and location together — the language you TYPE the query in is a first-class signal ('It tells Google if you want results in a different language than the one set up in your language settings').
- **Impact:** This is the only direct 'give me results in language X' control left in Search; the old results-language checkbox list from the classic preferences page is gone, replaced by this filter.
- **Verify:** Search a language-neutral term (e.g. a city name) and check results are Ukrainian-language pages; open Tools on the results page — it should show the active language filter.
- **Sources:** https://support.google.com/websearch/answer/13485060?co=GENIE.Platform%3DDesktop ; https://support.google.com/websearch/answer/13511324?co=GENIE.Platform%3DDesktop

### Google Search: region setting

- **Set:** Region for search results = Україна.
- **Steps:** Desktop: google.com/preferences → 'Region Settings' → pick region → Save. Android (Google app): Profile picture → Settings → Language & region → Search region.
- **Gotchas:** Region ≠ language: it customizes results 'for a specific country' (ranking/localization of sources), it does not itself force Ukrainian-language pages. If the detected search location is wrong, the region setting alone may not fix it — the article points to a separate location-settings fix. 'If you don't find a region, the feature isn't available for that location.'
- **Impact:** Makes Ukrainian sources rank as local: combined with Ukrainian query/filter it strongly biases toward .ua / Ukraine-origin results instead of US/English or Russian ones.
- **Verify:** Search a news-y term; local Ukrainian outlets should dominate. Check google.com/preferences shows Україна selected.
- **Sources:** https://support.google.com/websearch/answer/873?co=GENIE.Platform%3DDesktop ; https://support.google.com/websearch/answer/873 (Android variant)

### Google Search: hl= / lr= / gl= / cr= URL parameters

- **Set:** For hand-built links or a browser custom search engine: hl=uk (interface language), lr=lang_uk (restrict results to Ukrainian documents), gl=ua (boost Ukraine-origin results), cr=countryUA (hard-restrict to Ukraine-origin).
- **Steps:** Append to the search URL, e.g. https://www.google.com/search?q=QUERY&hl=uk&lr=lang_uk&gl=ua — useful as the default search-engine template in a browser.
- **Gotchas:** These are officially documented only in the Programmable Search Engine (XML API) reference, not for the consumer google.com/search endpoint — they demonstrably work there today, but Google gives no compatibility promise, so flag them as power-user territory. Documented semantics: hl 'specifies the interface language (host language)' AND 'may affect XML search results, especially on international queries when language restriction (using the lr parameter) is not explicitly specified' — i.e. hl alone tilts result language; lr 'restricts search results to documents written in a particular language' (format lang_uk, supports boolean combinations); gl 'boosts search results whose country of origin matches' (two-letter code); cr restricts by country of origin (format countryUA).
- **Impact:** The only stateless way to force Ukrainian results — survives incognito, cookie clears, and other people's machines.
- **Verify:** Compare the same query with and without &lr=lang_uk in a private window.
- **Sources:** https://developers.google.com/custom-search/docs/xml_results

### Gmail display language

- **Set:** Gmail display language = Українська (web); device language governs the mobile app.
- **Steps:** Gmail web → Settings gear (top right) → 'See all settings' → General tab → 'Language' dropdown → Українська → 'Save Changes' at the bottom.
- **Gotchas:** This is a Gmail-local setting layered on top of the Google Account language; the help article does not document how the two interact — in practice changing the account language usually flips Gmail too, but the per-product dropdown is the authoritative one for Gmail web (unverified interaction — the official page is silent). The Gmail mobile app has no in-app language picker in this article; input tools 'can only be set up in your browser and not the Gmail app'. Assume the app follows the phone's (or Android 13+/iOS per-app) language.
- **Impact:** Mailbox UI, folder names, and Gmail's own strings.
- **Verify:** Reload Gmail — Вхідні instead of Inbox.
- **Sources:** https://support.google.com/mail/answer/17091

### YouTube language and location

- **Set:** Display Language = Українська; Location = Україна.
- **Steps:** Desktop: click Profile picture → 'Display Language' → Українська; Profile picture → 'Location' → Україна. Mobile (per the Android/iOS variants of the same article): Settings → Account → Language / Location — mobile path taken from Google's platform-switched article but not independently re-fetched, treat as likely-current.
- **Gotchas:** Two big non-controls, both stated by Google: (1) the language setting changes 'video metadata, like channel name and video title, when available, and Voice Search language', but 'audio, titles and descriptions may be served in a different language'; (2) the separate 'Preferred languages' (dubbing) setting 'does not impact your search results or video recommendations'. There is NO setting that forces the content language of recommendations — location 'impacts the videos that surface for: Recommendations, Charts, News', and beyond that the recommendation language follows watch/search behavior (watch Ukrainian content to teach it — behavioral advice, not from docs). Signed-out trap: 'The language settings are saved in the browser. If you ever clear your cache and cookies, you need to reset your language settings again.' Default fallback when region undetected is the United States.
- **Impact:** UI in Ukrainian, Ukraine charts/news surfaces; also stops auto-translated titles/dubs replacing Ukrainian originals if 'Preferred languages' includes Ukrainian.
- **Verify:** YouTube UI strings in Ukrainian; Trending/Charts shows Ukraine content; check profile menu shows Location: Україна.
- **Sources:** https://support.google.com/youtube/answer/87604?co=GENIE.Platform%3DDesktop ; https://support.google.com/youtube/answer/13339776

### Google Maps language

- **Set:** Desktop web: Language = Українська; region/domain = Україна. Android: set phone (or per-app, Android 13+) language to Ukrainian — no general in-app UI language setting is documented, only navigation voice. iPhone: iOS Settings → Google Maps → Language (standard iOS per-app mechanism; the iOS variant of the article was not independently fetched).
- **Steps:** Desktop: Maps → Menu → Language → Українська. Region: click the country name bottom-right → 'Region Settings' → pick country → Save. Android navigation voice: Profile picture → Settings → Navigation settings → Voice selection.
- **Gotchas:** Google's own caveat: after changing the language, 'Map labels will be shown in your country's local language, but you'll find place information in the language you selected' — street/city labels abroad stay in the local language by design; only the info panels follow your choice. 'By default, Maps uses your system's default language.' On Android the article documents no in-app UI language switch at all (only voice) — the app follows the system/per-app language, so the per-app Android 13+ setting is the real lever there (inference from 'system default language' statement, not an explicit doc).
- **Impact:** Place info, directions and UI in Ukrainian; Ukraine-appropriate domain and map view.
- **Verify:** Open a place card — description/hours labels in Ukrainian; bottom-right of desktop Maps shows Україна.
- **Sources:** https://support.google.com/maps/answer/63471?co=GENIE.Platform%3DDesktop ; https://support.google.com/maps/answer/63471?co=GENIE.Platform%3DAndroid

### Google News language & region (edition / ceid)

- **Set:** Language & region = Українська / Україна (this pair IS the 'edition'). Optionally add English/US as the second of the two allowed pairs.
- **Steps:** Desktop: news.google.com → Settings gear → 'Language & region' → pick. Mobile app: Profile picture → 'News settings' → 'Languages and regions of interest' — 'Pick up to 2 languages and places of interest.'
- **Gotchas:** Sign-in is mandatory: 'This feature is only available if you're signed in to your Google Account' — signed-out users historically lose this choice, which is why News is a notorious language-reset offender. The 2-slot limit means adding English costs you nothing but adding Russian 'to monitor' would consume the second slot and feed the feed — don't. URL-level: the edition is encoded as hl/gl/ceid, e.g. news.google.com/?hl=uk&gl=UA&ceid=UA:uk — ceid ('country:language' edition id) is Google-News-specific and NOT officially documented; keep all three consistent or you get an inconsistent/empty edition (third-party documentation only).
- **Impact:** Which national edition and article languages fill the whole News feed — the strongest per-product lever of all the Google surfaces.
- **Verify:** News masthead/sections in Ukrainian, Ukraine top stories; the URL after loading should carry ceid=UA:uk.
- **Sources:** https://support.google.com/googlenews/answer/7688469?co=GENIE.Platform%3DDesktop ; https://support.google.com/googlenews/answer/7688469?co=GENIE.Platform%3DAndroid ; (ceid: third-party only, e.g. https://www.wprssaggregator.com/google-news-rss-feed/)

### Chrome preferred languages (browser tie-in to served language)

- **Set:** Settings → Languages → 'Preferred languages': Українська on top, English second, Russian removed. Optionally 'Display Google Chrome in this language' for Ukrainian UI (Windows only).
- **Steps:** chrome://settings/languages → 'Add languages' if needed → per-language More (⋮) menu to reorder → on Windows, ⋮ next to Українська → 'Display Google Chrome in this language' → restart Chrome.
- **Gotchas:** Google's help states the effect on sites: 'If the page is in more than one language, it shows your preferred language first' — this is the Accept-Language mechanism, though the help article never names the header, and it does not explicitly promise anything about Google's own sites (signed-out Google leans on it plus the NID cookie; signed-in, the account language wins — the precedence is not documented anywhere official, flag as inference). Chrome UI language on macOS/Linux cannot be set in Chrome at all — it follows the OS language. The help article, oddly, only documents 'Move down' for reordering; the actual UI also has move-to-top options — a documented-vs-real-UI drift worth noting. Chrome Sync syncs settings between your Chromes but there is no official claim that Chrome language changes what Google serves a signed-in user.
- **Impact:** Every multilingual website (not just Google) picks its language from this list — this is the setting that fixes 'random sites greet me in Russian'.
- **Verify:** Visit a multilingual site signed-out (e.g. wikipedia.org portal, any big SaaS landing page) — it should offer Ukrainian; httpbin.org/headers shows the Accept-Language order.
- **Sources:** https://support.google.com/chrome/answer/173424?co=GENIE.Platform%3DDesktop

### Signed-out persistence (cookies) — do choices stick without an account?

- **Set:** Nothing to set — but know the mechanism: signed-out Search preferences live in the NID cookie, YouTube's in browser cookies (PREF/\_\_Secure-YNID family).
- **Steps:** No steps; make the settings above while signed out and they are written to cookies on that browser only.
- **Gotchas:** Google's cookie policy confirms NID 'is used to remember your preferences and other information, such as your preferred language, how many results you prefer... and whether you want SafeSearch turned on' and 'Each NID cookie expires 6 months from a user's last use' — so a signed-out choice survives about 6 months of inactivity, per browser, per profile, and dies on any cookie clear (YouTube says this outright: clear cache/cookies → 'you need to reset your language settings again'). Google News settings don't persist signed-out at all (sign-in required). Consequence for the article: recommend signing in for durability, or bookmark parameterized URLs (hl=uk&lr=lang_uk; ceid=UA:uk) as the clear-proof fallback.
- **Impact:** Explains why 'I set Ukrainian and it came back Russian/English after a cleanup' — the setting was cookie-borne.
- **Verify:** DevTools → Application → Cookies → google.com → NID present; clear it and watch the language preference reset.
- **Sources:** https://policies.google.com/technologies/cookies ; https://support.google.com/youtube/answer/87604?co=GENIE.Platform%3DDesktop

### The trap: removing Russian yields ENGLISH, not Ukrainian — what ordering makes Ukrainian win

- **Set:** Never just delete Russian — everywhere you remove it, install Ukrainian in FIRST position and English second, plus region = Ukraine.
- **Steps:** Order of operations that follows from Google's documented signals: 1) OS/device language → Ukrainian (mobile apps read this, per the Account help caveat); 2) Google Account language → Ukrainian first, English added second; 3) Search display language → Ukrainian AND Results Language Filter → Ukrainian; 4) Search region → Україна; 5) per-product overrides (Gmail, YouTube language+location, Maps, News edition); 6) Chrome preferred languages → uk, en. Then search in Ukrainian — query language is itself a ranking signal.
- **Gotchas:** Mechanism, from verified pieces: Google picks result language by weighing query language, display language, device language and location together; hl alone 'may affect results... when language restriction is not explicitly specified'; and undetectable-region users default to the US (YouTube states this explicitly). So a profile that merely LACKS Russian but has English display/device language and no region set resolves every signal to English — Ukrainian never entered the race. Removal is not preference; Ukrainian must be affirmatively first at each layer. Extra trap: the Results Language Filter set to uk+en is a union, so English still swamps Ukrainian — uk-only wins; and the filter control itself hides 'if the only selected language is English'. Extra trap #2: Google's 'Added for you' auto-detection can re-add Russian to the account list if you keep consuming Russian content.
- **Impact:** This is the article's core thesis paragraph: the reader's goal state (uk first, en second, ru gone) requires positive placement of Ukrainian, not just subtraction of Russian.
- **Verify:** Incognito test before/after: search a neutral term (e.g. 'рецепт борщу' vs 'borscht recipe') — with the full stack set, even Latin-script queries should start surfacing Ukrainian sources.
- **Sources:** https://support.google.com/websearch/answer/13511324?co=GENIE.Platform%3DDesktop ; https://developers.google.com/custom-search/docs/xml_results ; https://support.google.com/youtube/answer/87604?co=GENIE.Platform%3DDesktop ; https://support.google.com/accounts/answer/32047

### The other fallback: the standard language-matching table sent uk → ru until CLDR 46

- **Set:** Nothing to set — this is not a user setting. Know it so the article's "removal is not selection" claim can be stated as a mechanism with a date rather than as suspicion.
- **Steps:** No steps. To judge a given product: find the CLDR/ICU version it bundles — anything on CLDR 45 or older still carries the entry.
- **Gotchas:** This is a DIFFERENT dataset from likelySubtags and the two sound contradictory — do not conflate them. `likelySubtags` answers "what language is likely in region UA" and maps `und_UA` → `uk_Cyrl_UA` (Ukrainian); checking only this one makes the article's region-fallback claim look unsupported. `languageMatching` answers "the caller asked for uk and it is unavailable, what is nearest" — and that is the one that carried `desired="uk" → supported="ru"`. The entry was ONE-WAY: `ru` never fell back to `uk`. Dropped in CLDR 46, released 2024-10-24; verbatim from the release note: 'Dropped the fallback mapping desired="uk" → supported="ru" (so that Ukrainian (uk) doesn't fall back to Russian (ru)).' Removal is recent, so products pinned to older data still ship the old behaviour today.
- **Impact:** This is the evidence under the article's «за відсутності потрібної підставляють ту, яку вважають ближчою — для України це часто російська», and it lets that sentence carry a date instead of a hedge. CLDR is the data under ICU, and ICU sits under Java, Android, iOS/macOS, Chrome/V8, Node `Intl`, PHP `intl` and .NET — this was the shared default, not one vendor's opinion. **Complements the ENGLISH-trap finding above rather than contradicting it:** that one is about a Google stack that already holds English and no Ukrainian anywhere, this one about an app with no Ukrainian build at all. Two branches, two outcomes — the article must keep them distinct, and so must the deep-dive (`whyThisHappens` → `transport`, where both now appear as separate points).
- **Verify:** Diff the supplemental language-matching data between CLDR 45 and 46 — the `<languageMatch desired="uk" supported="ru" …/>` entry is present in 45 and absent in 46.
- **Sources:** https://cldr.unicode.org/downloads/cldr-46 (release note, fetched 2026-08-30) ; https://www.unicode.org/cldr/charts/45/supplemental/likely_subtags.html (the likelySubtags contrast, fetched 2026-08-30)

### Adjacent but weaker: Ukrainian IP blocks re-registered as RU

- **Set:** Nothing. Recorded so a future editor does not rediscover this and over-claim it.
- **Gotchas:** Kentik documented dozens of RIPE prefixes whose registered country flipped UA → RU — e.g. 178.158.128.0/18 (2022-07-21), 151.0.0.0/20 (2022-07-18), 194.31.152.0/22 (2022-09-07), 178.219.192.0/20 (2022-07-18), 95.215.51.0/24 (2022-11-02), and in Crimea 46.35.224.0 on 2014-03-18 — 'the exact same day Russia signed the Treaty of Accession'. Kentik: 'Geolocation service providers take most geolocation information found in registration data at face value.' **The blocks are overwhelmingly in occupied territory, so this does NOT support "Ukrainian IPs generally read as Russian"** and must not be used as a language argument. It is a geolocation fact, and the language claim rests on CLDR above.
- **Sources:** https://www.kentik.com/blog/the-russification-of-ukrainian-ip-registration/ (fetched 2026-08-30)

### Cross-cutting notes — google surfaces

Recommended article ordering: device/OS language first (it feeds every mobile app), then Google Account, then Search (display + Results Language Filter + region), then the per-product overrides (Gmail, YouTube, Maps, News), then Chrome preferred languages, closing with the signed-out/cookie caveat and the parameterized-URL fallback. Settings that moved/died, worth calling out in the article: (1) the old Search 'results language' preference is now the 'Results Language Filter' (Search settings → Languages), and the old help URL support.google.com/websearch/answer/173424 is a 404 — that article id now belongs to Chrome's language help; (2) Google News regional editions are now the signed-in-only 'Language & region' / 'Languages and regions of interest' picker (max 2 pairs), with hl/gl/ceid as the URL-level equivalent — ceid is not officially documented; (3) Chrome UI language is switchable in-app on Windows only; macOS/Linux follow the OS. Unverified/inferred items are flagged inline per finding: signed-in vs Chrome-language precedence on Google sites, Gmail-vs-account-language interaction, YouTube mobile menu path (taken from the platform-switched official article via search summary, not re-fetched), Maps iOS path, and hl/lr/gl/cr being documented only for Programmable Search rather than the consumer endpoint. All quoted sentences come from the cited official pages fetched 2026-08-13.

## Browsers

### Chrome desktop — preferred languages order (feeds Accept-Language / navigator.languages)

- **Set:** chrome://settings/languages → "Preferred languages": Ukrainian first, English second, remove Russian entirely (three-dot "More" menu next to it → remove).
- **Steps:** Settings > Languages > Preferred languages. Add via "Add languages"; reorder via the "More" (three-dot) button next to a language → "Move to the top" / "Move up" / "Move down".
- **Gotchas:** Google's help states the list's purpose softly ("If the page is in more than one language, it shows your preferred language first") — the mechanism is the Accept-Language header and navigator.languages, both built from this list in order (MDN). Removing ru from the list also stops Chrome offering to translate Ukrainian/Russian confusions oddly: languages ON the list are treated as "languages you read", so keeping ru in the list suppresses translate offers for Russian pages. Demoting ru to last is NOT enough — any site that supports ru but not uk/en will still negotiate to ru; it must be deleted.
- **Impact:** This one list is what most large sites (Google, Wikipedia, docs sites) read to auto-pick your language. uk first + no ru flips those sites to Ukrainian.
- **Verify:** DevTools (F12) > Network > click any request > Request Headers > accept-language should read like "uk,uk-UA;q=0.9,en-US;q=0.8,en;q=0.7" with no ru anywhere; console: navigator.languages.
- **Sources:** https://support.google.com/chrome/answer/173424?co=GENIE.Platform%3DDesktop ; https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages

### Chrome desktop — browser UI language

- **Set:** Display Chrome in Ukrainian (Windows); on macOS/Linux Chrome follows the OS language — set the system to Ukrainian instead.
- **Steps:** Settings > Languages > Preferred languages > "More" next to Ukrainian > "Display Google Chrome in this language", then relaunch.
- **Gotchas:** Google's doc is explicit that this per-browser UI switch is Windows-only; "On Mac or Linux, Chrome automatically displays in the default system language." Don't send macOS readers hunting for this menu item.
- **Impact:** UI language also becomes the default "Translate into" target and the first entry browsers derive Accept-Language from, so uk here reinforces everything else.
- **Verify:** Chrome menus render in Ukrainian after relaunch.
- **Sources:** https://support.google.com/chrome/answer/173424?co=GENIE.Platform%3DDesktop

### Chrome — translate ('offer to translate' / never-translate lists)

- **Set:** Keep "Use Google Translate" ON so Russian pages get an instant translate-to-Ukrainian offer; make sure Russian is NOT in the preferred list or in "Never offer to translate these languages".
- **Steps:** Desktop: Settings > Languages > Google Translate → toggle "Use Google Translate"; "Never offer to translate these languages" → "Add languages". Android: More > Settings > Languages > "Translation settings" toggle; Advanced > "Don't offer to translate these languages" and "Automatically translate these languages".
- **Gotchas:** The translate target defaults to the browser/UI language — if Chrome's UI is still Russian, translate offers will translate INTO Russian. Fix UI/system language first. Android additionally has an "Automatically translate these languages" list (desktop help doesn't mention an equivalent under that name).
- **Impact:** Turns unavoidable Russian pages into Ukrainian reading instead of a nudge back into the ru bubble.
- **Verify:** Open a Russian-language page — the translate prompt should offer Ukrainian as the target.
- **Sources:** https://support.google.com/chrome/answer/173424?co=GENIE.Platform%3DDesktop ; https://support.google.com/chrome/answer/173424?co=GENIE.Platform%3DAndroid

### Chrome — spellcheck dictionaries

- **Set:** Spell check ON for Ukrainian and English; no Russian dictionary.
- **Steps:** Desktop: Settings > Languages > under "Spell check", toggle "Check for spelling errors when you type text on web pages"; dictionaries follow the languages in your preferred list.
- **Gotchas:** Two modes: Basic (local/OS) vs Enhanced (sends typed text to Google) — a privacy trade-off worth one sentence in the article. Mobile Chrome has no spellcheck menu — Android spellcheck comes from the keyboard app, iOS from the system (per Google's own doc).
- **Impact:** Removing the ru dictionary removes red-underline pressure to "correct" Ukrainian into Russian spellings.
- **Verify:** Type Ukrainian text in a web form — no false errors; Russian words get flagged.
- **Sources:** https://support.google.com/chrome/answer/12027911

### Chrome on Android

- **Set:** Same target: uk first, en second, ru removed — plus Chrome's own UI language to Ukrainian.
- **Steps:** More (⋮) > Settings > Languages: "Add language", then long-press/drag languages "to the place you want" to reorder; remove via More > "Remove". UI: under "Chrome's language" tap the current language, pick Ukrainian, tap "Restart".
- **Gotchas:** Unlike desktop, Android Chrome reorders by DRAG, not a three-dot menu, and it does have a per-app UI language switch ("Chrome's language") independent of Android's system language. Android 13+ also has a system per-app language setting that can conflict — mention checking Android Settings > Apps > Chrome > Language too (that OS-side path is from Android platform docs, not the Chrome article).
- **Impact:** Mobile is where most reading happens; the same Accept-Language mechanics apply.
- **Verify:** Same as desktop: httpbin.org/headers in the mobile browser, or open google.com logged out and check the interface language.
- **Sources:** https://support.google.com/chrome/answer/173424?co=GENIE.Platform%3DAndroid

### Chrome on iPhone/iPad

- **Set:** Nothing inside Chrome — set iOS system language order (uk, en) and per-app language instead.
- **Steps:** Google's iOS help page for languages covers ONLY translation (More > Settings > Languages → "Translate Pages" toggle, "Add Language"). There is no in-Chrome preferred-languages list or UI-language switch on iOS.
- **Gotchas:** Verified gap in Google's own doc: the iOS variant of the Chrome languages article documents no language list — Chrome on iOS follows iOS Language & Region (and the per-app Preferred Language setting once ≥2 system languages exist). I could not verify an official Google statement of that inheritance; it follows from iOS platform behavior. Flag as "set it at the OS level".
- **Impact:** Stops readers hunting for a Chrome-iOS menu that doesn't exist.
- **Verify:** httpbin.org/headers inside Chrome iOS after changing iOS Language & Region.
- **Sources:** https://support.google.com/chrome/answer/173424?co=GENIE.Platform%3DiOS

### Firefox — webpage language (Accept-Language / intl.accept_languages)

- **Set:** Web-page language list: Ukrainian [uk] first, English second, Russian removed.
- **Steps:** Menu > Settings > General panel > Language section > "Choose your preferred language for displaying pages" → Choose… dialog: add languages, then "Move Up" / "Move Down" / "Remove".
- **Gotchas:** This is a SEPARATE setting from the Firefox UI language and is the one that writes intl.accept_languages / the Accept-Language header. Mozilla's article is honest that "a server can decide not to honor that choice" — set expectations. support.mozilla.org currently blocks simple fetchers (JS wall), so I verified wording via search snippets of the live article, not a full page read.
- **Impact:** The exact Firefox equivalent of Chrome's preferred-languages list; this is the header sites negotiate on.
- **Verify:** about:config → intl.accept_languages should show uk first and no ru; or DevTools Network > request > Accept-Language.
- **Sources:** https://support.mozilla.org/en-US/kb/choose-display-languages-multilingual-web-pages

### Firefox — UI language

- **Set:** Browser interface in Ukrainian, English as fallback.
- **Steps:** Settings > General > Language: pick Ukrainian in the drop-down ("Search for more languages" to install it), and "Set Alternatives…" to order fallbacks with Move Up / Move Down / Remove.
- **Gotchas:** Two distinct controls sit centimeters apart in the same panel: the UI language drop-down vs "Choose your preferred language for displaying pages". Changing only the UI drop-down does not fix what sites serve; changing only the page list leaves menus in the old language. The article's fallback logic: first language is default, next is used when a feature isn't translated.
- **Impact:** Also matters because some sites lazily read the UI locale, and Firefox seeds Accept-Language from the active UI language when the user never touched the page-language list.
- **Verify:** Menus in Ukrainian after restart.
- **Sources:** https://support.mozilla.org/en-US/kb/use-firefox-another-language

### Firefox — Translations (built-in, local)

- **Set:** Use full-page translation for unavoidable Russian pages; install the Ukrainian language pack.
- **Steps:** Translation icon in the address bar → "Translate full page"; manage under Settings > General > Language and Appearance > Translations (click "Install" next to a language pack that failed to download); cog icon in the translation panel for "Always offer to translate".
- **Gotchas:** Built-in since Firefox 118 and runs LOCALLY (on-device) — a genuine privacy differentiator vs Chrome/Edge cloud translate, worth stating in the article. Android Firefox has its own translation flow (separate support article "Firefox translation for Android"). Ukrainian model availability should be spot-checked in the reader's Firefox version — I did not verify the uk pair specifically.
- **Impact:** Lets a reader keep 'never send my reading to Google' and still de-russify content.
- **Verify:** Open a Russian page — translation icon appears in the URL bar; translated output is Ukrainian.
- **Sources:** https://support.mozilla.org/en-US/kb/website-translation ; https://support.mozilla.org/en-US/kb/android-translation

### Safari on macOS — language comes from System Settings, not the browser

- **Set:** System Settings > General > Language & Region: Ukrainian dragged to the top, English second, Russian deleted from the list. Optional: per-app override under the "Applications" section of the same pane.
- **Steps:** Apple menu > System Settings > General > Language & Region → "+" to add a language → "Drag a language to the top of the languages list". Per-app: same pane, Applications section → "+", pick app + language.
- **Gotchas:** Safari has NO in-browser language list — Apple's doc states the system list drives "the macOS interface, apps, and websites" (first supported language wins). Second trap, from MDN: Safari, always, sends a REDUCED Accept-Language for anti-fingerprinting — effectively only the top language ("…may not include the full list of user preferences, such as in Safari (always)… where only one language is listed"). So on Safari the ordering trap is absolute: whatever is #1 in Language & Region is the ONLY language websites see; uk must literally be first. May need a restart for all apps to pick it up.
- **Impact:** One system setting fixes Safari, Mail, and every WebKit view at once; and explains why demoting-but-keeping ru is uniquely useless on Apple platforms.
- **Verify:** httpbin.org/headers in Safari — expect roughly "uk-UA,uk;q=0.9" and nothing else; Develop menu > Show Web Inspector > Network also shows the header.
- **Sources:** https://support.apple.com/guide/mac-help/change-language-region-settings-mh26684/mac ; https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages

### Safari on iPhone/iPad — system Language & Region (+ per-app language)

- **Set:** Settings (Параметри) > General (Загальні) > Language & Region (Мова і регіон): iPhone Language = Ukrainian («Мова для iPhone»), then «Додати мову» / Add Language to keep English available; remove Russian from the preferred order.
- **Steps:** Settings > General > Language & Region → set "iPhone Language"; "Add Language" for additional ones; when adding, an alert asks which to use as primary. Per-app (incl. Safari): Settings > Apps > [app] > Preferred Language — appears only once the device has 2+ languages configured.
- **Gotchas:** Apple's current user guide (iOS 26/18, checked Aug 2026, incl. the Ukrainian-locale version) documents the path and Add Language but does NOT document reordering UI details or the per-app Preferred Language row — the per-app path is verified only from Apple developer-forum guidance (iOS 13+ feature, needs ≥2 system languages), so mark it 'check on your device'. Same Safari anti-fingerprinting note as macOS: only the top language is sent.
- **Impact:** This is the whole story for every browser on iOS (Chrome/Edge/Firefox on iOS are WebKit shells that follow these settings).
- **Verify:** Open httpbin.org/headers in iOS Safari — Accept-Language should start with uk; the whole phone UI flips to Ukrainian.
- **Sources:** https://support.apple.com/en-us/109358 (published 2026-06-16) ; https://support.apple.com/guide/iphone/change-the-language-and-region-iphce20717a3/ios ; https://developer.apple.com/forums/thread/123413

### Edge — preferred languages, UI language, translate

- **Set:** edge://settings/languages: Ukrainian to the top of "Preferred languages", English second, Russian removed; "Display Microsoft Edge in this language" on Ukrainian; "Offer to translate pages that aren't in a language I read" ON.
- **Steps:** Settings and more (…) > Settings > Languages. "Add languages" under Preferred languages; "…" next to a language → reorder / "Display Microsoft Edge in this language" (then restart Edge). Translate toggle lives in the same Languages page.
- **Gotchas:** Microsoft's official support article confirms Add + "Display Microsoft Edge in this language" but does NOT print the reorder button wording; secondary sources and the DefinePreferredLanguages policy doc describe "Move to the top / Move up / Move down" under the three-dot menu — I could not confirm that exact wording on a Microsoft page, so double-check in the UI. Microsoft's learning-center page confirms: "websites you visit appear in the first language in the list that they support" and that translate offers target the TOP language of the list — another reason uk must be #1. UI-language switch platform coverage (Windows vs macOS) is not stated in the doc.
- **Impact:** Same Accept-Language mechanics as Chrome (Chromium), plus Edge's translate target is derived from the list head.
- **Verify:** DevTools > Network > any request > accept-language; edge://settings/languages shows uk on top.
- **Sources:** https://support.microsoft.com/en-us/edge/use-microsoft-edge-in-another-language ; https://www.microsoft.com/en-us/edge/learning-center/how-to-manage-languages ; https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/definepreferredlanguages

### Verification — see what your browser actually sends

- **Set:** Target state to confirm: Accept-Language ≈ "uk,uk-UA;q=0.9,en-US;q=0.8,en;q=0.7" (order may vary slightly per browser), navigator.languages starting with uk, zero ru anywhere.
- **Steps:** Three methods: (1) DevTools: F12 > Network tab > reload > click any request > Request Headers > accept-language. (2) Console: type navigator.languages — array ordered "with the most preferred language first" (MDN). (3) Neutral echo page: https://httpbin.org/headers prints every request header including Accept-Language.
- **Gotchas:** MDN: "The Accept-Language header generally lists the same locales as the navigator.languages property, with decreasing q values" — but Safari (always) and Chrome Incognito send a privacy-reduced list (often just one language), so a short header there is expected, not a misconfiguration. Chrome and Safari also auto-append language-only fallbacks (uk-UA → uk), so seeing entries you didn't add is normal.
- **Impact:** Gives the article a falsifiable 'did it work' step instead of vibes.
- **Verify:** n/a — this IS the verification step.
- **Sources:** https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Language ; https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages ; https://httpbin.org/headers

### The q-value / ordering trap — why uk must be FIRST and ru fully removed

- **Set:** Rule for the article: (1) uk at position #1, (2) en second, (3) ru deleted — not demoted.
- **Steps:** No UI path — this is the mechanism: browsers serialize the preferred-languages list into Accept-Language in list order with DECREASING q-weights (first item q=1 implicitly, then ;q=0.9, ;q=0.8…). The server picks the highest-weighted language it supports (content negotiation) and answers with Content-Language.
- **Gotchas:** Two distinct failure modes. (a) uk not first: a site that supports both uk and en (Google, Wikipedia portals, most big SaaS) will serve whichever ranks higher — en second is fine, en first means an English internet, ru first means the old status quo. (b) ru present at all, even last with q=0.1: any site that supports ru but NOT uk/en (huge share of ex-CIS web) treats it as 'this user reads Russian' and serves ru instead of falling back to en or showing a language chooser — a low q still beats 'unsupported'. Hence deletion, not demotion. On Safari the effect is amplified: only the #1 language is sent at all. MDN also notes "The server should never override an explicit user language choice" — in-site language pickers beat the header where offered.
- **Impact:** This is the core conceptual point of the whole article; every per-browser step above is just an implementation of this rule.
- **Verify:** After setup, a site with uk+en+ru versions (e.g. Wikipedia's landing behavior, google.com logged out) should land on Ukrainian; a ru-only site should show ru or a chooser but your header (httpbin.org/headers) shows no ru — so anything Russian on screen is the SITE's refusal, not your request.
- **Sources:** https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Language ; https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages

### Cross-cutting notes — browsers

Ordering advice for the article: do OS-level first (macOS/iOS Language & Region — it silently drives Safari and every WebKit browser, and Chrome-on-Mac's UI), then per-browser preferred-language lists (Chrome/Edge/Firefox), then translate/spellcheck polish, then the verification step. Cross-cutting verified facts: (1) all Chromium browsers and Firefox build Accept-Language and navigator.languages from the same user-ordered list with decreasing q-values; (2) Safari has NO in-browser list on either platform — system Language & Region is the only lever, and Safari always sends a fingerprint-reduced (usually single-language) header, which makes 'uk first' absolute there; (3) Chrome iOS has no language list at all (Google's own iOS help covers only translation). Verification gaps to flag in the article: Edge's exact reorder-button wording (\"Move to the top\") was only confirmable on secondary/policy pages, not the main support article; iOS per-app \"Preferred Language\" (Settings > Apps > [app]) is real (iOS 13+, requires ≥2 system languages) but is not documented in Apple's current user guide — verified via Apple developer forums; support.mozilla.org blocks simple fetchers, so Firefox wording was verified through search snippets of the live articles rather than full-page reads. Settings that moved/changed recently: none of the researched paths appear to have moved in 2025-2026 (Apple's short language article was republished 2026-06-16 with the same path; Chrome/Edge paths match current docs). Useful Ukrainian UI wording captured from Apple's UA-locale guide: «Параметри» > «Загальні» > «Мова і регіон», «Мова для iPhone», «Додати мову».

## Operating systems and keyboards

### Windows 11 — display language (мова інтерфейсу)

- **Set:** Windows display language = Ukrainian. Add Ukrainian via 'Add a language' with the language pack, set as display language.
- **Steps:** Start > Settings > Time & language > Language & region.
  Pick the language in the 'Windows display language' dropdown, then sign out and back in.
  To install: Preferred languages > Add a language > знайти 'українська' > Install language pack > 'Set as my Windows display language' > Install.
- **Gotchas:** Microsoft warns: 'When the Windows display language is changed, it might also change the keyboard layout to match the language' — after switching, re-check the keyboard list. The change only fully applies after sign-out/sign-in. Single-language editions of Windows can't switch display language (mentioned on the same support page family).
- **Impact:** Changes the whole Windows UI (menus, dialogs, File Explorer) and is what OS-integrated apps use.
- **Verify:** After re-login, Settings and File Explorer are Ukrainian; the language shows as display language at the top of Language & region.
- **Sources:** https://support.microsoft.com/en-us/windows/hardware/input-devices/manage-the-language-and-keyboard-input-layout-settings-in-windows ; https://support.microsoft.com/en-us/windows/language-packs-for-windows-a5094319-a92d-18de-5b53-1cfc697cfca8

### Windows 11 — Preferred languages list (це те, що читають застосунки й сайти)

- **Set:** Preferred languages ordered: українська first, English second, and REMOVE Russian from the list entirely.
- **Steps:** Settings > Time & language > Language & region > Preferred languages.
  Remove Russian: ellipsis (...) next to the language > Remove > Yes.
  Add/keep українська and English; order them uk, en.
- **Gotchas:** Removing a KEYBOARD does not remove the LANGUAGE — they are separate operations (see keyboards finding). 'If the Remove button is greyed out, the selected language to be removed is the current Windows display language' — switch display language first, then remove Russian. Microsoft's own globalization doc says apps should use this list, but apps integrated with Windows may follow the display language instead.
- **Impact:** Official Microsoft wording: 'The first supported language in the Preferred languages list determines the language used by Microsoft Store apps and websites.' Microsoft Learn (updated 2026): 'Preferred languages: a Microsoft Store application uses the first language in this list that is supported by the app.' Note: Microsoft Edge keeps its OWN separate preferred-languages list (Edge Settings > Languages) — cleaning the OS list is not enough for Edge.
- **Verify:** Open a Store app that supports Ukrainian — it should render Ukrainian; the Preferred languages list shows no Russian entry.
- **Sources:** https://support.microsoft.com/en-us/windows/hardware/input-devices/manage-the-language-and-keyboard-input-layout-settings-in-windows ; https://learn.microsoft.com/en-us/globalization/locale/user-preferences

### Windows 11 — keyboard layouts (розкладки)

- **Set:** Remove the Russian keyboard layout; keep Ukrainian + English layouts.
- **Steps:** Settings > Time & language > Language & region > ellipsis (...) next to the language > Language options.
  Under Keyboards: 'Add a keyboard' to add; ellipsis (...) next to a keyboard > Remove to delete.
- **Gotchas:** Removing the Russian layout does NOT remove Russian from Preferred languages — do both. Microsoft: 'Installed keyboard layouts aren't always part of a matching language. The keyboard layout might be installed as part of the current Windows display language.' 'If the Remove button is greyed out, the selected keyboard layout is the only installed keyboard layout.' Also, changing display language can silently (re)add a matching layout — re-check after any display-language change.
- **Impact:** Removes the Win+Space clutter and accidental Russian typing; removing the language (previous finding) is what stops Russian being advertised to apps/sites.
- **Verify:** Win+Space shows only UKR/ENG; Language options for each language list only wanted layouts.
- **Sources:** https://support.microsoft.com/en-us/windows/hardware/input-devices/manage-the-language-and-keyboard-input-layout-settings-in-windows

### Windows 11 — Country or region + Regional format

- **Set:** Country or region = Ukraine; Regional format = Ukrainian (or 'Recommended' once the language list is Ukrainian-first).
- **Steps:** Settings > Time & language > Language & region — the same page has 'Country or region' and 'Regional format' (Region section).
- **Gotchas:** These are two different knobs: Microsoft Learn — 'Country or region: Windows and applications can use this setting to customize the content that is presented to the user'; 'Regional format: Windows and apps use this setting to format dates and times according to the conventions of the selected locale.' 'The Regional format settings usually reflect the Windows display language or Preferred language choice; however it's not mandatory.' Regional format does NOT change UI language — only formats. I did not find a current support.microsoft.com consumer page dedicated to the Region section; the authoritative description is the Learn globalization page.
- **Impact:** Country/region can steer Store content and region-aware apps; Regional format fixes dates/numbers/currency to Ukrainian conventions even in English-UI apps.
- **Verify:** Clock/calendar and Explorer dates render in Ukrainian format; Store surfaces Ukraine-relevant content.
- **Sources:** https://learn.microsoft.com/en-us/globalization/locale/user-preferences

### Windows 11 — typing suggestions / autocorrect (де російська може лишитись)

- **Set:** Review Settings > Time & language > Typing after removing Russian: text prediction and multilingual suggestions draw on installed languages.
- **Steps:** Settings > Time & language > Typing.
  Toggles: 'Show text suggestions when typing on the physical keyboard'; 'Multilingual text suggestions' (prediction in several languages); on-screen keyboard has 'Show text suggestions as I type'.
- **Gotchas:** Multilingual text suggestions work off recognized/installed languages, so while Russian remains installed it can keep suggesting Russian. Office apps (Word etc.) have a completely separate proofing-language list ('Set up or change the languages used to check spelling and grammar' on support.microsoft.com) — I did not verify its current menu path, but it is a separate surface where a Russian proofing language can linger.
- **Impact:** Stops Russian predictions/autocorrect after the layout is gone.
- **Verify:** Type in a text field with suggestions on — no Russian candidates appear.
- **Sources:** https://support.microsoft.com/en-us/windows/enable-text-suggestions-in-windows-0bf313ca-c992-4173-aa5f-8341d3953498 ; https://support.microsoft.com/en-us/word/set-up-or-change-the-languages-used-to-check-spelling-and-grammar

### macOS — Language & Region (Мова й регіон): preferred list, region, per-app

- **Set:** Пріоритетні мови: українська first (primary), English second, Russian deleted. Регіон: Україна.
- **Steps:** Apple menu > System Settings (Системні параметри) > General (Загальні) > Language & Region (Мова й регіон) — may need to scroll.
  Reorder/add/remove languages in 'Preferred languages' (Пріоритетні мови); Region (Регіон) sets the geographic region for formats.
  Per-app: the 'Applications' (Програми) section on the same page — 'Customize language settings for individual applications' (Вибір мови для окремих програм).
- **Gotchas:** TRAP verified in Apple's own doc: 'When you add input sources for typing, those languages are automatically added to the list' — a Russian input source auto-adds Russian to the preferred languages. Removing the input source does not visibly remove the language from the list — delete it there too. Region on macOS controls only formats (dates, times, numbers, currencies) — it is NOT the App Store country (that's the Apple Account setting, separate finding). Optional: Settings pop-up menu > 'Apply to Login Window' makes the login window use the primary language. Guide current for macOS Tahoe 26 back to High Sierra.
- **Impact:** Apple's wording: languages you choose are shown 'in macOS and in apps (for example, in menus and notifications), and on websites (if available in a preferred language)' — i.e. this ordered list is exactly what Safari feeds to websites; the first entry is the 'primary language'.
- **Verify:** System menus in Ukrainian; a multilingual site opened in Safari serves Ukrainian; the list shows Українська, English and no Russian.
- **Sources:** https://support.apple.com/guide/mac-help/intl163/mac

### macOS — input sources (розкладки) + spellcheck

- **Set:** Remove the Russian input source; in Spelling pick Ukrainian (and English), or 'Automatic by Language'.
- **Steps:** System Settings > Keyboard (Клавіатура) > Text Input (Введення тексту) > Edit (Змінити).
  Add with the '+' button; select the Russian input source and remove it with the '−' (Remove) button.
  Same panel: 'Correct spelling automatically' and the 'Spelling' dropdown choose which languages get spellchecked.
- **Gotchas:** Two-step trap (mirror of the Language & Region one): removing the Russian input source does NOT remove Russian from the preferred-languages list it auto-added — go back to Language & Region and delete it there. If 'Spelling' is set to Automatic by Language, it detects from the languages you keep — with Russian gone it stops suggesting Russian.
- **Impact:** Kills accidental Russian typing, autocorrect-to-Russian, and (together with the list cleanup) Russian in Safari's advertised languages.
- **Verify:** Input menu shows only УКР/ABC; spellcheck no longer flags Ukrainian words against a Russian dictionary.
- **Sources:** https://support.apple.com/guide/mac-help/mchl84525d76/mac ; https://support.apple.com/guide/mac-help/intl163/mac

### iOS/iPadOS — Language & Region (Мова і регіон) + preferred-language ORDER

- **Set:** iPhone language = українська; preferred order (Бажаний порядок мов): українська, English; Russian removed. Регіон: Україна.
- **Steps:** Параметри (Settings) > Загальні (General) > Мова і регіон (Language & Region).
  Set 'Мова для iPhone', 'Регіон', calendar/temperature/measurement/date/number formats.
  Add a language: «Додати мову» (Add Language) — an alert then asks which to use as primary.
- **Gotchas:** The current iPhone guide (iOS 26/18) confirms the reorderable list exists and matters — from the keyboards page: you can view/add languages 'в меню Параметри > Загальні > Мова і регіон. Також можна перевпорядкувати список, щоб змінити те, як програми й вебсайти відображають текст' (reorder to change how apps AND WEBSITES display text). Per-app language (Settings > Apps > [app] > Preferred Language) exists on devices when the app ships multiple localizations, but I could NOT find it documented in Apple's current iPhone guide or a support article — verify on device; the macOS equivalent IS documented. iOS Safari has no own language setting — it follows this list.
- **Impact:** This ordered list is what iOS apps and Safari-visited websites use; region here controls formats, not the App Store country.
- **Verify:** Language & Region shows Українська first, English second, no Russian; multilingual sites in Safari come up Ukrainian.
- **Sources:** https://support.apple.com/guide/iphone/change-the-language-and-region-iphce20717a3/ios ; https://support.apple.com/en-us/109358 ; https://support.apple.com/guide/iphone/add-or-change-keyboards-iph73b71eb/ios

### iOS/iPadOS — keyboards + dictation

- **Set:** Delete the Russian keyboard; keep Ukrainian + English. Dictation: Ukrainian is supported (list includes 'Ukrainian (Ukraine)').
- **Steps:** Параметри > Загальні > Клавіатура > «Клавіатури».
  Add: «Додати клавіатуру» (Add New Keyboard).
  Remove: «Змінити» (Edit) > '−' поруч із клавіатурою > «Видалити» (Delete) > «Готово» (Done).
  Reorder: «Змінити», drag, «Готово».
- **Gotchas:** BIGGEST trap on iOS, verified in the official guide: 'Якщо ви додасте клавіатуру для іншої мови, відповідну мову буде автоматично додано до списку «Бажаний порядок мов»' — adding a Russian keyboard silently puts Russian into the preferred-languages list that apps and websites read. Deleting the keyboard does not state it removes the language — go to Мова і регіон and remove Russian from the list explicitly. Keyboards also determine Dictation languages ('клавіатури для… використання функції Диктування різними мовами').
- **Impact:** Removes Russian typing, its dictation, and (with the list cleanup) Russian from what Safari advertises.
- **Verify:** Globe key cycles only УКР/EN; Мова і регіон list has no Russian.
- **Sources:** https://support.apple.com/guide/iphone/add-or-change-keyboards-iph73b71eb/ios ; https://www.apple.com/ios/feature-availability/

### iOS/macOS — Siri language

- **Set:** Siri does NOT support Ukrainian — set Siri to English (there is no uk option; this at least removes any Russian setting).
- **Steps:** Параметри > Siri (або «Apple Intelligence і Siri») > «Мова» (Language) — choose the language Siri responds to. Voice: «Голос» (not all languages have voice options).
- **Gotchas:** Apple's iOS feature-availability page's Siri language list has no Ukrainian (and in the current iOS 26 list I checked, no Russian either — older iOS versions did support Russian Siri, so a device upgraded from an old setup may still have it set). Changing Siri's language means retraining 'Hey Siri' voice recognition (guide: «Звертання до Siri» off/on + on-screen instructions). Keyboard DICTATION is separate from Siri and DOES support Ukrainian — don't conflate the two.
- **Impact:** Prevents the voice assistant from being the last Russian-speaking surface on the device.
- **Verify:** Siri settings show the chosen language; Siri responds in it.
- **Sources:** https://support.apple.com/guide/iphone/change-siri-settings-iphc28624b81abc/ios ; https://www.apple.com/ios/feature-availability/

### Android — system languages list + region

- **Set:** Languages list: українська dragged to the top, English second, Russian removed. Region: Ukraine.
- **Steps:** Pixel/stock: Settings > System > Languages & input > Languages (newer builds: System > Language & region > Preferred Language).
  'Add a language' > choose; 'Touch and drag your language to the top of the list'.
  Remove: More (⋮) > Remove > select the language > Delete.
  Region: Settings > System > Language & region > Region.
- **Gotchas:** Menu naming varies by OEM and Android version — Google's own help gives two different paths (Samsung etc. differ again; I only verified Pixel paths). The top language is the system/app default; Google: 'Apps that are set to follow the system default use the first supported language in the list' — a Russian entry anywhere in the list can still be picked by an app that supports Russian but not Ukrainian, so remove it rather than demote it. 'When you add languages to your System settings, it helps your device detect that language and customize content.'
- **Impact:** Drives every app that follows the system default, plus Chrome's Accept-Language on Android (Chrome mobile follows device languages).
- **Verify:** Languages list shows Українська first, no Russian; apps relaunch in Ukrainian.
- **Sources:** https://support.google.com/googlepixeltablet/answer/12571227?hl=en ; https://support.google.com/android/answer/12395118?hl=en

### Android 13+/14+ — per-app languages

- **Set:** For apps that ignore the system default (or that you want in English), set an explicit per-app language; use it to force Ukrainian where an app guessed Russian.
- **Steps:** Settings > System > Languages > App Languages > choose the app > choose the language.
- **Gotchas:** Google's help page states 'Some of these steps work only on Android 14 and up' (the feature itself shipped in Android 13; the documented path is the 14+ one). Only apps whose developers opted in appear in the list — an app missing from App Languages cannot be overridden there. If the language doesn't apply: restart the app, ensure network connectivity; Google also suggests adding the language as a secondary system language first.
- **Impact:** The one lever for apps that pick Russian based on region/IP despite a Ukrainian system.
- **Verify:** The app relaunches in the chosen language; its entry under App Languages shows the override.
- **Sources:** https://support.google.com/android/answer/12395118?hl=en

### Android — Gboard languages

- **Set:** Gboard languages: Ukrainian + English only; remove the Russian keyboard.
- **Steps:** In any typing field: tap the keyboard's Settings/features menu > Settings > Languages — or Settings app > System > Keyboard > On-screen keyboard > Gboard > Languages.
  Add: 'Add keyboard' > pick language + layout > Done.
- **Gotchas:** Google's official Gboard help documents ADDING languages but has no published 'remove a language' steps — in practice removal is done on that same Gboard > Languages screen (edit/trash the entry), but I could not verify the exact control names in official docs; flag as UI-verified-only. Gboard languages are independent of system languages ('When you change languages with Gboard, your Android device's language settings aren't affected') — so cleaning Gboard does NOT clean the system list, and vice versa: check both.
- **Impact:** Stops Russian layout, suggestions and glide/voice typing in Gboard.
- **Verify:** Spacebar long-press / globe key offers only Ukrainian and English.
- **Sources:** https://support.google.com/gboard/answer/7068494?hl=en&co=GENIE.Platform%3DAndroid ; https://support.google.com/gboard/answer/6380730?hl=en&co=GENIE.Platform%3DAndroid

### Android — Google Assistant language

- **Set:** Assistant languages: set primary to match (Ukrainian if offered on the device; otherwise English) — check it separately from system language.
- **Steps:** Assistant settings > Languages: tap the current language to change the primary, or 'Add a language' for a second one (help page describes the path via the Google Home app profile > Settings > Assistant > Languages).
- **Gotchas:** Assistant language is SEPARATE from Android's system language — Google: 'You can change or add a language in the Google Assistant settings' and you can use 'up to 3 languages… your Android language, plus 2 Assistant languages'. So Russian can persist in Assistant after the OS is fully Ukrainian. I did not verify whether Ukrainian is currently in Assistant's supported-language list — check the picker on-device. 'Some features aren't available in all languages.'
- **Impact:** Voice assistant is a classic place Russian lingers after the display-language change.
- **Verify:** Assistant answers in the chosen language; Languages screen shows no Russian.
- **Sources:** https://support.google.com/assistant/answer/7394513?hl=en&co=GENIE.Platform%3DAndroid

### OS region vs. store country — Google Play

- **Set:** Google Play country = Ukraine (this is an ACCOUNT setting, not the Android region setting).
- **Steps:** Play Store app > profile icon > Settings > General > Account and device preferences > Country and profiles > tap the country > follow instructions > add a payment method for that country.
- **Gotchas:** Changing OS region does NOT change the Play country. Hard limits: 'After you initially set your Google Play country, you must wait at least 90 days before you can change it' (and 90 days between changes); you must be physically in the country with 'a payment method from the new country or region'; profile update takes up to 48 hours; Play balance doesn't transfer, Play Points are lost; blocked while in a Google Family group.
- **Impact:** Play country determines 'what content you find in the store and in apps' — apps/books/movies availability.
- **Verify:** Play Store > Settings > Country and profiles shows Ukraine.
- **Sources:** https://support.google.com/googleplay/answer/7431675?hl=en

### OS region vs. store country — Apple Account

- **Set:** Apple Account country/region = Ukraine (separate from iOS/macOS 'Region', which only sets formats).
- **Steps:** iPhone/iPad: Settings > [your name] > Media & Purchases > View Account > Country/Region > Change Country or Region > pick country > Agree > payment method + billing address.
  Web: account.apple.com > Personal Information > Country/Region.
- **Gotchas:** Prerequisites before it lets you switch: spend the entire account balance, cancel blocking subscriptions and wait out their periods, wait for pre-orders/rentals/refunds; a valid payment method for the new country is usually required; Family Sharing membership can block the change; 'Some types of content might not be available in your new country or region.' The OS-level Регіон setting has no effect on any of this.
- **Impact:** Controls App Store storefront (which apps/media you see and in which language store pages default), Apple Media Services pricing/content.
- **Verify:** App Store footer/account settings show Ukraine storefront.
- **Sources:** https://support.apple.com/en-us/118283

### What OS region actually does for web services (cross-cutting)

- **Set:** Set region to Ukraine everywhere for correct formats and region-aware defaults — but don't expect it to re-language websites.
- **Steps:** Windows: Country or region (Language & region page). macOS/iOS: Регіон in Мова і регіон. Android: Region in Language & region.
- **Gotchas:** Verified scope per vendor docs: macOS/iOS region = 'formats used for dates, times, numbers, and currencies' (+ calendar, measurement units); Android region = 'helps your device detect that language and customize content' + regional preferences (units, first day of week); Windows 'Country or region' = 'Windows and applications can use this setting to customize the content'. Store country is a separate account-level setting in both Apple and Google ecosystems (see previous findings), and web services predominantly key off account settings and IP geolocation rather than OS region — the language a site serves comes from the Accept-Language list (built from the OS/browser preferred-languages order), not from region.
- **Impact:** Prevents the article from over-promising: region fixes formats and some content defaults; the LANGUAGE list is what flips sites to Ukrainian.
- **Verify:** Dates/currency render Ukrainian-style; a header-echo service shows Accept-Language starting with uk after the language-list cleanup.
- **Sources:** https://support.apple.com/guide/mac-help/intl163/mac ; https://support.apple.com/guide/iphone/change-the-language-and-region-iphce20717a3/ios ; https://support.google.com/googlepixeltablet/answer/12571227?hl=en ; https://learn.microsoft.com/en-us/globalization/locale/user-preferences

### Cross-cutting notes — operating systems and keyboards

Ordering advice for the article: (1) clean the PREFERRED-LANGUAGES list first (uk, en, delete ru) — it is the single setting that apps AND websites actually read on every OS; (2) then remove Russian keyboards/input sources; (3) then re-check the list, because on Apple platforms adding a keyboard/input source AUTO-ADDS its language to the preferred list (verified in both the iPhone and macOS guides) — this is the number-one way Russian silently reappears; Windows has the mirror trap (changing display language may re-add a matching keyboard layout). Cross-cutting residue surfaces after the display language is Ukrainian: Edge's own language list (separate from Windows), Office proofing languages, Windows multilingual text suggestions, macOS Spelling dropdown, Gboard's own language list (independent of Android system languages), and voice assistants (Siri language, Google Assistant languages — both separate settings). Siri has NO Ukrainian (per apple.com/ios/feature-availability, current list — recommend English); iOS/macOS keyboard Dictation DOES support Ukrainian. Unverified/flagged items: iOS per-app language (Settings > Apps > [app] > Preferred Language) exists on devices but is absent from Apple's current iPhone guide — verify on-device before printing exact steps; Gboard language REMOVAL steps are not in official help (only adding is documented); Google Assistant's Ukrainian support not confirmed from docs; Office proofing-language menu path not re-verified; Samsung/OEM Android paths differ from the verified Pixel paths. Settings that moved: Windows 11 consolidated everything under Settings > Time & language > Language & region (old Control Panel paths are gone); Android's path is transitioning from 'System > Languages & input > Languages' to 'System > Language & region > Preferred Language' (both appear in Google's current help); iOS Siri settings may appear as 'Apple Intelligence & Siri'. Apple guide pages verified against macOS Tahoe 26 / iOS 26 versions (support.apple.com serves the UA locale with Ukrainian menu names — handy for quoting exact Ukrainian UI strings in the article). Store country (Play / Apple Account) is account-level, gated by payment method + waiting periods (Play: 90 days), and is NOT changed by any OS region setting.

## Apps and services

### Steam client interface language

- **Set:** Steam → Settings → Interface → 'Select the language you wish Steam to use' → Українська (Ukrainian). Ukrainian is a 'Full Platform Support' Steam language (client UI, Store and Community fully translated; API code `ukrainian`, web code `uk`).
- **Steps:** Steam client → top-left 'Steam' menu → Settings (Mac: Preferences) → Interface → language dropdown → Ukrainian → Restart Steam.
- **Gotchas:** Client language applies only to the client, not account-wide — the store website language is a separate setting (next finding). The Settings → Interface path is consistent across current sources but Valve has no single public help.steampowered.com FAQ I could verify it from; the Ukrainian-support fact and the survey come from official Valve pages.
- **Impact:** This is the setting that feeds Steam's public monthly Hardware & Software Survey 'Language' stat that publishers consult for localization decisions. July 2026: Ukrainian 0.70% (+0.01), Russian 9.30% (−0.31), English 39.61%. Every client switched to Ukrainian literally moves the number publishers see.
- **Verify:** Client UI restarts in Ukrainian; the aggregate effect is visible at store.steampowered.com/hwsurvey under 'Language'.
- **Sources:** https://partner.steamgames.com/doc/store/localization/languages ; https://store.steampowered.com/hwsurvey/

### Steam store / account language preferences (primary + secondary)

- **Set:** Primary language = Ukrainian; tick English as a secondary language; leave Russian unticked.
- **Steps:** store.steampowered.com → click your account name → Store Preferences → Language Preferences → set Primary from the dropdown, tick Secondary language checkboxes → Save. Direct URL: store.steampowered.com/account/languagepreferences.
- **Gotchas:** Separate from the client interface language — change both. Secondary languages influence which games Steam recommends/discovers (games localized into those languages) and which review languages you see; leaving Russian ticked keeps Russian-localized games and reviews in your recommendations. Exact on-page labels verified via Valve's Steamworks localization doc + community threads, not a dedicated consumer help article.
- **Impact:** Controls store page language, discovery/recommendations and the review-language pool — the content layer, distinct from the client UI layer.
- **Verify:** Store renders in Ukrainian; reviews default to your preferred languages.
- **Sources:** https://partner.steamgames.com/doc/store/localization ; https://partner.steamgames.com/doc/store/localization/languages

### Facebook account (interface) language

- **Set:** 'Мова облікового запису' (Account language) → Українська.
- **Steps:** Web: основна світлина (top right) → Налаштування та конфіденційність → Налаштування → 'Мова й регіон' (left column) → next to 'Мова облікового запису' click Вибрати/current language → pick → Ok.
- **Gotchas:** Official page states the setting is PER-DEVICE: changing it on the computer does not change the phone app — repeat on each device. On signup Facebook copies your device language (a Russian-language phone silently produces a Russian Facebook). Region/date-number format settings are currently computer-only. Note: this has NOT moved to Meta Accounts Center — language is still per-app in Facebook settings.
- **Impact:** All buttons, notifications, most text and tooltips; region format follows the language automatically.
- **Verify:** UI flips to Ukrainian immediately on that device; check the phone app separately.
- **Sources:** https://www.facebook.com/help/327850733950290 (verified in rendered form, Ukrainian locale, Aug 2026)

### Facebook translation preferences (what posts get translated INTO)

- **Set:** 'Мова, якою потрібно переглядати дописи' (language posts/comments are translated to) → Українська — otherwise Facebook may keep offering Russian translations. Same page also has options to turn off translations FROM specific languages and to control auto-translation.
- **Steps:** Web: основна світлина (top right) → Налаштування та конфіденційність → Налаштування → 'Мова й регіон' → кнопка мови біля 'Мова, якою потрібно переглядати дописи' → вибрати мову.
- **Gotchas:** Lives on the same 'Мова й регіон' page as account language but is a separate control — switching the interface to Ukrainian does NOT switch the translation target. The help article's steps are written for desktop web ('Довідка для ПК'); app tabs differ slightly. The related toggles ('Вимкнути переклади дописів іншими мовами', auto-translate settings) are linked from the account-language article.
- **Impact:** Determines the language of the 'See translation' output under posts and comments — the main lever for making Russian posts render as Ukrainian rather than the reverse.
- **Verify:** Open any foreign-language post → 'Переглянути переклад' should produce Ukrainian.
- **Sources:** https://www.facebook.com/help/979397368770507 (verified rendered, Aug 2026) ; https://www.facebook.com/help/327850733950290

### Instagram app language

- **Set:** App interface language → Українська, via the 'Мова й переклади' section.
- **Steps:** In the app: Профіль (bottom right) → Меню ☰ (top right) → розділ 'Ваш додаток і медіафайли' → 'Мова й переклади' → 'Налаштувати мову' → Android: pick the language in-app; iPhone: Продовжити → follow on-screen instructions.
- **Gotchas:** Two traps verified on the official page (Aug 2026): (1) the setting exists ONLY in the mobile app ('Ця функція доступна лише в додатку Instagram') — no web equivalent; (2) on iPhone 'Налаштувати мову' hands off to iOS per-app language settings (Settings → Apps → Instagram → Language), so on iOS it is really a system setting. The section was renamed — older guides say 'Мова', it is now 'Мова й переклади' (Language and translations). Changing app language does not change the language of posts/captions in the feed.
- **Impact:** Menus, buttons and — via the same section — the translation behavior for captions.
- **Verify:** App UI switches immediately; on iPhone check Settings → Apps → Instagram shows Українська.
- **Sources:** https://help.instagram.com/111923612310997 (verified rendered per-platform, Android + iPhone tabs, Aug 2026)

### Telegram interface language (official Ukrainian localization)

- **Set:** Settings → Language (Мова) → Українська. Ukrainian is an official Telegram language pack covering Android, iOS, Telegram Desktop, macOS and web clients.
- **Steps:** ☰ / Settings → Language → Ukrainian. Alternative: open the sharing link on the official pack page translations.telegram.org/uk/ to apply it directly.
- **Gotchas:** translations.telegram.org hosts BOTH official packs (bare language-code slugs like /uk/) and community custom packs ('The pure Ukrainian language', 'Fine Ukrainian') applied via t.me/setlanguage/… links. Custom packs are unofficial: quality varies and untranslated strings fall back. Recommend the official Українська from the in-app menu. Translation updates propagate instantly ('immediately available in Telegram apps, no updates required'). Telegram's FAQ does not enumerate the official language list — official status of uk verified from the pack's own page slug and platform coverage.
- **Impact:** Full client UI on every platform; localization quality is community-maintained, so users can also vote on strings at translations.telegram.org/uk/.
- **Verify:** Interface switches instantly, no app update needed.
- **Sources:** https://translations.telegram.org/ ; https://translations.telegram.org/uk/ ; https://telegram.org/faq

### X (Twitter) display language

- **Set:** Display language → Ukrainian (check the dropdown — the help page does not enumerate available languages).
- **Steps:** ONLY on x.com (web): More (…) → Settings and privacy → 'Accessibility, display, and languages' → Languages → 'Display language' → pick → Save (password may be requested).
- **Gotchas:** Two explicit official notes (page verified Aug 2026): (1) 'Display language settings on your X account can only be changed on X.com' — the iOS/Android apps follow the device's Settings instead; (2) 'Changing your display language settings does not change the language of the content you see on your Home timeline' — content language is a separate control (next finding).
- **Impact:** Headlines, buttons and other X chrome only — not the feed.
- **Verify:** x.com UI switches after Save; mobile apps only after the device/per-app language is changed in system Settings.
- **Sources:** https://help.x.com/en/managing-your-account/how-to-change-language-settings (fetch-blocked server-side; verified via rendered page in browser, Aug 2026)

### X (Twitter) content language preferences ('additional languages' / 'Languages you may know')

- **Set:** In the same Languages settings: keep Ukrainian + English under 'Select additional languages'; open 'Languages you may know' and REMOVE Russian — X describes these as 'languages X inferred based on your activity' and uses them for 'the content language (posts, people, and trends) preferences'.
- **Steps:** x.com: More → Settings and privacy → 'Accessibility, display, and languages' → Languages → 'Select additional languages' / 'Languages you may know' → adjust selections → Done.
- **Gotchas:** This is the setting most people miss: X keeps recommending Russian posts, people and trends even with a Ukrainian UI because it INFERRED Russian from past activity. The inference regenerates if you keep engaging with Russian content — removing the language and changing behavior go together. Editable on x.com web.
- **Impact:** Directly feeds recommendations for posts, people and Trends — the actual feed-language lever on X.
- **Verify:** 'Languages you may know' no longer lists Russian; Trends/recommendations shift over subsequent sessions.
- **Sources:** https://help.x.com/en/managing-your-account/how-to-change-language-settings (rendered page, Aug 2026) ; https://help.x.com/en/rules-and-policies/recommendations

### TikTok app language + content (video) languages + translation language

- **Set:** App language → Українська (if listed); Content preferences → Video languages → add Ukrainian (and English), do not add Russian; Translation language → Ukrainian.
- **Steps:** Профіль → Меню ☰ (top) → Settings and privacy → Language → App language. Content: Settings and privacy → Content preferences → Video languages / Add language. Translation: Settings and privacy → Language section → Translation language / 'Always show translation'.
- **Gotchas:** UNVERIFIED-DIRECT: support.tiktok.com is a JS app that would not render in any fetch/browser attempt (blank page), so these paths come from search-engine snippets of the official article (support.tiktok.com/en/getting-started/setting-up-your-profile/changing-language-preferences) plus third-party guides — re-verify in the app before publishing exact menu names. The verified conceptual split stands: App language does NOT change what the For You feed serves; 'Content preferences' video languages is the feed-side control, and the feed still weighs watch behavior heavily — watching Russian videos re-teaches the algorithm regardless of settings.
- **Impact:** App language = chrome only; video languages = For You feed prioritization; translation language = comments/captions translation target.
- **Verify:** Check Settings and privacy → Language and Content preferences in the app; feed composition shifts gradually, not instantly.
- **Sources:** https://support.tiktok.com/en/getting-started/setting-up-your-profile/changing-language-preferences (official URL, content not directly renderable Aug 2026)

### Netflix display (profile) language

- **Set:** Per-profile Display Language → Українська (check the list; the help page does not enumerate languages). Audio & subtitles are configured separately.
- **Steps:** Web: netflix.com/account → Profiles → choose profile → Languages → Display Language → Save. Mobile app: My Netflix → profile name → Manage Profiles → profile → Display Language (applies immediately). TV: on the profile-selection screen → Edit → Language (auto-saves).
- **Gotchas:** Per-PROFILE, not per-account — set it for every profile in the household. Official note: if the change doesn't show on a device, sign out and back in. Audio/subtitle languages are a separate setting and per-title availability varies ('availability may vary depending on the title') — a Ukrainian UI doesn't guarantee Ukrainian dubs/subs exist for a given show.
- **Impact:** Menus and suggested audio/subtitle ordering for that profile on all devices.
- **Verify:** UI language changes across devices for that profile (after re-login if needed).
- **Sources:** https://help.netflix.com/en/node/13245

### Spotify app language

- **Set:** App language → Українська (check the list; the article does not enumerate languages).
- **Steps:** Desktop: profile picture → Settings → Language → sign out and back in. iOS: profile picture → Settings and privacy → Content and display → App language. Android 13+: same in-app path as iOS. Android 12 and older: change the DEVICE language — no in-app option. Web player: follows the BROWSER language.
- **Gotchas:** Three platform splits verified on the official page: Android below 13 has no in-app language setting at all (device language only); desktop requires sign-out/sign-in for the change to apply; the web player has no setting — it inherits the browser's language, so the browser must be set to Ukrainian first (cross-link to the browser section of the article). No content-language preference exists — recommendations follow listening behavior, not a setting.
- **Impact:** App chrome only; playlists/recommendations are behavior-driven.
- **Verify:** UI language after re-login (desktop) or immediately (mobile).
- **Sources:** https://support.spotify.com/us/article/change-language/

### Wikipedia interface language + the uk vs ru default-link problem

- **Set:** Logged-in: Special:Preferences → 'User profile' tab → language → uk — Українська. Content-side: there is NO Wikipedia setting that redirects ru.wikipedia links to uk.wikipedia — they are separate projects.
- **Steps:** Create/log into a Wikipedia account → Special:Preferences (Налаштування) → 'User profile' tab → 'Change the language of user-interface messages' → uk → Save. On any ru.wikipedia article, use the language switcher (Мови / Universal Language Selector) → Українська to jump to the uk article.
- **Gotchas:** Official caveat quoted on Help:Preferences: the interface-language setting 'does not affect articles and other pages made by editors' — it changes menus/messages only. Anonymous users cannot set UI language on most wikis (must log in). The 'search always lands me on ru.wikipedia' problem is a SEARCH-ENGINE ranking issue, not a Wikipedia setting: fix it by setting Ukrainian as the search results language (the article's Google section), searching uk.wikipedia.org directly, or habitually switching via the interlanguage link. A uk article may not exist for every ru article — the switcher only lists existing versions.
- **Impact:** Logged-in UI everywhere on that wiki; the interlanguage switcher is the per-article escape hatch from ru.wikipedia.
- **Verify:** After saving, wiki chrome (Читати/Редагувати etc.) renders in Ukrainian while article text is unchanged.
- **Sources:** https://en.wikipedia.org/wiki/Help:Preferences ; https://www.mediawiki.org/wiki/Universal_Language_Selector ; https://www.mediawiki.org/wiki/Help:Preferences

### Cross-cutting trap: UI language is not content language

- **Set:** In every app do BOTH: (1) interface → Ukrainian, and (2) the separate content/translation/recommendation language control → Ukrainian first, English second, Russian removed. Then stop feeding the recommenders Russian engagement signals.
- **Steps:** Per app, the content-side control is: X → 'Select additional languages' / 'Languages you may know'; TikTok → Content preferences → Video languages; Steam → Store Preferences → Language Preferences (secondary languages); Facebook → translation-language settings; Netflix → per-profile audio/subtitles.
- **Gotchas:** X documents the trap verbatim: changing display language 'does not change the language of the content you see on your Home timeline', and 'Languages you may know' is INFERRED from activity — so recommenders re-learn Russian from behavior even after settings are cleaned. Settings remove the declared signal; only changed viewing/engagement behavior removes the inferred one. Expect feeds to shift over days, not instantly.
- **Impact:** Explains why 'I switched everything to Ukrainian but still get Russian content' — and frames the two-layer model (interface layer vs content/recommendation layer) the whole article can be organized around.
- **Verify:** After cleaning both layers and avoiding Russian engagement for a while, inferred-language lists (e.g. X's 'Languages you may know') stop re-adding Russian.
- **Sources:** https://help.x.com/en/managing-your-account/how-to-change-language-settings ; https://help.x.com/en/rules-and-policies/recommendations ; https://partner.steamgames.com/doc/store/localization

### Cross-cutting notes — apps and services

Verification methods and gaps: help.x.com, facebook.com/help and help.instagram.com all block server-side fetching (403/empty), so those were verified by rendering the real pages in a browser (Aug 2026); the Meta pages rendered in Ukrainian, so the quoted Ukrainian menu labels are the exact official ones for the article. support.tiktok.com never rendered (blank JS shell) in any attempt — the TikTok paths are from search-engine snippets of the official article and MUST be re-verified in the app before publishing. Steam's consumer client-language path (Settings → Interface) has no findable official help.steampowered.com article; Ukrainian's full-platform support and the survey stat are from official Valve pages. Neither Netflix, Spotify nor X help pages enumerate available UI languages, so 'Ukrainian is in the dropdown' should be phrased as 'select Українська from the list' rather than asserted from the docs. Recommended ordering for the article: (1) device/OS language first (many apps — Facebook at signup, X mobile, Spotify on old Android, Instagram on iOS — inherit or hand off to it), (2) each app's interface language, (3) each app's separate content/translation/recommendation language controls, (4) behavioral note that recommenders re-infer Russian from engagement. Recently-changed settings worth flagging in the article: Instagram's section renamed to 'Мова й переклади' and its iPhone flow now hands off to iOS per-app language; Spotify's in-app language on Android requires Android 13+; X display language is web-only (mobile apps follow the device). Meta's Accounts Center does NOT own language settings — they remain per-app. Motivational hook verified for the Steam section: the public hardware survey's Language table (July 2026: Ukrainian 0.70% vs Russian 9.30%) is the number publishers consult for localization decisions.

## Must re-verify before publishing

Collected from the flags above — every item below lacked an official,
fetchable source and must be confirmed on a real device/UI before the guide
prints exact menu paths:

- **TikTok settings paths** — support.tiktok.com never rendered (blank JS
  shell); paths come from search snippets of the official article. Re-verify
  in the app.
- **iOS per-app language** (Параметри → Програми → [застосунок] → Мова) —
  real (iOS 13+, needs ≥2 system languages) but absent from Apple's current
  iPhone guide; verified only via developer-forum guidance.
- **Gboard language removal** — official help documents adding only; removal
  controls are UI-verified, not doc-verified.
- **Edge preferred-languages reorder wording** ("Move to the top") — confirmed
  only on secondary/policy pages, not the main support article.
- **Windows keyboard→language coupling** — keyboards nest under language
  entries, so a Russian layout normally implies a Russian entry in Preferred
  languages, but the exact add/remove semantics (and the display-language
  layout re-add) need an on-device pass.
- **Google Assistant Ukrainian support** — not confirmed from docs; check the
  on-device picker.
- **Office proofing-language menu path** — separate surface where Russian
  lingers; current path not re-verified.
- **Samsung/OEM Android paths** — only Pixel paths were verified; OEM menus
  differ.
- **YouTube mobile menu path and Maps iOS path** — taken from Google's
  platform-switched help articles without an independent re-fetch.
- **hl/lr/gl/cr on consumer google.com/search** — documented officially only
  for Programmable Search; they work today but carry no compatibility promise.

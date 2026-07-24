# Movar — Copy guideline

Source of truth for Movar's user-facing language. Sibling spec to [`docs/styleguide.md`](styleguide.md) — where the styleguide governs colour, type, surface geometry, and motion, this doc governs _what the product says_: voice, register, terminology, length, and the things Movar never says.

The voice was carved into the popup and the marketing site first; this doc codifies what's already there so the next writer doesn't drift it. Examples are pulled from the working corpus — `apps/extension/src/lib/i18n/messages-{uk,en}.ts` and `apps/marketing/src/i18n.ts` — not invented.

**Scope.** Governs the extension popup, options page, content-script curtains, error boundary, marketing site (home, OG card, `/privacy`, `/why-this-happens`), and store listings. Does not govern: `README.md`, commit messages, JSDoc, dev-only console messages — those follow general engineering conventions.

**Languages.** UA and EN are both canonical. New strings get drafted in parallel, not translated from one source. UA sets the register first when one language has to ship before the other; EN is allowed to read English-native rather than mirror UA word-for-word, as long as the claim, tone, and length-class match.

**Mission (brand-internal).** Two sides:

- **Promote** the user's mother tongue.
- **Protect** from foreign-language influence.

This frames every choice below. _Foreign_ and _mother tongue_ are mission-line words; user-facing copy uses mechanism-relative terms (_imposed_, _default_, _the language sites pick for you_ / «не та мова», «замовчування»).

---

## 1. Voice

Ten imperatives. Each is descriptive of the current corpus — locking what's already true so a new contributor can't drift it.

### 1.1 Movar is third person

_"Movar fixes that."_ / «Movar це виправляє.» Not _"We fix that."_, not «Ми виправляємо.»

_Exception:_ the Movar community can use _we_ / _ми_ in human-to-human contexts — the Close section, the contact-email line, the footer credits. Movar-the-product cannot.

### 1.2 State the claim and stop

No hedging, no please, no apology. _"Cyrillic gets read as Russian."_ — full stop. The error boundary says _"Movar hit an unexpected problem"_, not _"Sorry, an error occurred"_.

### 1.3 Distinguish state from speech

Labels (_Active_, _7 corrections today_, _Paused until 3pm_) are mechanical state, not narration. Voice happens twice across the whole product:

- The **applied moment** (_"Correction applied."_, one sentence per occurrence).
- **Marketing prose** (where Movar explains itself once to first-time visitors).

Every other string is state. The popup, the options page, the curtain titles — all state. The accent typography (forest dot, pulse animation) is what carries the voice in the applied moment; the words stay quiet.

### 1.4 The product never asks permission; controls ask, buttons act

_"Reload"_ / «Перезавантажити» — not _"Please reload"_. The user grants permission by installing; Movar uses it.

### 1.5 One canonical verb per specific action

Pick the verb that names the mechanism, use it everywhere it applies. Pin the canonical choice in §7 (Lexicon).

This rule does _not_ mean one verb across the whole product. The corpus correctly uses _додати_ (add a search hint), _просити_ (ask a server), _вести_ (lead to a URL), _казати_ (tell YouTube), _приховати_ (hide from picker), _перемкнути_ (switch a bilingual site) — seven verbs for seven distinct actions. The rule says: don't write _перемкнути_ in one string and _перевести_ in another when both mean "switch the site to your language".

### 1.6 Describe mechanisms, not motives

Movar explains the technology — corpus sizes, ranking, header behaviour, cookie scope. _"More Russian pages on the open web"_ is allowed; _"Russia did X"_ is not. The fight is with detectors and defaults, not with people.

### 1.7 Name the antagonist directly

_Russian_ / «російська» appears wherever the mechanism requires it. No euphemism. Full rules in §3.

### 1.8 Specific over abstract

Name the system, name the verb, name the consequence. _"Google, YouTube, Bing, DuckDuckGo"_ beats _"search engines"_. _"CLD2 and CLD3, fastText"_ beats _"the big detectors"_ alone — name them when the audience is technical (deep-dive), describe the class when the audience is general (home page).

### 1.9 No exclamation marks. No emoji. No ellipses

Quiet conviction is mechanical. Periods. Question marks where a question is asked. Em-dashes for asides. Nothing else.

### 1.10 Bilingual symmetry in proper nouns

_Movar_, _Google_, _YouTube_, _Chrome_, _Firefox_, _Edge_, _Safari_, _CLD2_, _CLD3_, _fastText_, _Wikipedia_, _Wikidata_ keep their Latin spelling in both languages. _Cyrillic_ → «кирилиця», _Ukrainian_ → «українська», _Russian_ → «російська», lowercase as adjectives. Technical strings (_Accept-Language_, _hl=_, _cr=_, locale codes _ru_, _uk_, _be_, _pl_) stay in mono in both languages.

---

## 2. Adding a new string — recipe

When a new surface lands and needs copy:

1. **Pick the register.** Promote, Protect, or State (§6.1). Decide before drafting — it picks your verbs.
2. **Brand-level or evidence-level?** A brand claim (_"Keep the internet in your language"_) would read the same if Movar shipped to Warsaw tomorrow. An evidence-level claim (_"Sites keep handing you Russian"_) names the current deployment's antagonist. Most surfaces are one or the other; the hero pattern is brand → evidence within two paragraphs.
3. **Look up the surface cap.** §6.2 has a row for every existing element type. If the surface is new, add a row to §6 in the same PR as the string lands.
4. **Draft EN and UA in parallel.** Not "draft EN, translate to UA". The two are both canonical; each is allowed to be idiomatic in its own language as long as the claim, tone, and length-class match. If you can only carefully draft one, draft UA first — it sets the register.
5. **Cross-check.** Run the draft against §1 (voice imperatives), §3 (antagonist rules), §4 or §5 (per-language mechanics), §7 (lexicon — verb is canonical?), §8 (no never-tones or never-patterns).
6. **Run `grill-copy` on the UA draft** for any string longer than a single word. The skill is the enforcer.
7. **Add to the i18n catalogue** (`messages-{uk,en}.ts` for the extension, `i18n.ts` for the marketing site). Use the existing `ukPlural()` helper for countable strings. Add a JSDoc comment if the string's context isn't obvious from the key — match the pattern in `messages-en.ts`.

---

## 3. Naming the two sides

Eleven rules. The trickiest section: Movar names the imposed default without becoming a politics product.

### 3.1 The antagonist is _forced default_, not any specific language

Movar fights the situation where a default overrides a stated preference. The current deployment acts on Russian most often because that's the dominant offender for the UA market. The grammar of the rules generalises — future deployments (BE → RU, PL → RU and DE, KA → RU, CA → ES) inherit the same brand rules.

### 3.2 Brand-level copy is locale-agnostic; evidence-level copy is deployment-specific

| Layer    | Surfaces                                                                                   | Names the language?           |
| -------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| Brand    | tagline, hero subhead, "Why Movar exists" eyebrow, footer credits, OG card, error boundary | No                            |
| Evidence | Problem facts, Examples, BeforeAfter, Stakes, deep-dive                                    | Yes, where mechanism requires |

The hero already does this: _"Keep the internet in your language"_ (brand) → _"Sites keep handing you Russian"_ (evidence) within two paragraphs.

### 3.3 Name the language by its name when the mechanism requires it

_Russian_ / «російська» appears in evidence-level copy where the mechanism is being explained. Lowercase as adjective in both languages. Locale codes (`ru`, `uk`, `be`, `pl`) stay in mono.

### 3.4 The agent is a corpus, a header, a detector, a CDN, a default — never a country or a people

_"More Russian pages on the open web"_ (corpus) ✓. _"Russia did X"_ ✗. _"Russians do X"_ ✗. _"Russian-language pages"_, _"the Russian variant"_, _"the Russian version"_ — fine.

### 3.5 Never use language as identity for an individual

A user is described by what they _asked for_ — _"browser set to Ukrainian"_, «браузер налаштовано на українську» — not by what language they _are_. Identity-language carries political weight; preference-language carries none.

Forbidden: _"a Russian speaker inside Ukraine"_, «російськомовний всередині України». Allowed (and used in the deep-dive after the §9.5 rewrite): _"a browser set to Russian, inside Ukraine"_, «браузер з налаштуванням «російська» всередині України».

### 3.6 Categories and markets are not identities

_"Ukrainian-language audience"_, _"Russian-language content"_, _"the Ukrainian internet"_, «україномовна аудиторія», «україномовний індекс» refer to market segments and corpora — descriptive, allowed. The line is at the _individual_ descriptor.

### 3.7 No political euphemisms

No _"aggressor's language"_, no _"language of the war"_, no _"occupier"_, no «мова країни-агресора». Movar fights detectors and defaults, not states. The styleguide's "loud nationalism" line holds in copy.

### 3.8 Don't sanitise either

Pretending Russian doesn't appear in copy when it's the cause of the message is evasion. Name it where the mechanism requires it.

### 3.9 Generic-then-specific in marketing prose

_"The wrong language"_ / «не ту мову» as a poetic generalisation in the lead; the next sentence names the language. The hero pattern: _"Sites keep handing you the wrong language..."_ → _"Sites keep handing you Russian."_

### 3.10 _"Language not in your list"_ / «мова не у вашому списку» is for genuinely generic cases only

Content-script curtain for non-RU blocked languages, where the language could be anything. Never use it to dodge naming Russian when Russian is what triggered the message.

### 3.11 The emotional centre is the user's stated preference being honoured

Not the enemy losing, not the nation winning. _"Correction applied"_, never _"Russian removed"_, never _"Ukrainian restored"_. The footer credits say _"Movar community · MIT license"_, not _"Movar resistance"_.

---

## 4. Ukrainian mechanics

Nine rules. All descriptive of the current corpus; enforcement points called out where they exist.

### 4.1 Formal address: ви, lowercase mid-sentence

«Маєте відгук?», «ви ввели українською», «вашого браузера». Never «Ви» mid-sentence (older deferential form; doesn't match the modern register). Never «ти» — the brand isn't your buddy.

### 4.2 Quotation marks: « » Ukrainian guillemets

«російська», «новини», «українська». No `"..."` ASCII dumb-quotes inside UA strings — those are reserved for JS delimiters. No `“…”` English curly quotes either.

### 4.3 Apostrophe: U+02BC ʼ (MODIFIER LETTER APOSTROPHE)

Standard Ukrainian orthography. «інтервʼю», «зв'язок» (with ʼ), «п'ять» (with ʼ). ASCII `'` (U+0027) is reserved for JS delimiters and EN possessives. U+2019 right-quote is forbidden inside UA. **Enforcement:** ESLint rule on string literals flagging non-ʼ apostrophes adjacent to Cyrillic.

### 4.4 Em-dash with spaces

«слово — слово». Used for asides, transitions. Never `—` without spaces (American style), never `–` en-dash for prose clauses.

### 4.5 En-dash for ranges, with spaces

«1 – 5», «120 – 240 px». Dimensions, quantities, page counts. Not for prose clauses.

### 4.6 Sentence-final punctuation outside guillemets

«слово». Period after the closing «, not inside. Same for `?` and `,` — UA convention, mirrors French/German practice.

### 4.7 Latin-form proper nouns preserved

_Movar_, _Google_, _YouTube_, _Chrome_, _Firefox_, _Edge_, _Safari_, _CLD2_, _CLD3_, _fastText_, _Wikipedia_, _Wikidata_ stay in Latin inside UA strings. No transliteration to «Мовар» etc. Tech tokens (_Accept-Language_, _hl=_, _cr=_, locale codes _ru_, _uk_, _be_, _pl_) in mono.

### 4.8 Lowercase nationality / language adjectives

«українська», «російська», «англійська», «білоруська», «польська», «грузинська», «казахська». Capital only at sentence start. Standard UA orthography — adjectives derived from nationality aren't capitalised, unlike EN.

### 4.9 Numerals as digits in UI

«1 година», «24 години», «7 днів». In prose, digits also preferred — UA convention is more digit-friendly than EN, and tabular figures are already baked into the typography system. Cardinal numbers must agree with plural noun forms via the `ukPlural()` helper in `messages-uk.ts`.

---

## 5. English mechanics

Eight rules. All descriptive of the current corpus.

### 5.1 Sentence case for headings

_"How it works"_, _"Why Movar was created"_, _"Why this keeps happening"_. Not Title Case. Locked across the marketing site.

### 5.2 Straight ASCII quotes

`"..."` and `'...'`. No curly `"…"` or `'…'` inside source — Manrope renders cleanly either way; smart-quote substitution would just be churn.

### 5.3 Oxford comma

_"Chrome, Firefox, and Edge"_. _"Google, YouTube, Bing, and DuckDuckGo"_. Already consistent.

### 5.4 British spelling

_localise_, _behaviour_, _recognise_, _optimise_, _colour_, _initialise_. Confirmed in the corpus — 4/4 British, 0/4 American. The product is European; this matches.

### 5.5 Punctuation outside quotes

_Movar shows "Active"_, not _Movar shows "Active."_ with the period inside. British style; consistent with §4.6's UA rule.

### 5.6 Numerals

Spell out one through ten in prose; digits for 11+ and in UI labels and ranges. _"three to four times larger"_ / _"1 hour"_ / _"24 hours"_. The deep-dive's _"a one- or two-word query"_ is the canonical hyphenated compound pattern.

### 5.7 UA words inside EN prose

Use ASCII double-quotes around the UA word; the word itself keeps its U+02BC apostrophe.

_"новини"_, _"інтервʼю"_ — never _"інтерв'ю"_ with ASCII apostrophe inside.

### 5.8 _Open source_ — two words, lowercase, no hyphen

Already canonical across hero, OG card, and footer.

**Shared with UA (don't restate but apply):** em-dash with spaces (§4.4), Latin-form proper nouns (§4.7), no `!` / emoji / `…` (§1.9).

---

## 6. Length & register

### 6.1 Three registers, picked per string

| Register    | When                                                        | Vocabulary                                                                                            | Example                                                                            |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Promote** | The user receives, surfaces, opens in their language        | _surface_, _put first_, _open in_, _keep_, _show_, _raise_ / _вивести нагору_, _показати_, _відкрити_ | _"Keep the internet in your language."_ / «Українські статті повертаються нагору.» |
| **Protect** | Movar blocks, hides, switches away from the imposed default | _switch away_, _hide_, _block_, _override_, _intercept_ / _перемкнути_, _приховати_, _заблокувати_    | _"Movar hid: …"_ / «Movar приховав перемикач мов»                                  |
| **State**   | Mechanical readout — label, count, status, error            | nouns, present-tense verbs, no voice                                                                  | _"Active"_ / _"7 corrections today"_ / «Призупинено»                               |

Mode is orthogonal. Both promote and protect have an **action** mode (one sentence) and an **explanation** mode (paragraph). The deep-dive is _protect-in-explanation_; HowItWorks steps are _promote-in-explanation_; the curtain title is _protect-in-action_; the hero subhead is _promote-in-action with a protect kicker_. No fourth register — explanatory copy still picks a side.

**The applied moment is the only seam.** _"Correction applied."_ / «Виправлення застосовано.» sits at _promote + protect_ simultaneously — Movar acted to protect, the user now has what they asked for. That's why it gets its own typography (the accent dot, the pulse). Anywhere else, pick one register.

### 6.2 Length caps by surface

| Surface        | Element                         | Cap                   | Register                 | Reference                                                                                                                              |
| -------------- | ------------------------------- | --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Popup          | Status pill                     | ≤ 12 chars            | state                    | _"Active"_ / «Активно»                                                                                                                 |
| Popup          | Primary button                  | ≤ 3 words             | state                    | _"Turn Movar off"_ / «Увімкнути Movar»                                                                                                 |
| Popup          | Section header (mono UPPERCASE) | ≤ 14 chars            | state                    | _"On this page"_ / «На цій сторінці»                                                                                                   |
| Popup          | Body sentence                   | ≤ 14 words            | state                    | _"Reload the page to re-apply Movar."_                                                                                                 |
| Popup          | Applied row                     | 1 sentence            | seam                     | _"Correction applied."_                                                                                                                |
| Popup          | Empty / null state              | 1 short sentence      | state                    | _"Nothing hidden here."_                                                                                                               |
| Options        | Section heading                 | ≤ 4 words             | state                    | _"Language priority"_ / «Пріоритет мов»                                                                                                |
| Options        | Section intro                   | ≤ 30 words            | promote or protect       | _"Movar will request each site in this order; the first available wins."_                                                              |
| Options        | Aside explanation               | ≤ 50 words            | promote-in-explanation   | _"Movar negotiates each request..."_                                                                                                   |
| Options        | Inline error                    | 1 short sentence      | state                    | _"Enter a domain like example.com"_                                                                                                    |
| Options        | Insights count / label          | ≤ 6 words             | state                    | _"7 corrections this week"_ / «7 виправлень цього тижня»                                                                               |
| Curtain        | Title                           | 2–4 words             | protect                  | _"Some options hidden"_ / «Деякі варіанти приховано»                                                                                   |
| Curtain        | Body                            | 1 sentence            | protect                  | _"Movar hid: новини, інтервʼю."_                                                                                                       |
| Curtain        | Button                          | 1–2 words             | promote                  | _"Show"_ / «Показати»                                                                                                                  |
| Error boundary | Title                           | 1 sentence ≤ 10 words | state                    | _"Movar hit an unexpected problem"_                                                                                                    |
| Error boundary | Description                     | ≤ 30 words            | state                    | _"The popup ran into an error..."_                                                                                                     |
| Hero           | Headline (2 lines)              | 2 × 3–4 words         | promote                  | _"Keep the internet / in your language."_                                                                                              |
| Hero           | Subhead                         | ≤ 25 words            | promote + protect kicker | _"Sites keep handing you the wrong language even when you've asked clearly. Movar fixes that — quietly, without translating a thing."_ |
| Section        | Eyebrow                         | 3–6 words             | n/a                      | _"Why Movar was created"_                                                                                                              |
| Section        | Lead                            | ≤ 30 words            | promote or protect       | _"Sites keep handing you Russian..."_                                                                                                  |
| Fact           | Heading                         | ≤ 10 words            | matches section          | _"Cyrillic gets read as Russian."_                                                                                                     |
| Fact           | Body                            | ≤ 50 words            | protect-in-explanation   | _"Search engines see Cyrillic letters..."_                                                                                             |
| HowItWorks     | Step title                      | ≤ 12 words            | promote                  | _"Bilingual sites open in your version, not theirs."_                                                                                  |
| HowItWorks     | Step body                       | ≤ 45 words            | promote-in-explanation   | (full step body)                                                                                                                       |
| Examples       | Site                            | 1–3 words             | state                    | _"Google"_                                                                                                                             |
| Examples       | Scenario                        | ≤ 18 words            | protect-in-explanation   | _"You type a Cyrillic search like 'політика' or 'новини'."_                                                                            |
| Examples       | Without                         | ≤ 30 words            | protect                  | _"The top results are in Russian..."_                                                                                                  |
| Examples       | With                            | ≤ 30 words            | promote                  | _"Movar adds a Ukrainian-language hint..."_                                                                                            |
| Limitations    | Does row                        | ≤ 18 words            | promote                  | _"Pushes your language to the top..."_                                                                                                 |
| Limitations    | Doesn't row                     | ≤ 22 words            | state                    | _"Translate anything..."_                                                                                                              |
| Privacy        | Lead                            | ≤ 50 words            | protect                  | _"Movar has no servers..."_                                                                                                            |
| Close          | Lead                            | ≤ 25 words            | warm (state/promote)     | _"Have a question, an idea..."_                                                                                                        |
| Footer         | Link                            | 1–2 words             | state                    | _"Privacy"_, _"Install"_                                                                                                               |
| OG card        | Tagline line                    | 2–4 words             | promote                  | _"Keep the internet"_                                                                                                                  |
| OG card        | Caption                         | ≤ 8 words             | state                    | _"Free · Open source · Nothing leaves your browser"_                                                                                   |
| Deep-dive      | Section heading                 | 4–10 words            | protect-in-explanation   | _"Language detectors guess from letters"_                                                                                              |
| Deep-dive      | Section lead                    | ≤ 30 words            | protect-in-explanation   | _"They don't read pages..."_                                                                                                           |
| Deep-dive      | Bullet point                    | ≤ 55 words            | protect-in-explanation   | (full bullet)                                                                                                                          |
| Store listing  | Tagline (Chrome/Edge: 132 ch)   | ≤ 132 chars           | promote + protect        | (not in repo yet)                                                                                                                      |
| Store listing  | Description                     | full prose            | promote + protect        | (not in repo yet)                                                                                                                      |
| Store listing  | Screenshot caption              | ≤ 12 words            | promote                  | (not in repo yet)                                                                                                                      |

Caps come from the current corpus — the longest existing example for each slot, rounded up by 1–2 units. When a new surface lands, add a row.

Onboarding & install-guide rows — the extension first-run page (`entrypoints/onboarding`) and the marketing `/install` guide share these caps. The permission step is the load-bearing one on both: its title/body must name the mechanism (Movar reads each page to detect its language) and point at the concrete action — a button that fires the native permission prompt directly on Chromium/Firefox (_"Allow access"_ / «Дозволити доступ»), manual Settings instructions on Safari (_"Allow on Every Website"_), per §1.6 and §1.8.

| Surface    | Element           | Cap        | Register          | Reference                                         |
| ---------- | ----------------- | ---------- | ----------------- | ------------------------------------------------- |
| Onboarding | Page title        | ≤ 4 words  | state             | _"Movar is installed"_ / «Movar встановлено»      |
| Onboarding | Lede              | ≤ 30 words | promote-in-action | _"Movar keeps every page in your language…"_      |
| Onboarding | Step title        | ≤ 5 words  | promote or state  | _"Let Movar read every site"_                     |
| Onboarding | Step body         | ≤ 30 words | promote or state  | _"Movar reads each page to detect its language…"_ |
| Onboarding | Permission status | 1 sentence | state             | _"Movar can read every page."_                    |
| Onboarding | Permission button | ≤ 3 words  | promote (action)  | _"Allow access"_ / «Дозволити доступ»             |
| Onboarding | Reassurance       | ≤ 40 words | protect (privacy) | _"Movar reads pages only to detect and switch…"_  |

---

## 7. Lexicon

The biggest section. Skim hardest here. Four sub-tables.

### 7.1 Action verbs — what Movar does, specific to each action

| Action                                   | EN preferred                           | UA preferred                               | Forbidden                                                                                |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Apply (umbrella; the seam)               | _apply_, _applied_                     | _застосувати_, _застосовано_               | _fix_, _intervention_, _translation_                                                     |
| Switch a bilingual site                  | _switch (to your language)_, _open in_ | _перемкнути (на)_, _відкрити з варіанту X_ | _translate_, _redirect_, _change_ / _перекласти_, _перенаправити_, _поміняти_            |
| Add a language hint to a search          | _add_, _attach_                        | _додати_                                   | _inject_, _modify_                                                                       |
| Negotiate with a server                  | _ask_, _request_                       | _просити_, _запитувати_                    | (none)                                                                                   |
| Take to a URL variant                    | _take to_, _lead to_                   | _вести на_, _відкривати_                   | _redirect_ (overloaded with HTTP), _переадресувати_                                      |
| Tell a search engine the language        | _tell_                                 | _казати_, _повідомляти_                    | _inform_, _notify_                                                                       |
| Hide a language from a picker            | _hide (from)_                          | _приховати (з)_                            | _remove_, _delete_, _censor_ / _видалити_, _цензурувати_                                 |
| Blur content cards in a blocked language | _blur_                                 | _розмити_                                  | _cover_, _mask_, _ban_                                                                   |
| Block a language (priority/block list)   | _block_                                | _заблокувати_                              | _ban_, _forbid_, _censor_ / _забанити_, _заборонити_                                     |
| Exempt a site (allowlist)                | _exempt_                               | _виключити_                                | _whitelist_, _allow_, _trusted_ / _вибілити_, _дозволити_                                |
| Pause action temporarily                 | _pause_                                | _призупинити_                              | _stop_, _halt_ / _зупинити_                                                              |
| Resume after pause                       | _resume now_                           | _продовжити_                               | _unpause_ / _розпочати знову_ (use «відновити» only for "restore" sense, not for resume) |
| Turn the extension off                   | _turn off_, _off_                      | _вимкнути_, _вимкнено_                     | _disable_, _deactivate_ / _відключити_                                                   |

### 7.2 Names for things

| Concept                        | EN preferred                                                                                  | UA preferred                                                                     | Forbidden in user copy                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| The user's chosen language     | _your language_, _the language you asked for_, _your browser's language_                      | _ваша мова_, _мова, яку ви обрали_, _мова браузера_                              | _mother tongue_, _native language_ / _рідна мова_, _материнська мова_ (mission line only)                |
| The imposed default            | _the default_, _the wrong language_, _the language sites pick for you_, _what sites hand you_ | _замовчування_, _не та мова_, _мова, яку обирає сайт за вас_                     | _aggressor's language_, _foreign language_ / _мова країни-агресора_, _іноземна мова_ (mission line only) |
| Russian (the language)         | _Russian_                                                                                     | _російська_                                                                      | _the Russian language_ (verbose), _Russky_                                                               |
| Ukrainian (the language)       | _Ukrainian_                                                                                   | _українська_                                                                     | _the Ukrainian language_ (verbose)                                                                       |
| Other priority/block languages | _Belarusian_, _Polish_, _Georgian_, _Kazakh_, _Catalan_, _Welsh_                              | _білоруська_, _польська_, _грузинська_, _казахська_, _каталонська_, _валлійська_ | (use English body forms; endonyms reserved for in-product language pickers)                              |
| User of the product            | _you_, _the reader_ (deep-dive), _a visitor_                                                  | _ви_, _читач_ (deep-dive), _відвідувач_                                          | _the user_ in voice copy, _our customers_ / _користувач_ in voice copy, _наші клієнти_                   |
| The Movar product              | _Movar_                                                                                       | _Movar_                                                                          | _the extension_ (>1× per surface), _the app_, _the tool_, _Мовар_ (transliteration)                      |
| The Movar community            | _Movar community_, _we_ (in Close/Footer/email)                                               | _спільнота Movar_, _ми_ (in Close/Footer/email)                                  | _the team_, _the developers_, _Movar Inc_, _корпорація_                                                  |

### 7.3 Technical terminology

| Concept                      | EN preferred        | UA preferred       |
| ---------------------------- | ------------------- | ------------------ |
| Browser                      | _browser_           | _браузер_          |
| Extension                    | _extension_         | _розширення_       |
| Site / website               | _site_              | _сайт_             |
| Page                         | _page_              | _сторінка_         |
| Search engine                | _search engine_     | _пошуковик_        |
| Default                      | _default_           | _замовчування_     |
| Setting                      | _setting_           | _налаштування_     |
| Locale                       | _locale_            | _локаль_           |
| Locale code                  | _locale code_       | _код локалі_       |
| Allowlist (code identifier)  | _allowlist_         | _allowlist_        |
| Allowlist (UI label)         | _exempt sites_      | _виключені сайти_  |
| Block list (code identifier) | _block list_        | _block list_       |
| Block list (UI label)        | _blocked languages_ | _заблоковані мови_ |
| Priority list (UI label)     | _language priority_ | _пріоритет мов_    |
| Pause                        | _pause_             | _призупинити_      |
| Resume                       | _resume_            | _продовжити_       |
| Toggle                       | _toggle_            | _перемикач_        |
| Reload                       | _reload_            | _перезавантажити_  |
| Settings                     | _Settings_          | _Налаштування_     |

### 7.4 Forbidden with replacements

| Forbidden                                                                         | Why                                              | Use instead                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| _translate_ / _перекласти_ (for what Movar does)                                  | Movar doesn't translate; it switches the version | _switch_, _open in_, _show_ / _перемкнути_, _відкрити_, _показати_                                            |
| _fight_, _battle_, _defeat_ / _боротися_, _перемогти_                             | No combat framing                                | _act on_, _switch_ / _діяти на_, _перемкнути_                                                                 |
| _aggressor_, _occupier_ / _окупант_, _агресор_                                    | Loud nationalism                                 | (_the imposed default_ / _замовчування_)                                                                      |
| _whitelist_, _blacklist_                                                          | OSS convention against                           | _allowlist_, _block list_ (code); _exempt sites_, _blocked languages_ (UI)                                    |
| _censor_, _cleanse_, _clean up Russian_                                           | Loaded                                           | _hide_, _blur_, _block_ / _приховати_, _розмити_, _заблокувати_                                               |
| _your native language_ (in product copy)                                          | Identity-charged                                 | _your language_ / _ваша мова_                                                                                 |
| _mother tongue_ (in product copy)                                                 | Sentimental; not always accurate                 | _your language_ / _ваша мова_                                                                                 |
| _Russian speaker_ as user descriptor / _російськомовний_ as individual descriptor | Identity → political weight                      | _a reader with Russian browser preference_, _a browser set to Russian_ / _читач з російською в налаштуваннях_ |
| _foreign language_ (in user copy)                                                 | Politically charged in user-facing copy          | _imposed default_, _the language you didn't choose_ / _замовчування_, _мова, яку ви не обирали_               |
| _sorry_, _please_ / _вибачте_, _будь ласка_                                       | Movar doesn't apologise, doesn't beg             | (just say the thing)                                                                                          |
| _just_, _easily_, _simply_ / _просто_, _легко_                                    | Tells the reader, doesn't show them              | (drop the softener; the verb carries)                                                                         |
| _coming soon!_, _stay tuned_ / _слідкуйте за оновленнями_                         | Roadmap-y                                        | (omit; the existing _Soon_ / _Незабаром_ badge on download CTAs is the only allowed exception)                |
| _try it now!_, _get started!_ / _спробуйте просто зараз!_                         | Sales-y / hype                                   | (no CTAs that beg)                                                                                            |

---

## 8. Nevers

The styleguide's "Avoid" list is preserved verbatim and applies in copy: **no tridents, no embroidery patterns, no military cues, no loud nationalism, no flag-colour pairings.**

§7.4 covers word-level nevers. This section covers the tones, patterns, and structures.

### 8.1 Never-tones

- **Sales-y / hype.** _"Try it now!"_, _"Best ever!"_, _"Powered by Movar"_, «Спробуйте просто зараз!». "Never loud."
- **Patronising / explanatory-by-default.** _"As you know..."_, _"To put it simply..."_, _"Let me explain..."_, «Як ви знаєте...». The reader is competent.
- **Sentimental.** _"Cherish your mother tongue"_, _"Love your language"_, «Бережіть рідну мову». Quiet conviction isn't lyric poetry.
- **Conspiratorial.** _"Big Tech hides Ukrainian"_, _"They don't want you to read Ukrainian"_, «Вони не хочуть, щоб ви читали українською». Mechanism, not motive.
- **Marketing meta-talk.** _"Movar is the simple way to..."_, _"Get started in seconds!"_, «Movar — це найпростіший спосіб...». Movar doesn't pitch itself; it works.
- **Branded interjections.** _"Movar to the rescue"_, _"Movar saves the day"_, _"It's Movar time"_, «Movar поспішає на допомогу». The brand mark is a glyph, not a slogan.
- **_"Just"_, _"easily"_, _"simply"_ as softeners.** _"Just click here"_, _"Easily switch"_, «просто натисніть». Tells, doesn't show.

### 8.2 Never-patterns

- **All-caps shouting in body text.** Status pills are sentence case (_"Active"_, not _"ACTIVE"_; «Активно», not «АКТИВНО»). Caps reserved for: mono section headers (per styleguide), proper nouns, locale codes.
- **Rhetorical question marks.** _"Want better search results?"_, _"Tired of Russian?"_, «Втомилися від російської?». Question marks are reserved for genuine prompts (_"Have feedback?"_ / «Маєте відгук?»).
- **Roadmap-y promises.** _"Coming soon to Safari"_, _"We're working on..."_, «Слідкуйте за оновленнями». _Exception:_ the `download.soon` badge (_"Soon"_ / «Незабаром») on store CTAs is allowed — it's mechanical state on a specific button, not anticipation prose.

### 8.3 Never-structural

- **Hero → social proof → CTA layout.** Movar's structure is _problem → mechanism → evidence → choice_. Conversion-funnel layouts read loud.
- **FAQ blocks.** Questions get answered as continuous prose (the deep-dive pattern), not as collapsed Q&A entries. Q&A invites skimming over the mechanism.
- **Testimonials.** No _"Movar saved me hours!"_ quotes anywhere. The brand doesn't borrow other people's voices.
- **Counter / metrics as brand brag.** _"10,000+ users"_, _"1M corrections served"_, «1 млн виправлень». The popup's _"7 corrections today"_ is _the individual user's_ metric, not Movar's brag. Aggregate stays private.

---

## 9. Worked examples

Seven annotated pairs. When a draft doesn't feel right, look here first.

### 9.1 The applied moment

> _"Correction applied."_ / «Виправлення застосовано.»

Demonstrates §1.3 (the only narrative moment), §6 seam (promote + protect simultaneously), §1.9 (no exclamation despite weight), §4.4 (period, not em-dash — accent typography carries the emotion).

**Bad variant:** _"Switched to Ukrainian!"_ / «Перемкнули на українську!» — exclamation, centred on identity not preference, _we_-implied first-person, drifts loud.

### 9.2 Naming the antagonist (evidence-level)

> _"Cyrillic gets read as Russian."_ / «Кирилицю читають як російську.»

Demonstrates §3.3 (name the language), §3.4 (agent is the detector, not a country/people), §1.2 (state-and-stop), §6.2 fact-heading cap.

**Bad variant:** «Російська мова перемагає українську в інтернеті.» — combat framing (§3.7), no mechanism (§1.6), anthropomorphised language (§3.4).

### 9.3 Status pill (state register, capped)

> _"Active"_ / _"Paused"_ / _"Off"_ — «Активно» / «Призупинено» / «Вимкнено»

Demonstrates §6.2 cap (≤ 12 chars), §6.1 state register, §1.3 not the applied moment, no terminal punctuation.

**Bad variant:** _"Movar is currently active and processing"_ — drifts into voice (§1.3), abstract (§1.8), runs the row width.

### 9.4 HowItWorks step (promote-in-explanation)

> _"Google, YouTube, Bing, and DuckDuckGo all guess your language from the letters you type — and Cyrillic looks like Russian to them. Movar attaches your actual language to every search before it leaves your browser, so they answer in the right one."_

Demonstrates §3.2 (brand → evidence), §1.8 (specific over abstract — four engines named), §6.1 (promote-in-explanation), §4.4 (em-dash with spaces), §7.1 (_attaches_ — canonical verb for adding a search hint), §3.3 (Russian named where mechanism requires).

**Bad variant:** _"Movar magically translates your searches into Ukrainian!"_ — _translate_ is forbidden (§7.4), exclamation (§1.9), _magically_ is hype (§8.1), no mechanism (§1.6).

### 9.5 Identity → preference rewrite (deep-dive)

The deep-dive's geo-IP example after the §3.5 rewrite:

> _"Geo-IP overrides the header. A browser set to Ukrainian, on a foreign network, gets Russian regardless of what the header claims. A browser set to Russian, inside Ukraine, gets the opposite. Neither matches the stated preference."_
>
> «Geo-IP перебиває заголовок. Браузер з налаштуванням «українська» у закордонній мережі отримує російську, незважаючи на заголовок. Браузер з налаштуванням «російська» всередині України — навпаки. Жодна з двох поведінок не збігається із заявленою.»

Demonstrates §3.5 (no language-as-identity for individuals), §3.11 (emotional centre is _stated preference_, not the speaker), §3.6 (the surviving _Україномовний індекс_ in the same section is a corpus descriptor — category, not identity — and stays).

### 9.6 Empty state (no voice, no apology)

> _"Nothing hidden here."_ / «Нічого не приховано.»

Demonstrates §1.2 (state-and-stop), no apology (§7.4), no redirect ("try visiting a..."), no exclamation, ≤ 4 words.

**Bad variant:** _"No corrections yet — try visiting a bilingual site!"_ — patronising (§8.1), exclamation (§1.9), suggests user behaviour (§1.4).

### 9.7 Brand → evidence progression (hero → Problem)

The two-paragraph pattern from §3.2 made concrete:

> Hero subhead (brand-level): _"Sites keep handing you the wrong language even when you've asked clearly. Movar fixes that — quietly, without translating a thing."_
>
> Problem lead (evidence-level): _"Sites keep handing you Russian. Even when you typed Ukrainian. Even when your browser is set to Ukrainian."_

Demonstrates §3.2 (brand-level locale-agnostic; evidence-level deployment-specific), §3.9 (generic-then-specific), §1.8 (specific naming once the brand promise has been made).

If Movar later ships a Belarusian-priority deployment, the hero subhead stays as-is; the Problem lead becomes deployment-specific to that audience.

---

## 10. Maintenance

### 10.1 Ownership

This doc is the source of truth. Voice or structural changes (§1, §3, §6.1, §8) need a PR with rationale. Lexicon row changes (§7) need a PR with a one-line "why this is now the canonical term" justification appended inline.

### 10.2 Update triggers

- **New surface lands** → add a row to §6.2 in the same PR as the surface.
- **New deployment locale lands** (BE/PL/KA/CA/CY/…) → add evidence-level guidance per locale to §3. Brand-level rules unchanged.
- **Mission revision** (rare) → review §1 and §3 in lockstep.

### 10.3 Enforcement

- **ESLint** flags non-orthographic apostrophes inside Cyrillic context (§4.3).
- **`grill-copy` skill** runs on any new UA string longer than a single word, as a pre-commit suggestion. The skill's instructions reference §7 (lexicon) as its working dictionary.
- **lefthook / commitlint** — cheap hard gates: no `!` in i18n string values, no emoji codepoints in string values, no ASCII apostrophe adjacent to Cyrillic (overlaps with the ESLint rule).

### 10.4 Cross-references

**Out from copy.md:** [`docs/styleguide.md`](styleguide.md) (typography, bilingual Cyrillic + Latin), [`../design-brief.md`](../design-brief.md) (brand origin), `apps/extension/src/lib/i18n/messages-{uk,en}.ts` and `apps/marketing/src/i18n.ts` (working corpus).

**Into copy.md:** `docs/styleguide.md §8 Voice & posture`, `design-brief.md Brand personality`, `README.md` development section — each links here.

### 10.5 Open work

Items spawned alongside this doc's first draft:

- [x] Apostrophe lint (ESLint rule for Cyrillic-context apostrophe orthography)
- [x] `apps/marketing/src/i18n.ts:346` orthographic fix (інтерв'ю → інтервʼю)
- [x] Deep-dive geo-IP rewrite (identity → preference, EN + UA)

When the next batch lands, add to this list and tick them off as resolved.

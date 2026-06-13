# Store listing copy

> **Superseded.** The shipping store copy now lives under `apps/extension/store-assets/copy/*` (see `deployment-checklist.md`). This file is a legacy draft kept for reference — prefer editing the `store-assets` copy.

Drafts for the Chrome Web Store, Edge Add-ons, and Firefox AMO submission forms. Strings are written to fit Chrome's tighter short-description limit (132 chars); they also fit Edge (~140) and AMO summary (250).

"Movar" is the brand name and is not translated.

---

## Short description — English (132 char limit)

> Keep search results in the language you read. Movar nudges Google, Bing, DuckDuckGo, and YouTube to match your language.

(120 chars)

## Short description — Ukrainian (132 char limit)

> Тримайте інтернет вашою мовою. Movar коригує Google, Bing, DuckDuckGo та YouTube, щоб результати показувались вибраною мовою.

(123 chars)

---

## Long description — English

> Movar keeps the internet in the language you actually read.
>
> Open a Ukrainian news site, click into an article, and suddenly the page is in Russian. Search Google with a Cyrillic word and the top results come back in the wrong language. Movar handles both. It rewrites search-engine URLs to enforce your language preference, and detects when a site has served the wrong language so you can switch with one click.
>
> Currently supported search engines: Google (every country domain — .com, .com.ua, .de, .fr, .co.uk, and the rest), Bing, DuckDuckGo, and YouTube.
>
> Preferred-language options: Ukrainian, English, German, French, Spanish, Italian, Polish.
>
> How it works
> • Pick your preferred language once in the options page.
> • Movar applies corrections automatically as you browse.
> • Open the popup to see Movar's status for the page you're viewing, pause Movar on the current site, or jump to settings.
>
> Privacy
> • No account, no sign-in.
> • No analytics, no telemetry.
> • Nothing leaves your device. Preferences live in browser storage; language detection and rewrites run entirely locally.
>
> Released under the MIT license.

## Long description — Ukrainian

> Movar тримає інтернет тією мовою, якою ви насправді читаєте.
>
> Відкриваєте український сайт новин, переходите до статті — і раптом сторінка російською. Шукаєте в Google кириличне слово, а перші результати не тією мовою. Movar усуває обидва випадки. Він додає в пошукові запити параметр вашої мови та виявляє сайти, що показали вам не ту мову, — щоб ви могли перемкнути її одним кліком.
>
> Підтримувані пошукові системи: Google (усі регіональні домени — .com, .com.ua, .de, .fr, .co.uk та інші), Bing, DuckDuckGo та YouTube.
>
> Доступні мови інтерфейсу: українська, англійська, німецька, французька, іспанська, італійська, польська.
>
> Як це працює
> • Один раз оберіть бажану мову на сторінці налаштувань.
> • Movar автоматично застосовує виправлення під час перегляду.
> • Відкрийте спливне вікно, щоб побачити стан Movar для сторінки, яку ви переглядаєте, призупинити Movar для поточного сайту або перейти до налаштувань.
>
> Приватність
> • Без облікового запису, без входу.
> • Без аналітики, без телеметрії.
> • Нічого не покидає ваш пристрій. Налаштування зберігаються у браузері; визначення мови та переписування URL виконуються повністю локально.
>
> Поширюється за ліцензією MIT.

---

## Length budgets per store (for reference)

| Store            | Short / summary | Long description |
| ---------------- | --------------- | ---------------- |
| Chrome Web Store | 132 chars       | 16,000 chars     |
| Edge Add-ons     | ~140 chars      | ~10,000 chars    |
| Firefox AMO      | 250 chars       | ~15,000 chars    |

## Verification claims to keep honest before submission

- **Supported search engines list** mirrors the per-site adapters under `apps/extension/src/sites/*` (Google/Bing/DuckDuckGo/YouTube redirect rules); host matching itself uses `isGoogleHost`/`isYouTubeHost` in `packages/host-match`. Update both together if a rule is added or removed.
- **Languages offered** mirror the language options surfaced by those adapters and the settings schema in `@movar/settings`. Add a language → update this file.
- **Privacy claim** ("nothing leaves your device") is true as long as no analytics or remote-config code is added. Re-verify before each major release.

# App Store Connect — "What's New in This Version"

App Store Connect **requires** "What's New" text for **every localization** on every
version after the app's first release (unlike Chrome / Firefox / Edge, where store
release notes are optional). Both the iOS and macOS platforms share the one app
record (`fyi.movar.safari`), so the same text is pasted for both.

Paste the block for each locale into **App Store Connect → [version] →
What's New in This Version**, under the matching language. Update this file each
release — distil the user-facing highlights from
[`apps/extension/CHANGELOG.md`](../../CHANGELOG.md); keep it short and in the
user's voice (what changed for them), not the developer changelog.

> **Always prepare both locales — Ukrainian _and_ English — every release;
> neither is optional.** Movar's audience is Ukrainian, so Ukrainian (uk) leads
> and English (en) is the fallback locale, but both ship every time.

---

## 1.6.0

**1.5.3 was never built for Safari** (the pbxproj stayed at 1.5.2), so Apple
users are coming from 1.5.2 — the 1.5.3 onboarding-illustrations item is folded
in below.

### Українська (uk)

```
Що нового у версії 1.6.0

• YouTube оновив вигляд своїх сторінок — Мовар знову розуміє їх усі: рекомендації поруч із відео, полиці Shorts, плейлисти й вкладки каналів.
• Мовар тепер фільтрує і дописи спільноти на каналах — російськомовні дописи приховуються так само, як відео.
• Повернення з відео до результатів пошуку більше не перезавантажує сторінку.
• Вкладка «Веб» у пошуку Google тепер теж дістає мовні налаштування — раніше вона непомітно їх оминала.
• Підказка про приватність під час знайомства з розширенням стала помітною карткою: без облікових записів, без аналітики, код відкритий.
• Кроки встановлення тепер показують справжній інтерфейс Safari — а не абстрактні сірі смужки.
```

### English (en)

```
What's new in 1.6.0

• YouTube redesigned its pages — Movar understands all of them again: the recommendations next to a video, Shorts shelves, playlists and channel tabs.
• Movar now also filters channel community posts — Russian-language posts are hidden just like videos.
• Returning from a video to your search results no longer reloads the page.
• Google's "Web" filter tab now gets your language preferences too — it used to slip past them unnoticed.
• The privacy note during onboarding is now a proper card: no accounts, no analytics, open source.
• The install steps now show Safari's real interface instead of abstract grey bars.
```

## 1.5.2

Bug-fix release — no new capability. **1.5.1 was never submitted to App Store
Connect** (tagged, never published — it reached no store), so Apple users are
coming from 1.5.0 and its YouTube bullet is folded in below as the lead item.
This block therefore covers 1.5.1 + 1.5.2 together; the standalone 1.5.1 block
further down is kept for the record only — do not paste it.

### Українська (uk)

```
Що нового у версії 1.5.2

• Виправлено відкриття відео з результатів пошуку YouTube: клік по відео більше не обривається — сторінка не блимає, і відео відкривається як слід.
• Зміна мов тепер одразу застосовується до вже відкритих вкладок — більше не треба перезавантажувати сторінку.
• Прихований вміст залишається прихованим після зміни мови інтерфейсу Мовара.
• Налаштування з програми «Мовар» надійніше доходять до розширення: якщо збереження не вдалося, зміну буде застосовано згодом, а не втрачено.
• Під час знайомства з розширенням у Safari тепер ідеться саме про Safari, а не про Chrome.
• «Показати все на цій сторінці» більше не переноситься на наступну сторінку на сайтах, що не перезавантажуються.
• Мовар більше не перериває пошук Google на сторінках, де є лише картки товарів.
• Заблокована мова більше не проходить через регіональні варіанти в перемикачах мов на сайтах.
• Виправлено кілька випадків, коли після «Показати все» ламалася верстка сайту або його власний перемикач мов.
• «Завжди пропускати цей сайт» тепер знімає активну паузу, тож Мовар одразу відновлює роботу, коли ви прибираєте сайт із винятків.
• Посилення безпеки: перехід на іншу мовну версію сторінки тепер відбувається лише за звичайними вебпосиланнями.
• Точніший підрахунок прихованих елементів і краща робота з клавіатурою в налаштуваннях.
```

### English (en)

```
What's New in 1.5.2

• Fixed opening videos from YouTube search results: clicking a video is no longer interrupted — the page doesn't blink, and the video opens as expected.
• Changing your languages now applies to tabs you already have open — no reload needed.
• Concealed content stays concealed after you switch Movar's interface language.
• Settings from the Movar app reach the extension more reliably: if a save doesn't go through, the change is applied later instead of being lost.
• Safari onboarding now talks about Safari instead of Chrome.
• "Show everything on this page" no longer carries over to the next page on sites that don't reload.
• Movar no longer interrupts Google searches on results pages that contain only product cards.
• A blocked language no longer slips through regional variants in sites' own language switchers.
• Fixed several cases where revealing content left a site's layout or its own language switcher broken.
• "Always skip this site" now clears an active pause, so Movar resumes right away when you un-skip the site.
• Security hardening: switching to another language version of a page now only follows ordinary web links.
• More accurate hidden-item counts, and better keyboard handling in settings.
```

## 1.5.1

### Українська (uk)

```
Що нового у версії 1.5.1

• Виправлено відкриття відео з результатів пошуку на YouTube. Раніше клік по відео у списку результатів міг обірватися — сторінка блимала, і відео не відкривалося; тепер воно відкривається як слід.
```

### English (en)

```
What's New in 1.5.1

• Fixed opening videos from YouTube search results. Clicking a video in the results list could be interrupted — the page blinked and the video wouldn't open; now it opens as expected.
```

## 1.5.0

### Українська (uk)

```
Що нового у версії 1.5.0

• Сайти-винятки тепер можна налаштувати прямо в розширенні. На сторінці налаштувань зʼявився редактор, де можна додати, переглянути й видалити сайти, на яких Movar нічого не робить, а у спливаючому вікні — дія «Завжди пропускати цей сайт», що додає поточний сайт до винятків одним натисканням. Домен зводиться до єдиного вигляду й охоплює піддомени.

• Google повертає результати вашою мовою навіть після капчі. Якщо Google показав перевірку «незвичний трафік», Movar тепер знову застосовує перемикання мови на сторінці результатів, куди вас повернуло, замість того щоб лишати її заблокованою мовою.

• Акуратніше приховування в Google: заголовок блоку «Схожі запитання» ховається разом з усіма прихованими питаннями, а не висить над порожнім місцем. «Показати все» повертає блок цілком.

• Виправлено пошук на українських крамницях на OpenCart (наприклад, yato.com.ua): сторінку українською більше не сприймає як російську, тож ваші результати пошуку не губляться.
```

### English (en)

```
What's New in 1.5.0

• Exempt sites are now managed right in the extension. Settings has a new editor to add, review, and remove sites where Movar does nothing, and the popup gains an "Always skip this site" action that exempts the current site in one click. Each domain is reduced to one canonical form and covers its subdomains.

• Google returns results in your language even after a captcha. If Google showed an "unusual traffic" check, Movar now re-applies its language switch on the results page you land back on, instead of leaving it in the blocked language.

• Tidier hiding on Google: the "People also ask" heading is hidden together with its concealed questions, instead of dangling over an empty box. "Show everything" brings the section back.

• Fixed on-site search on Ukrainian OpenCart shops (e.g. yato.com.ua): a Ukrainian page is no longer misread as Russian, so your search results are no longer lost.
```

## 1.4.3

### Українська (uk)

```
Що нового у версії 1.4.3

• Іконка на панелі інструментів тепер показує стан Movar: активний, приховує вміст на цій сторінці (з лічильником), призупинено, вимкнено, вимкнено для цього сайту або потребує уваги. Прибрано короткочасне блимання іконки під час завантаження сторінки, і тепер вона має однакову рамку в усіх станах.

• Надійніше перемикання мови в українських інтернет-магазинах. Movar відновлює власний перемикач мови на сайтах на базі UMI.CMS, де посилання «UKR» перенаправляло назад на російську версію, і більше не втрачає справжній перемикач на деяких сайтах, які позначають мову одразу для всієї сторінки.

• Стабільність. Усунуто збій фонового процесу під час завантаження сторінок, зупинено зайві перезавантаження в чаті Google AI Mode та скорочено кількість повторних записів правил (менше навантаження на Safari).

• Покращення застосунку-компаньйона: щойно вибрана вкладка тепер відкривається згори, а типографіку в усьому інтерфейсі уніфіковано.
```

### English (en)

```
What's New in 1.4.3

• The toolbar icon now shows Movar's state: active, hiding content on this page (with a count), paused, off, off for this site, or needing attention. Fixed a brief flicker on page load, and the icon now keeps a consistent border in every state.

• More reliable language switching on Ukrainian shops. Movar recovers a site's own language switcher on UMI.CMS-based shops whose "UKR" link redirected back to Russian, and no longer loses the real switcher on some sites that tag the whole page's language at once.

• Stability. Fixed a background crash during page loads, stopped needless reloads in Google AI Mode chat, and cut redundant rule writes (gentler on Safari).

• Companion app polish: a freshly selected tab now opens at its top, and text styling is unified across the app.
```

<!--
Older versions (kept for reference; ASC only shows the current version's text):

Prepend each new release above this comment as `## <version>` with uk + en blocks.
-->

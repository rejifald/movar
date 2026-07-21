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

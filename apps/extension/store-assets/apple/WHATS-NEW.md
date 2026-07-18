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

> Movar's audience is Ukrainian, so **Ukrainian (uk) is the primary text**;
> English (en) is the fallback locale.

---

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

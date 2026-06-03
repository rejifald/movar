# Movar — long description (English)

Used in the AMO and Chrome Web Store "description" fields. Default locale on AMO.

Lead: multilingual-user framing — UA→RU is _an_ example, not _the_ example. Voice, claims, and the worked examples are kept in step with the marketing site ([`apps/marketing/src/i18n.ts`](../../../marketing/src/i18n.ts) — hero, How it works, Examples, Privacy, Limitations). See [`../REQUIREMENTS.md`](../REQUIREMENTS.md) §2 for positioning notes and §4 for the section order this draft follows.

Status: synced to marketing copy. Char count ≈ 2,300, well under AMO 15k / CWS 16k / Edge 10k.

---

Keep the internet in your language. Sites keep handing you the wrong language even when you've asked clearly — your browser says one thing, the page loads in another. Set your preferred language once and Movar enforces it across search engines and multilingual sites, quietly, on every page you load — without translating a thing.

What it does

- Declares your language to search engines. Movar attaches your real language to the query itself, so Google, Bing, DuckDuckGo, and YouTube answer in the right one instead of guessing from your letters.
- Switches multilingual sites to your language. When a site hides your version behind another language, Movar takes you straight to yours — automatically, or with one click.
- Filters out what still slips through (optional). On sites that serve the wrong language no matter what you set, Movar hides those posts, videos, and results and prunes the unwanted options from on-site language pickers — item by item, nothing translated. Off by default; turn it on in settings.

Examples

The same idea applies to every country version of Google and to a growing list of multilingual sites. A few concrete cases:

- Google: search a Cyrillic word like "новини" and Ukrainian results come back to the top instead of Russian.
- Google's summary card: search "God of War" and the card beside the results reads in your language, not English.
- YouTube: the same search returns Ukrainian creators and recommendations rather than Russian ones.
- A multilingual shop: opens in your language instead of the default it would otherwise show.

Supported search engines

Google (.com, .com.ua, .de, .fr, .co.uk, .pl, .com.au), Bing, DuckDuckGo, YouTube.

Languages offered

Ukrainian, English, German, French, Spanish, Italian, Polish.

How it works

- Pick your preferred language once on the options page.
- Movar applies corrections as you browse — no fighting each site, every time.
- Open the popup to see today's correction counter, pause Movar on the current site, or jump to settings (where you can also switch on content filtering).

Privacy

- No account, no sign-in.
- No analytics, no telemetry.
- Nothing leaves your browser. Preferences live in browser storage; language detection, URL rewrites, and filtering all run locally — nothing is translated, and nothing about your browsing ever leaves your device.

Open source

Movar is open source under the MIT license.

Coming soon

Priority-driven language switching — set a ranked list of languages and Movar picks the highest-priority one available on each site.

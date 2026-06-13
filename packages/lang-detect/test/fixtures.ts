/**
 * Language-detection test corpus.
 *
 * Each fixture is body-text input for tier-7 engine tests (chrome-ai,
 * franc) and/or the existing detectCyrillicLanguage heuristic. Fixtures
 * carry TWO separate expected outcomes:
 *
 * - `expectedEngineLanguage` — BCP-47 code (or null) tier-7 engines should
 *   return on this input. Reflects the actual human-perceived language of
 *   the text. Used by chrome-ai/franc corpus tests (added when those
 *   engines land).
 *
 * - `expectedCyrillicHeuristic` — what detectCyrillicLanguage returns on
 *   this input today. Most non-Cyrillic fixtures resolve to 'unknown'.
 *   Cyrillic-dominant fixtures usually match `expectedEngineLanguage`,
 *   except where the heuristic genuinely can't decide (short text,
 *   tied-distinctive ambiguity) and returns 'unknown'.
 *
 * The two scores diverge by design — heuristic and engines solve different
 * problems and v1 keeps the split (see
 * docs/on-device-language-detection.md, decision 13).
 *
 * Maintenance:
 * - Add a fixture per real-world miss or regression.
 * - For mixed-language fixtures, build texts so the dominant-language
 *   distinctive count clearly exceeds the minority's (otherwise the
 *   heuristic returns 'unknown' on a tie — which is also a fine outcome
 *   to assert, but be explicit about which case you're testing).
 * - Keep texts realistic (no Lorem). Native-speaker-readable prose
 *   improves trigram detection reliability for engine assertions.
 */

import type { CyrillicLanguage } from '../src/index';

export interface LanguageFixture {
  /** Stable identifier for test reporting. */
  id: string;
  /** One-line human description of what the fixture exercises. */
  description: string;
  /** Categorization tags for filtering / grouping. */
  scenarios: readonly string[];
  /** The text input. */
  text: string;
  /** What tier-7 engines should return. null = no engine should claim a
   *  confident detection (too short, too ambiguous, mixed). */
  expectedEngineLanguage: string | null;
  /** What detectCyrillicLanguage returns on this input. */
  expectedCyrillicHeuristic: CyrillicLanguage;
}

// ─── Cyrillic singletons ─────────────────────────────────────────────────────

const cyrillicSingletons: readonly LanguageFixture[] = [
  {
    id: 'uk-pure',
    description: 'Pure Ukrainian paragraph with multiple distinctive letters (і, ї, є)',
    scenarios: ['cyrillic', 'single-language', 'movar-core'],
    text:
      'Сьогодні в Києві відкрилася нова виставка українського мистецтва. ' +
      'Художники представили свої роботи, які відображають культурну ' +
      'спадщину нашої країни. Експозиція триватиме до кінця літа.',
    expectedEngineLanguage: 'uk',
    expectedCyrillicHeuristic: 'uk',
  },
  {
    id: 'ru-pure',
    description: 'Pure Russian paragraph with distinctive ы/ё',
    scenarios: ['cyrillic', 'single-language', 'movar-core'],
    text:
      'Сегодня в Москве открылась новая выставка современного искусства. ' +
      'Художники представили свои работы, в которых ещё чувствуется ' +
      'влияние классических традиций. Посетителей ждёт богатая программа.',
    expectedEngineLanguage: 'ru',
    expectedCyrillicHeuristic: 'ru',
  },
  {
    id: 'be-pure',
    description: 'Pure Belarusian — uniquely Belarusian ў is the strongest single signal',
    scenarios: ['cyrillic', 'single-language', 'movar-core'],
    text:
      'Сёння ў Мінску адкрылася новая выстава беларускага мастацтва. ' +
      'Мастакі прадставілі свае працы, якія адлюстроўваюць культурную ' +
      'спадчыну нашай краіны. Выстава будзе працаваць да восені.',
    expectedEngineLanguage: 'be',
    expectedCyrillicHeuristic: 'be',
  },
  {
    id: 'bg-pure',
    description: 'Pure Bulgarian — ъ used as a vowel across many words',
    scenarios: ['cyrillic', 'single-language', 'movar-core'],
    text:
      'Днес в София се откри нова изложба на българско изкуство. ' +
      'Художниците представиха своите творби, които отразяват ' +
      'културното наследство на нашата страна. Изложбата ще продължи до есента.',
    expectedEngineLanguage: 'bg',
    expectedCyrillicHeuristic: 'bg',
  },
];

// ─── Cyrillic boundary cases ─────────────────────────────────────────────────

const cyrillicBoundary: readonly LanguageFixture[] = [
  {
    id: 'uk-distinctive-letter-only',
    description: 'Ukrainian with і but no ї/є/ґ — minimal UA signal still wins',
    scenarios: ['cyrillic', 'boundary', 'minimal-signal'],
    text: 'Згідно з інформацією від експертів, ситуація стабільна та контрольована.',
    expectedEngineLanguage: 'uk',
    expectedCyrillicHeuristic: 'uk',
  },
  {
    id: 'ru-no-distinctive-letters',
    description:
      'Russian sentence without any ы/ё/ъ/э — relies on the cyrillic-count fallback path',
    scenarios: ['cyrillic', 'boundary', 'fallback-path'],
    text: 'Здравствуйте, меня зовут Алексей, и я работаю инженером в большой компании.',
    expectedEngineLanguage: 'ru',
    expectedCyrillicHeuristic: 'ru',
  },
  {
    id: 'cyrillic-too-short-for-fallback',
    description:
      'A few Cyrillic chars with no distinctive letters — below MIN_CYRILLIC_FOR_FALLBACK',
    scenarios: ['cyrillic', 'boundary', 'too-short'],
    text: 'Привет',
    expectedEngineLanguage: null,
    expectedCyrillicHeuristic: 'unknown',
  },
];

// ─── Cyrillic fellow-victim & per-snippet regressions (issue #103) ───────────
//
// Confirmed divergences graduated to the corpus (per-snippet ADR decision 12).
// `expectedEngineLanguage` is the true human language; `expectedCyrillicHeuristic`
// is what the legacy `detectCyrillicLanguage` returns (unchanged by #103 — the
// fix lives in the set-difference classifier, exercised by the classify*.test.ts
// suites). These pin the shapes the snippet classifier must not conceal as ru.

const cyrillicFellowVictim: readonly LanguageFixture[] = [
  {
    id: 'bg-not-concealed-as-ru',
    description:
      'Bulgarian text whose only "ru-ish" letter is ъ — must classify bg, never ru, ' +
      'once bg is a candidate (ъ becomes inert {ru, bg}).',
    scenarios: ['cyrillic', 'fellow-victim', 'bulgarian', 'movar-core'],
    text: 'Аз съм българин и това е защото обичам родния си език',
    expectedEngineLanguage: 'bg',
    expectedCyrillicHeuristic: 'bg',
  },
  {
    id: 'be-not-concealed-as-ru-default-candidates',
    description:
      'Belarusian text — uniquely Belarusian ў wins even with bg in the candidate set; ' +
      'must never read as ru for a default UA user.',
    scenarios: ['cyrillic', 'fellow-victim', 'belarusian', 'movar-core'],
    text: 'Я ведаю беларускую мову, дзякуй за ўсё, што ў нас ёсць',
    expectedEngineLanguage: 'be',
    expectedCyrillicHeuristic: 'be',
  },
  {
    id: 'uk-apostrophe-pidyizd',
    description:
      "Ukrainian під'їзд — intra-word apostrophe is a uk/be keep-signal (rung-1 mark); " +
      'with і/ї present it resolves uk and must never read as ru.',
    scenarios: ['cyrillic', 'apostrophe', 'ukrainian', 'movar-core'],
    text: "під'їзд у новому будинку",
    expectedEngineLanguage: 'uk',
    expectedCyrillicHeuristic: 'uk',
  },
  {
    id: 'ru-title-trailing-url',
    description:
      'Russian title followed by a Latin URL. Raw char count is Latin-majority — without ' +
      'noise-stripping the snippet classifier scopes {en} and escapes detection. The legacy ' +
      'heuristic returns unknown (it counts no distinctive ru letters here).',
    scenarios: ['cyrillic', 'mixed-script', 'trailing-noise', 'movar-core'],
    text: 'Это важно для всех нас сегодня https://www.example.com/a/b/c/d/e',
    expectedEngineLanguage: 'ru',
    expectedCyrillicHeuristic: 'unknown',
  },
];

// ─── Latin singletons ────────────────────────────────────────────────────────

const latinSingletons: readonly LanguageFixture[] = [
  {
    id: 'en-pure',
    description: 'Pure English paragraph',
    scenarios: ['latin', 'single-language'],
    text:
      'Today in London a new exhibition of contemporary British art opened. ' +
      'Artists presented works that reflect the cultural heritage of the country. ' +
      'The exhibition will run until the end of summer.',
    expectedEngineLanguage: 'en',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'de-pure',
    description: 'Pure German with umlauts',
    scenarios: ['latin', 'single-language', 'diacritics'],
    text:
      'Heute eröffnete in Berlin eine neue Ausstellung zeitgenössischer deutscher Kunst. ' +
      'Künstler präsentierten ihre Werke, die das kulturelle Erbe des Landes widerspiegeln. ' +
      'Die Ausstellung läuft bis Ende des Sommers.',
    expectedEngineLanguage: 'de',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'fr-pure',
    description: 'Pure French with accents and apostrophes',
    scenarios: ['latin', 'single-language', 'diacritics'],
    text:
      "Aujourd'hui à Paris s'est ouverte une nouvelle exposition d'art contemporain français. " +
      'Les artistes ont présenté leurs œuvres qui reflètent le patrimoine culturel du pays. ' +
      "L'exposition durera jusqu'à la fin de l'été.",
    expectedEngineLanguage: 'fr',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'es-pure',
    description: 'Pure Spanish with ñ and accented vowels',
    scenarios: ['latin', 'single-language', 'diacritics'],
    text:
      'Hoy en Madrid se inauguró una nueva exposición de arte contemporáneo español. ' +
      'Los artistas presentaron sus obras, que reflejan el patrimonio cultural del país. ' +
      'La exposición permanecerá abierta hasta el final del verano.',
    expectedEngineLanguage: 'es',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'pt-pure',
    description: 'Pure Portuguese with til/cedilla',
    scenarios: ['latin', 'single-language', 'diacritics'],
    text:
      'Hoje em Lisboa abriu uma nova exposição de arte contemporânea portuguesa. ' +
      'Os artistas apresentaram as suas obras, que refletem o património cultural do país. ' +
      'A exposição estará aberta até ao fim do verão.',
    expectedEngineLanguage: 'pt',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'pl-pure',
    description: 'Pure Polish with ą/ę/ć/ł/ś/ź — distinctive Latin diacritics',
    scenarios: ['latin', 'single-language', 'diacritics'],
    text:
      'Dziś w Warszawie otwarto nową wystawę współczesnej polskiej sztuki. ' +
      'Artyści przedstawili swoje prace, które odzwierciedlają dziedzictwo kulturowe kraju. ' +
      'Wystawa będzie czynna do końca lata.',
    expectedEngineLanguage: 'pl',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'tr-pure',
    description: 'Pure Turkish with ş/ğ/ı/ç',
    scenarios: ['latin', 'single-language', 'diacritics'],
    text:
      "Bugün İstanbul'da çağdaş Türk sanatının yeni bir sergisi açıldı. " +
      'Sanatçılar, ülkenin kültürel mirasını yansıtan eserlerini sergilediler. ' +
      'Sergi yaz sonuna kadar açık kalacak.',
    expectedEngineLanguage: 'tr',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'it-pure',
    description: 'Pure Italian',
    scenarios: ['latin', 'single-language'],
    text:
      'Oggi a Roma si è aperta una nuova mostra di arte contemporanea italiana. ' +
      'Gli artisti hanno presentato le loro opere, che riflettono il patrimonio culturale del paese. ' +
      "La mostra rimarrà aperta fino alla fine dell'estate.",
    expectedEngineLanguage: 'it',
    expectedCyrillicHeuristic: 'unknown',
  },
];

// ─── Other-script singletons ─────────────────────────────────────────────────

const otherScriptSingletons: readonly LanguageFixture[] = [
  {
    id: 'el-pure',
    description: 'Pure Greek',
    scenarios: ['other-script', 'single-language'],
    text:
      'Σήμερα στην Αθήνα άνοιξε μια νέα έκθεση σύγχρονης ελληνικής τέχνης. ' +
      'Οι καλλιτέχνες παρουσίασαν τα έργα τους, που αντικατοπτρίζουν την ' +
      'πολιτιστική κληρονομιά της χώρας. Η έκθεση θα διαρκέσει μέχρι το τέλος του καλοκαιριού.',
    expectedEngineLanguage: 'el',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'ar-pure',
    description: 'Pure Arabic (RTL)',
    scenarios: ['other-script', 'single-language', 'rtl'],
    text:
      'افتتح اليوم في القاهرة معرض جديد للفن العربي المعاصر. ' +
      'قدم الفنانون أعمالهم التي تعكس التراث الثقافي للبلاد. ' +
      'سيستمر المعرض حتى نهاية الصيف.',
    expectedEngineLanguage: 'ar',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'he-pure',
    description: 'Pure Hebrew (RTL)',
    scenarios: ['other-script', 'single-language', 'rtl'],
    text:
      'היום נפתחה בתל אביב תערוכה חדשה של אמנות ישראלית עכשווית. ' +
      'אמנים הציגו את יצירותיהם, המשקפות את המורשת התרבותית של המדינה. ' +
      'התערוכה תהיה פתוחה עד סוף הקיץ.',
    expectedEngineLanguage: 'he',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'zh-pure',
    description: 'Pure Simplified Chinese',
    scenarios: ['other-script', 'single-language', 'cjk'],
    text:
      '今天，北京开幕了一场新的中国当代艺术展览。' +
      '艺术家们展示了反映国家文化遗产的作品。' +
      '展览将持续到夏末。',
    expectedEngineLanguage: 'zh',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'ja-pure',
    description: 'Pure Japanese — mixed kanji/hiragana/katakana',
    scenarios: ['other-script', 'single-language', 'cjk'],
    text:
      '今日、東京で現代日本美術の新しい展覧会が開幕しました。' +
      'アーティストたちは、国の文化遺産を反映した作品を展示しました。' +
      '展覧会は夏の終わりまで開催されます。',
    expectedEngineLanguage: 'ja',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'ko-pure',
    description: 'Pure Korean — Hangul throughout',
    scenarios: ['other-script', 'single-language', 'cjk'],
    text:
      '오늘 서울에서 새로운 한국 현대 미술 전시회가 열렸습니다. ' +
      '예술가들은 국가의 문화유산을 반영하는 작품을 선보였습니다. ' +
      '전시회는 여름이 끝날 때까지 열립니다.',
    expectedEngineLanguage: 'ko',
    expectedCyrillicHeuristic: 'unknown',
  },
];

// ─── Mixed-language: majority wins ───────────────────────────────────────────

const mixedLanguage: readonly LanguageFixture[] = [
  {
    id: 'uk-with-ru-citation',
    description:
      'Ukrainian article with one Russian quoted citation. Overall content is Ukrainian; ' +
      'engines and heuristic should both call it uk. (User-specified case from grill session.)',
    scenarios: ['mixed-language', 'majority-wins', 'citation', 'movar-core'],
    text:
      'Сьогодні відома українська письменниця представила свою нову книгу про дитинство в селі. ' +
      'Вона розповіла журналістам про яскраві спогади дитинства та родинні традиції. ' +
      'У книзі є цитата її бабусі, яку авторка особливо любила: ' +
      '«Когда я была маленькой, мы жили совсем по-другому, в полном достатке.» ' +
      'Ця коротка фраза російською мовою додає особливого колориту розповіді. ' +
      'Презентація відбулася у центральній бібліотеці міста.',
    expectedEngineLanguage: 'uk',
    expectedCyrillicHeuristic: 'uk',
  },
  {
    id: 'ru-with-uk-citation',
    description:
      'Symmetric case — Russian article with an embedded Ukrainian quoted citation. ' +
      'Russian body is engineered with multiple ё occurrences so heuristic ruDistinctive > ukScore.',
    scenarios: ['mixed-language', 'majority-wins', 'citation'],
    text:
      'Сегодня известный российский писатель представил свою новую книгу о детстве в деревне, ' +
      'ещё одну из своих лучших работ. Он рассказал журналистам о ярких воспоминаниях детства ' +
      'и любимой бабушке, которая всегда подчёркивала важность семейных корней. ' +
      'В книге есть особая цитата её слов: «Не плач, моє дитя, усі біди минуть, як весняний дощ.» ' +
      'Эта тёплая фраза на украинском языке остаётся самым ярким воспоминанием автора.',
    expectedEngineLanguage: 'ru',
    expectedCyrillicHeuristic: 'ru',
  },
  {
    id: 'en-with-de-citation',
    description: 'English article with a German quoted citation — engine should still call en',
    scenarios: ['mixed-language', 'majority-wins', 'citation'],
    text:
      'Today in Berlin a major museum opened a new exhibition focusing on European modern art ' +
      'from the late 20th century. The exhibition features works by international artists. ' +
      'The curator commented in German: «Diese Ausstellung zeigt die Vielfalt der europäischen ' +
      'Kunst und ihre tiefen Verbindungen zur Geschichte.» This citation in German adds ' +
      "authenticity to the exhibition's historical context. Visitors can explore the exhibits " +
      'until next spring.',
    expectedEngineLanguage: 'en',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'de-with-en-tech-terms',
    description:
      'German tech article with scattered English loanwords ("machine learning", "neural ' +
      'networks") — engine should still call de despite the noise',
    scenarios: ['mixed-language', 'majority-wins', 'loanwords'],
    text:
      'Die neue Studie zur künstlichen Intelligenz wurde gestern in Berlin veröffentlicht. ' +
      'Die Forscher analysierten verschiedene machine learning Algorithmen und deren Anwendung ' +
      'in der Praxis. Insbesondere wurden deep learning Modelle und ihre Performance bei der ' +
      'Bilderkennung untersucht. Die Ergebnisse zeigen, dass moderne neural networks erheblich ' +
      'besser abschneiden als traditionelle Methoden. Die Forschung wird mit verschiedenen ' +
      'Industriepartnern fortgesetzt.',
    expectedEngineLanguage: 'de',
    expectedCyrillicHeuristic: 'unknown',
  },
];

// ─── Mixed-script: minority script tokens shouldn't tip the verdict ──────────

const mixedScript: readonly LanguageFixture[] = [
  {
    id: 'en-with-cyrillic-name',
    description:
      'English article naming "Иван Дорн" once. Cyrillic count is below MIN_CYRILLIC_FOR_FALLBACK ' +
      '(10), no distinctive letters — heuristic returns unknown; engines should return en.',
    scenarios: ['mixed-script', 'majority-wins', 'proper-noun'],
    text:
      'The renowned Ukrainian musician Иван Дорн released his new album today, drawing ' +
      'critical acclaim from international media. His unique blend of pop, funk, and Ukrainian ' +
      'folk music has resonated with audiences worldwide. The artist, whose real name is Ivan ' +
      'Dorn, has built a career spanning over a decade. Fans can stream the album on all ' +
      'major platforms starting today.',
    expectedEngineLanguage: 'en',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'uk-with-latin-brand-names',
    description:
      'Ukrainian tech article with brand names (Apple, iPhone, Samsung, Microsoft). ' +
      'Heuristic finds plenty of UA distinctives in surrounding prose.',
    scenarios: ['mixed-script', 'majority-wins', 'proper-noun'],
    text:
      'Сьогодні компанія Apple представила нову модель iPhone з покращеними характеристиками ' +
      'камери та продуктивності. Користувачі також зможуть оцінити новий чіп від Samsung, ' +
      'який підвищує швидкість обробки даних. Конкуренти на ринку, включаючи Microsoft та ' +
      'Google, активно розвивають свої власні технології. Експерти прогнозують значне ' +
      'зростання продажів у новому році.',
    expectedEngineLanguage: 'uk',
    expectedCyrillicHeuristic: 'uk',
  },
];

// ─── Edge cases ──────────────────────────────────────────────────────────────

const LONG_SAMPLE_REPEATS = 10;

const edgeCases: readonly LanguageFixture[] = [
  {
    id: 'empty',
    description: 'Empty string — both engine and heuristic return null/unknown',
    scenarios: ['edge', 'boundary'],
    text: '',
    expectedEngineLanguage: null,
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'whitespace-only',
    description: 'Spaces, tabs, newlines — no detectable content',
    scenarios: ['edge', 'boundary'],
    text: '   \n\t   \n  ',
    expectedEngineLanguage: null,
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'single-character-latin',
    description: 'Single Latin character — far too short for confident detection',
    scenarios: ['edge', 'boundary'],
    text: 'A',
    expectedEngineLanguage: null,
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'numbers-only',
    description: 'Numeric content — no language',
    scenarios: ['edge', 'boundary'],
    text: '12345 67890 3.14159 2.71828',
    expectedEngineLanguage: null,
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'punctuation-only',
    description: 'Punctuation marks only — no language',
    scenarios: ['edge', 'boundary'],
    text: '!?... — ;:,.()[]{}"\'',
    expectedEngineLanguage: null,
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'emoji-in-english',
    description: 'English sentence sprinkled with emoji — emoji ignored by detectors',
    scenarios: ['edge', 'mixed-script'],
    text: 'Hello 👋 world! Today is a great day ☀️ to read a good book 📚 and relax.',
    expectedEngineLanguage: 'en',
    expectedCyrillicHeuristic: 'unknown',
  },
  {
    id: 'long-english-exceeds-sample-cap',
    description:
      'English text longer than the 2000-char sampler cap. Engines see only the first 2000 chars ' +
      'after the sampler trims; assertion remains en. (Driven through the sampler in apps/extension; ' +
      'engine-only tests should slice to maxChars themselves.)',
    scenarios: ['edge', 'sampler-cap'],
    text: (
      'The history of art reflects the cultural evolution of civilizations across centuries. ' +
      'From the cave paintings of Lascaux to the digital installations of the present day, ' +
      'artists have continually pushed the boundaries of expression and meaning. ' +
      'Each era brings its own conventions, materials, and concerns, and yet certain themes ' +
      'recur — the human figure, the natural world, the divine, the ordinary made strange. '
    ).repeat(LONG_SAMPLE_REPEATS),
    expectedEngineLanguage: 'en',
    expectedCyrillicHeuristic: 'unknown',
  },
];

// ─── Aggregate ───────────────────────────────────────────────────────────────

export const FIXTURES: readonly LanguageFixture[] = [
  ...cyrillicSingletons,
  ...cyrillicBoundary,
  ...cyrillicFellowVictim,
  ...latinSingletons,
  ...otherScriptSingletons,
  ...mixedLanguage,
  ...mixedScript,
  ...edgeCases,
];

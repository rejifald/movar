/*
 * The diagnosis model, driven directly.
 *
 * `marketing.guide.spec.ts` covers the same ground through a browser, and has
 * to: it is the only thing that can prove the widget renders what the model
 * says. But a user-agent table costs a page load per row there and a line here,
 * so the table itself is exercised in full here and sampled there.
 *
 * Every case below is a claim about behaviour that shipped wrong once or could:
 * the fault ladder that could only report one fault, the platform routing that
 * would send a Safari reader to a Safari menu that does not exist, and the
 * highlight row that would otherwise point at whichever language happened to be
 * last.
 */
import { describe, expect, it } from 'vitest';

import {
  describeAgent,
  diagnosisStrings,
  faultCountLabel,
  fixHighlight,
  fixHighlightRow,
  guideFaults,
  guideFix,
  guideLanguages,
  resolveFixTarget,
} from './guide-diagnosis';
import type { GuideFault, GuideFixTarget } from './guide-diagnosis';

const TARGETS: readonly GuideFixTarget[] = [
  'chrome',
  'chrome-android',
  'edge',
  'firefox',
  'macos',
  'windows',
  'ios',
  'android',
];

const FAULTS: readonly GuideFault[] = ['blocked', 'absent', 'notFirst'];

/** Stand-in names, so the tests do not depend on the host's ICU data. */
const name = (code: string): string => `<${code}>`;

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefoxMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
  bot: 'SomeCrawler/1.0 (+https://example.test/bot)',
} as const;

describe('guideLanguages', () => {
  it('collapses regional tags to one entry per language', () => {
    // `uk-UA` and `uk` are one claim. Numbering the raw tags would tell a
    // reader their list is longer than it is.
    expect(guideLanguages(['ru-RU', 'ru', 'en-US'], name).map((l) => l.code)).toEqual(['ru', 'en']);
  });

  it('ranks by language, not by tag', () => {
    const languages = guideLanguages(['uk-UA', 'uk', 'en'], name);

    expect(languages.map((l) => l.rank)).toEqual([1, 2]);
  });

  it('marks the target and the blocked language, and nothing else', () => {
    const roles = guideLanguages(['uk', 'ru', 'en'], name).map((l) => l.role);

    expect(roles).toEqual(['target', 'blocked', 'other']);
  });

  it('is case- and separator-insensitive about the primary subtag', () => {
    expect(guideLanguages(['UK-ua', 'RU'], name).map((l) => l.role)).toEqual(['target', 'blocked']);
  });

  it('drops empty tags rather than ranking them', () => {
    expect(guideLanguages(['', 'uk'], name).map((l) => l.code)).toEqual(['uk']);
  });

  it('names each language through the injected namer', () => {
    expect(guideLanguages(['uk'], name)[0]?.name).toBe('<uk>');
  });
});

describe('guideFaults', () => {
  /*
   * The first row is the regression this model exists for. An ordered
   * first-match table could only report one fault, so `['ru']` — Ukrainian
   * missing AND Russian asked for — reported only whichever row came first.
   */
  const CASES: readonly (readonly [string, readonly string[], readonly GuideFault[]])[] = [
    ['Russian only reports both faults', ['ru'], ['blocked', 'absent']],
    ['regional Russian counts the same', ['ru-RU', 'ru', 'en-US'], ['blocked', 'absent']],
    ['Russian below Ukrainian is still a fault', ['uk', 'en', 'ru'], ['blocked']],
    ['Russian above Ukrainian is two faults', ['en', 'uk', 'ru'], ['blocked', 'notFirst']],
    ['Ukrainian second', ['en-US', 'uk'], ['notFirst']],
    ['no Ukrainian at all', ['en', 'de'], ['absent']],
    ['the target state', ['uk-UA', 'uk', 'en'], []],
    ['an empty list is not a fault the reader can fix', [], []],
  ];

  for (const [label, tags, expected] of CASES) {
    it(label, () => {
      expect(guideFaults(tags)).toEqual(expected);
    });
  }

  it('never reports both absent and notFirst — they describe the same slot', () => {
    for (const tags of [['ru'], ['uk'], ['en', 'uk'], ['en'], ['uk', 'ru'], []]) {
      const faults = guideFaults(tags);

      expect(faults.includes('absent') && faults.includes('notFirst')).toBe(false);
    }
  });
});

describe('resolveFixTarget', () => {
  /*
   * The routing contract, and the reason this table is written out. The fix a
   * reader is shown must belong to the surface that actually OWNS their
   * language list — which is not always their browser.
   */
  const ROUTES: readonly (readonly [string, string, GuideFixTarget | null])[] = [
    ['Chrome on Windows keeps its own list', UA.chromeWindows, 'chrome'],
    ['Edge is not Chrome, despite saying so', UA.edgeWindows, 'edge'],
    ['Firefox on Windows', UA.firefoxWindows, 'firefox'],
    ['Chrome on a Mac still keeps its own list', UA.chromeMac, 'chrome'],
    ['Firefox on a Mac too', UA.firefoxMac, 'firefox'],
    ['Safari has none of its own — the system owns it', UA.safariMac, 'macos'],
    ['nor does Safari on iOS', UA.safariIos, 'ios'],
    ['nor Chrome on iOS: every iOS browser is WebKit', UA.chromeIos, 'ios'],
    ['nor Firefox on iOS', UA.firefoxIos, 'ios'],
    ['Chrome on Android does keep one', UA.chromeAndroid, 'chrome-android'],
    ['Firefox on Android falls through to the system', UA.firefoxAndroid, 'android'],
    ['an unrecognised agent is not guessed at', UA.bot, null],
    ['neither is an empty one', '', null],
  ];

  for (const [label, userAgent, expected] of ROUTES) {
    it(label, () => {
      expect(resolveFixTarget(userAgent)).toBe(expected);
    });
  }
});

describe('describeAgent', () => {
  it('names the browser even where the system owns the language list', () => {
    // The fix target for this agent is `ios`; the browser field must still say
    // Safari. "Your browser: iOS" would be plainly wrong.
    expect(describeAgent(UA.safariIos)).toEqual({ browser: 'Safari', system: 'iOS' });
  });

  it('does not mistake Chrome for Safari, or Edge for Chrome', () => {
    expect(describeAgent(UA.chromeMac).browser).toBe('Chrome');
    expect(describeAgent(UA.edgeWindows).browser).toBe('Edge');
  });

  it('says so rather than guessing when it cannot tell', () => {
    const { browser, system } = describeAgent(UA.bot);

    expect(browser).toBe(diagnosisStrings.unknownValue);
    expect(system).toBe(diagnosisStrings.unknownValue);
  });
});

describe('guideFix', () => {
  it('has real steps for every surface and every fault', () => {
    for (const target of TARGETS) {
      for (const fault of FAULTS) {
        const fix = guideFix(target, fault);

        expect(fix.steps.length, `${target}/${fault}`).toBeGreaterThan(0);
        expect(fix.label, `${target}/${fault}`).not.toBe('');
        expect(fix.guideId, `${target}/${fault}`).not.toBe('');
        expect(fix.mockup, `${target}/${fault}`).toContain('-');
      }
    }
  });

  it('opens with the address to paste, where the platform has one', () => {
    const fix = guideFix('chrome', 'blocked');

    expect(fix.steps[0]?.address).toBe('chrome://settings/languages');
    expect(fix.steps[0]?.text).toContain('адресний рядок');
  });

  it('gives the platforms with no settings URL no such step at all', () => {
    // Not a disabled stub — there is nothing for the reader to paste, and the
    // first step is a menu path instead.
    for (const target of ['macos', 'ios', 'android', 'windows'] as const) {
      for (const fault of FAULTS) {
        const steps = guideFix(target, fault).steps;

        expect(
          steps.some((step) => step.address !== undefined),
          `${target}/${fault}`,
        ).toBe(false);
      }
    }
  });

  it('routes Safari and iOS to the system rather than to a browser menu', () => {
    expect(guideFix('macos', 'blocked').label).toContain('системі');
    expect(guideFix('ios', 'blocked').label).toContain('системі');
  });
});

describe('fixHighlight', () => {
  it('maps each fault to the affordance that resolves it', () => {
    expect(fixHighlight('blocked')).toBe('remove');
    expect(fixHighlight('absent')).toBe('add');
    expect(fixHighlight('notFirst')).toBe('top');
  });
});

describe('fixHighlightRow', () => {
  const languages = guideLanguages(['ru', 'en', 'uk'], name);

  it('points at the Russian row when the fault is that Russian is there', () => {
    expect(fixHighlightRow('blocked', languages)).toBe(0);
  });

  it('points at the Ukrainian row when the fault is where Ukrainian sits', () => {
    expect(fixHighlightRow('notFirst', languages)).toBe(2);
  });

  it('points nowhere when the fault is that Ukrainian is missing', () => {
    // The panel lights its add-a-language control instead; there is no row.
    expect(fixHighlightRow('absent', guideLanguages(['en'], name))).toBeUndefined();
  });

  it('points nowhere rather than at row 0 when the language is not in the list', () => {
    // Row 0 would be a picture telling the reader to act on the wrong language.
    expect(fixHighlightRow('blocked', guideLanguages(['en', 'uk'], name))).toBeUndefined();
  });
});

describe('faultCountLabel', () => {
  it('uses the three Ukrainian forms, including for the teens', () => {
    expect(faultCountLabel(1)).toBe('1 проблема');
    expect(faultCountLabel(2)).toBe('2 проблеми');
    expect(faultCountLabel(5)).toBe('5 проблем');
    expect(faultCountLabel(11)).toBe('11 проблем');
    expect(faultCountLabel(21)).toBe('21 проблема');
  });
});

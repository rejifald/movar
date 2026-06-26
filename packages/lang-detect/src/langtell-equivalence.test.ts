/**
 * Convergence guard: the published, zero-dependency `langtell/classify`
 * `classifyBySnippet` must agree with this package's own `classifyBySnippet`
 * (./classify) on the `{ language, margin, rung }` triple our consumers read —
 * across every rung, including the franc rung-3 backstop reached via the
 * injected resolver. langtell's classifier was ported from this package's, so
 * the two are expected to be byte-equivalent today; this test is the safety net
 * that fails loudly here (rather than silently changing what the extension's
 * conceal path and the diagnostics panel report) if a future langtell release
 * ever diverges. It is also the gate that lets later phases re-export the shared
 * core from langtell with confidence.
 *
 * langtell additionally carries a `discriminating` flag that this package's
 * verdict lacks; consumers read only language/margin/rung, so the comparison is
 * deliberately scoped to that triple.
 */
import { describe, expect, it } from 'vitest';
import { classifyBySnippet as movarClassify } from './classify';
import type { LanguageProfile, SnippetVerdict } from './classify';
import { francRung3Resolver } from './classify-franc';
import { getProfiles } from './profiles';
import { classifyBySnippet as langtellClassify } from 'langtell/classify';

// The full Cyrillic roster the product tells apart, plus en so a Latin title
// scopes to a lone Latin candidate (the `discriminating: false` case).
const candidates: readonly LanguageProfile[] = getProfiles(['uk', 'ru', 'be', 'bg', 'en']);

// As of langtell@0.4.0 `classifyBySnippet`/`Rung3Resolver` are generic over the
// profile type, so this guard — like the diagnostics consumer — hands movar's
// `francRung3Resolver` straight to langtell with no adapter: `P` infers from
// `candidates` (movar's stricter `LanguageProfile`, `words` required).

/** The triple our consumers actually read off a verdict. */
const triple = (v: { language: string; margin: number; rung: SnippetVerdict['rung'] }) => ({
  language: v.language,
  margin: v.margin,
  rung: v.rung,
});

// Representative inputs across the rung ladder + the requested languages.
const SAMPLES: readonly { label: string; text: string; expectLang: string }[] = [
  // Rung 1 — distinctive letters.
  { label: 'uk (ї, distinctive letter)', text: 'Їжак Сонік', expectLang: 'uk' },
  { label: 'ru (ы/ё distinctive)', text: 'Новый сезон уже вышел', expectLang: 'ru' },
  { label: 'be (ў uniquely Belarusian)', text: 'Магчыма ўсё атрымаецца', expectLang: 'be' },
  { label: 'uk slogan (distinctive і/ї)', text: 'Слава Україні', expectLang: 'uk' },
  // Rung 2a — function-word marker (no distinctive letter in scope).
  { label: 'ru function word', text: 'Кофе и чай', expectLang: 'ru' },
  // Latin → lone candidate (en) by script alone.
  { label: 'en (Latin, lone candidate)', text: 'The quick brown fox', expectLang: 'en' },
  // bg — ъ-as-vowel density in longer text.
  { label: 'bg (ъ density)', text: 'Държавата приъ голъмия мостъ', expectLang: 'bg' },
  // Rung 3 — distinctive-free Cyrillic residual long enough to reach franc.
  {
    label: 'ru residual (rung-3 franc backstop)',
    text: 'Сегодня состоялась большая встреча представителей различных компаний',
    expectLang: 'ru',
  },
  // Unknown — no letters / no evidence.
  { label: 'unknown (digits/symbols only)', text: '12345 — !!!', expectLang: 'unknown' },
  { label: 'unknown (empty)', text: '', expectLang: 'unknown' },
];

describe('langtell/classify ↔ @movar/lang-detect classifyBySnippet equivalence', () => {
  it.each(SAMPLES)('agrees on the verdict triple for $label', ({ text, expectLang }) => {
    const movar = movarClassify(text, candidates, francRung3Resolver);
    const langtell = langtellClassify(text, candidates, francRung3Resolver);

    // The two ports must produce the same language/margin/rung consumers read.
    expect(triple(langtell)).toEqual(triple(movar));
    // And that verdict must be the expected one (so the test still bites if BOTH
    // ports regressed identically).
    expect(movar.language).toBe(expectLang);
  });

  it('agrees with rung-3 disabled (no injected resolver)', () => {
    // The residual sample needs franc; without a resolver BOTH must abstain to
    // 'unknown' identically — proving the ladder up to rung 2 is also in lockstep.
    const text = 'Сегодня состоялась большая встреча представителей различных компаний';
    const movar = movarClassify(text, candidates);
    const langtell = langtellClassify(text, candidates);
    expect(triple(langtell)).toEqual(triple(movar));
    expect(movar.rung).toBeNull();
  });
});

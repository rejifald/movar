import { getProfiles } from '@movar/lang-detect';
import { describe, expect, it } from 'vitest';
import { catalogue, detect } from './detect';
import { createEngine } from './host';
import type { EngineEvent } from './protocol';

const CYRILLIC = ['uk', 'ru', 'be'] as const;
const evidenceFor = (result: ReturnType<typeof detect>, code: string) =>
  result.evidence.find((entry) => entry.code === code);

describe('detect', () => {
  it('names the language and the rung that decided', () => {
    const result = detect('Це українська сторінка з інформацією', [...CYRILLIC]);
    expect(result.language).toBe('uk');
    expect(result.rung).toBe('1');
    expect(result.discriminating).toBe(true);
  });

  it('echoes the roster it was given, in order, whatever the verdict', () => {
    const result = detect('Это русский текст', ['be', 'uk', 'ru']);
    expect(result.candidates).toEqual(['be', 'uk', 'ru']);
    expect(result.evidence.map((entry) => entry.code)).toEqual(['be', 'uk', 'ru']);
  });

  it('credits a shared letter to nobody and says so', () => {
    // `і` is Ukrainian AND Belarusian. It must not appear as Ukrainian evidence,
    // and it must appear in the shared row — otherwise a reader looking at their
    // own text sees a letter the report refuses to account for.
    const result = detect('річ на сторінці', [...CYRILLIC]);
    expect(evidenceFor(result, 'uk')?.letters).not.toContain('і');
    expect(result.sharedLetters).toContain('і');
  });

  it('gives Russian its one exclusive letter when the text has it', () => {
    const result = detect('объезд подъезд', [...CYRILLIC]);
    expect(evidenceFor(result, 'ru')?.letters).toEqual(['ъ']);
    expect(result.language).toBe('ru');
  });

  it('re-credits that letter once the sharer leaves the roster', () => {
    // The same text, a smaller set: `і` becomes Ukrainian evidence again. This
    // is the behaviour the roster editor exists to let someone perform.
    const withBe = detect('річ на сторінці', [...CYRILLIC]);
    const withoutBe = detect('річ на сторінці', ['uk', 'ru']);
    expect(evidenceFor(withBe, 'uk')?.letters).not.toContain('і');
    expect(evidenceFor(withoutBe, 'uk')?.letters).toContain('і');
  });

  it('flags a one-candidate comparison as non-discriminating', () => {
    // Ukrainian text, Ukrainian-only roster: "uk" is the honest output of the
    // question asked, and `discriminating: false` is how the shell knows to say
    // so rather than reporting a finding.
    const result = detect('Це українська сторінка', ['uk']);
    expect(result.language).toBe('uk');
    expect(result.discriminating).toBe(false);
    expect(result.scoped).toEqual(['uk']);
  });

  it('a one-candidate roster the text contradicts reports no verdict at all', () => {
    // Russian text against a Ukrainian-only roster used to come back "uk" with
    // the non-discriminating flag as its only qualifier. `э` and `ы` are letters
    // Ukrainian does not have, so the answer is now null: the roster is reported
    // in full, and the screen has nothing to name.
    const result = detect('Это русский текст', ['uk']);
    expect(result.language).toBeNull();
    expect(result.rung).toBeNull();
    expect(result.scoped).toEqual(['uk']);
    expect(result.evidence).toHaveLength(1);
  });

  it('does not hand Belarusian to Ukrainian on the roster a UA reader gets by default', () => {
    // The Detector's derived roster is `priority + blocked`, which script-scopes
    // to {uk, ru} for a reader who has not added Belarusian. Belarusian is built
    // from those two alphabets plus a few letters neither has, so `і` alone used
    // to elect Ukrainian — including on text carrying no ў at all.
    const withoutBe = detect('Мова і культура Беларусі маюць багатую гісторыю', ['uk', 'ru']);
    expect(withoutBe.language).toBeNull();
    // The roster is still reported in full: a reader has to see WHICH comparison
    // came up empty to know that widening it is the fix.
    expect(withoutBe.scoped).toEqual(['uk', 'ru']);

    // And adding Belarusian is that fix — the same text resolves once the set
    // can account for it.
    const withBe = detect('Беларусь — гэта краіна ў цэнтры Еўропы', [...CYRILLIC]);
    expect(withBe.language).toBe('be');
  });

  it('keeps an out-of-script candidate in the report but out of scope', () => {
    const result = detect('Це українська сторінка', ['uk', 'ru', 'en']);
    expect(result.scoped).toEqual(['uk', 'ru']);
    expect(evidenceFor(result, 'en')?.inScope).toBe(false);
    expect(evidenceFor(result, 'uk')?.inScope).toBe(true);
    // Still listed — a roster entry that sat the round out is a fact worth
    // rendering, not an absence.
    expect(result.evidence).toHaveLength(3);
  });

  it('returns a null verdict rather than a guess when nothing matches', () => {
    const result = detect('12345 !!! ---', [...CYRILLIC]);
    expect(result.language).toBeNull();
    expect(result.rung).toBeNull();
  });

  it('drops a code with no shipped profile without failing the run', () => {
    const result = detect('Це українська сторінка', ['uk', 'ru', 'xx']);
    expect(result.language).toBe('uk');
    // Asked for, so still listed; never in scope, because it resolved to nothing.
    expect(evidenceFor(result, 'xx')?.inScope).toBe(false);
  });

  it('survives an empty roster instead of throwing', () => {
    const result = detect('Це українська сторінка', []);
    expect(result.language).toBeNull();
    expect(result.scoped).toEqual([]);
    expect(result.evidence).toEqual([]);
  });

  it('marks the franc pick only at rung 3, and only the winner', () => {
    // Text deliberately free of exclusive letters and function words, long
    // enough to clear the rung-3 floor. Which rung this actually lands on is
    // langtell's business, so the assertion is the INVARIANT rather than a
    // pinned rung: `francClosest` is set for exactly the winner when rung 3
    // decided, and for nobody otherwise. That keeps the test honest if a
    // profile's word lists change under it.
    const result = detect('парк карта комод молоко коробка ракета салат помада камера мотор ', [
      ...CYRILLIC,
    ]);
    const flagged = result.evidence.filter((entry) => entry.francClosest).map((e) => e.code);
    const expected = result.rung === '3' && result.language !== null ? [result.language] : [];
    expect(flagged).toEqual(expected);
  });

  it('caps a signal row so one huge paste cannot put an unbounded array on the wire', () => {
    // The transport bound, not a display choice — the shell caps again at 6.
    // Reached with a single-candidate roster, where every one of Ukrainian's 400
    // frequent words is exclusive, so a paste of them all is the realistic way a
    // row grows without limit.
    const uk = getProfiles(['uk'])[0];
    const words = [...(uk?.words?.frequent ?? [])];
    expect(words.length).toBeGreaterThan(60); // else this asserts nothing

    const result = detect(words.join(' '), ['uk']);
    const row = evidenceFor(result, 'uk')?.frequentWords ?? [];
    expect(row).toHaveLength(50);
    // Truncated from the front, in document order — not sampled.
    expect(row[0]).toBe(words[0]);
  });

  it('never reports rung-1 evidence for a verdict that did not come from rung 1', () => {
    // The consistency the old React tab broke: it showed hardcoded "distinctive
    // letters" beside a "matched by function words" line, so the account and
    // the verdict described different runs.
    const result = detect('Это русский текст без твёрдого знака', [...CYRILLIC]);
    const withLetters = result.evidence.filter((entry) => entry.letters.length > 0);
    expect(withLetters.length > 0 ? result.rung : '1').toBe('1');
  });
});

describe('catalogue', () => {
  it('lists every profiled code, sorted, so shells need no list of their own', () => {
    expect(catalogue()).toEqual(['be', 'bg', 'en', 'ru', 'uk']);
  });

  it('is a superset of the default roster', () => {
    for (const code of CYRILLIC) expect(catalogue()).toContain(code);
  });
});

/** An engine that records its events, and that must never reach the network. */
function engineWith(events: EngineEvent[]) {
  return createEngine({
    // A detection never probes; one that did would be a bug worth failing on.
    probe: () => {
      throw new Error('detect must not probe');
    },
    collectorId: 'test',
    emit: (event) => events.push(event),
  });
}

describe('detect.run over the engine', () => {
  it('emits detect.result on the same stream, correlated by id', async () => {
    const events: EngineEvent[] = [];
    await engineWith(events).handle({
      kind: 'detect.run',
      id: 'req-1',
      text: 'Це українська сторінка',
      candidates: [...CYRILLIC],
    });

    expect(events).toHaveLength(1);
    // `toMatchObject` rather than a `kind` type guard: it asserts the discriminant
    // and the payload in one shot, with no branch for a shape that would be a
    // failure anyway.
    expect(events[0]).toMatchObject({
      kind: 'detect.result',
      id: 'req-1',
      result: { language: 'uk', candidates: [...CYRILLIC] },
    });
  });

  it('answers detect.catalogue on the same stream', async () => {
    const events: EngineEvent[] = [];
    await engineWith(events).handle({ kind: 'detect.catalogue', id: 'req-3' });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'detect.catalogue',
      id: 'req-3',
      codes: catalogue(),
    });
  });

  it('reports a thrown detection as a failed event, not a rejection', async () => {
    const events: EngineEvent[] = [];
    // `candidates` is typed readonly string[]; a native bridge can still send
    // null, and `handle` must never reject whatever arrives.
    await engineWith(events).handle({
      kind: 'detect.run',
      id: 'req-2',
      text: 'x',
      candidates: null as unknown as readonly string[],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('failed');
    expect(events[0]).toMatchObject({ id: 'req-2', reason: 'internal' });
  });
});

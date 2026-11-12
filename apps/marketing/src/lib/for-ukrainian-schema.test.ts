import { describe, expect, it } from 'vitest';
import { z } from 'astro/zod';

import { projectSchema } from './for-ukrainian-schema';
import { markShape } from './for-ukrainian';

/**
 * Stands in for Astro's `image()`: a path in, image metadata out — the shape
 * the content layer hands the schema. It accepts any path, so every rejection
 * below is the schema's own rule and not this fake's.
 */
const fakeImage = () =>
  z.string().transform((src) => ({ src, width: 120, height: 32, format: 'svg' as const }));

const schema = projectSchema(fakeImage);

const entry = {
  name: 'Проєкт',
  sphere: 'games',
  url: 'https://example.com/',
  summary: { uk: 'Опис.', en: 'Summary.' },
  lastVerified: '2026-11-12',
  funding: 'volunteer',
};

const markConsent = { date: '2026-11-12', channel: 'email' };

describe('projects schema — mark permission', () => {
  it('accepts an entry with neither a mark nor a permission record', () => {
    expect(schema.safeParse(entry).success).toBe(true);
  });

  it('accepts an SVG mark with a permission record', () => {
    const parsed = schema.safeParse({ ...entry, mark: './marks/project.svg', markConsent });
    expect(parsed.success).toBe(true);
  });

  it('rejects a mark without a permission record', () => {
    const parsed = schema.safeParse({ ...entry, mark: './marks/project.svg' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toContainEqual(['markConsent']);
  });

  it('rejects a permission record without a mark', () => {
    const parsed = schema.safeParse({ ...entry, markConsent });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toContainEqual(['markConsent']);
  });

  it.each(['./marks/project.png', './marks/project.webp', './marks/project.svg.png'])(
    'rejects a non-SVG mark (%s), even with a permission record',
    (mark) => {
      const parsed = schema.safeParse({ ...entry, mark, markConsent });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues.map((issue) => issue.path)).toContainEqual(['mark']);
    },
  );

  it('keeps the person rule: a named individual still needs consent', () => {
    expect(schema.safeParse({ ...entry, person: true }).success).toBe(false);
    expect(schema.safeParse({ ...entry, person: true, consent: markConsent }).success).toBe(true);
  });
});

describe('markShape', () => {
  it.each([
    [{ width: 24, height: 24 }, 'square'],
    [{ width: 36, height: 24 }, 'square'], // exactly 1.5 is still a symbol
    [{ width: 37, height: 24 }, 'wordmark'],
    [{ width: 120, height: 32 }, 'wordmark'],
    [{ width: 16, height: 32 }, 'square'], // a tall mark takes the square box
  ] as const)('%o → %s', (mark, shape) => {
    expect(markShape(mark)).toBe(shape);
  });
});

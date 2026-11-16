import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FLOWS = path.resolve(import.meta.dirname, '../maestro');

/** The `scrollUntilVisible:` blocks of a flow, nested ones (inside `retry`) included: each runs until the next `- ` step. */
function scrollBlocks(yaml: string): string[] {
  return yaml.split(/^\s*- /mu).filter((step) => step.startsWith('scrollUntilVisible:'));
}

describe('maestro flows', () => {
  // iOS 26 floats a search bar / toolbar over a list's bottom edge: a row that a
  // scroll leaves under it counts as visible, but the tap after it lands on the bar
  // (en run 13, Settings > Apps > Safari). Every scroll centres its row.
  for (const file of readdirSync(FLOWS).filter((name) => name.endsWith('.yaml'))) {
    it(`${file}: every scrollUntilVisible centres its element`, () => {
      for (const block of scrollBlocks(readFileSync(path.join(FLOWS, file), 'utf8'))) {
        expect(block).toMatch(/^\s+centerElement: true$/mu);
      }
    });
  }
});

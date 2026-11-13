#!/usr/bin/env node
/**
 * Unit test for the Swift design-token guard's matcher and baseline compare.
 * Run: tsx scripts/check-swift-design-tokens.test.mts   (also `pnpm test:swift-tokens`)
 */
import { compare, countViolations } from './check-swift-design-tokens.mts';

let failed = 0;
const eq = (label: string, got: unknown, want: unknown): void => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ ${label} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    failed += 1;
  }
};

console.log('==> swift design-token guard unit test');
eq('font(.system(size:)) flagged', countViolations('Text("a").font(.system(size: 13))'), {
  'font-system': 1,
});
eq('.font(.body) ok', countViolations('Text("a").font(.body)'), {});
eq('padding(12) and padding(.top, 5) flagged', countViolations('.padding(12)\n.padding(.top, 5)'), {
  padding: 2,
});
eq('padding([.top,.bottom], 4) flagged', countViolations('.padding([.top, .bottom], 4)'), {
  padding: 1,
});
eq(
  'padding with tokens ok',
  countViolations('.padding(MovarMetrics.s2)\n.padding(.top, MovarMetrics.s1)\n.padding()'),
  {},
);
eq(
  'frame literals flagged',
  countViolations('.frame(width: 20, height: 20)\n.frame(maxWidth: 400)'),
  { frame: 2 },
);
eq(
  'frame(.infinity / token) ok',
  countViolations('.frame(maxWidth: .infinity)\n.frame(height: MovarMetrics.row)'),
  {},
);
eq('spacing literal flagged', countViolations('VStack(alignment: .leading, spacing: 8) {'), {
  spacing: 1,
});
eq('spacing token ok', countViolations('HStack(spacing: MovarMetrics.s2) {'), {});
eq('zero is not a design value', countViolations('VStack(spacing: 0) {}.padding(0)'), {});
eq('a fractional literal still counts', countViolations('VStack(spacing: 0.5) {'), { spacing: 1 });
eq(
  'colour literals flagged',
  countViolations(
    [
      'Color(red: 1, green: 0, blue: 0)',
      'Color(.sRGB, red: 1, green: 0, blue: 0)',
      'Color(white: 0.5)',
      'Color(hue: 0.1, saturation: 1, brightness: 1)',
      'UIColor(red: 1, green: 0, blue: 0, alpha: 1)',
      'NSColor(red: 1, green: 0, blue: 0, alpha: 1)',
      'let h = "#FF8800"',
      'let x = 0xFF8800',
    ].join('\n'),
  ),
  { color: 8 },
);
eq(
  'Color(MovarPalette.x) / Color.red ok',
  countViolations('Color(MovarPalette.ink)\nColor.red'),
  {},
);
eq(
  'comments ignored',
  countViolations(
    '// .padding(12)\n/* .font(.system(size: 1)) /* nested Color(red: 1) */ */\nlet a = 1 /* spacing: 4 */',
  ),
  {},
);
eq(
  'comment markers inside strings are not comments',
  countViolations('let u = "http://x"; .padding(3)'),
  { padding: 1 },
);

const base = { 'a.swift': { padding: 2 } };
eq('equal counts pass', compare(base, base), { regressions: [], stale: [] });
eq('more violations regress', compare({ 'a.swift': { padding: 3 } }, base).regressions.length, 1);
eq('new file regresses', compare({ ...base, 'b.swift': { frame: 1 } }, base).regressions.length, 1);
eq('fewer violations are stale', compare({ 'a.swift': { padding: 1 } }, base).stale.length, 1);
eq('removed file is stale', compare({}, base).stale.length, 1);

if (failed > 0) {
  console.error(`✗ swift design-token guard test FAILED (${failed} case(s))`);
  process.exit(1);
}
console.log('✓ swift design-token guard test passed');

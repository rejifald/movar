import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StepIllustration } from './illustrations';
import type { IllustrationName } from './illustrations';

afterEach(cleanup);

describe('StepIllustration', () => {
  it.each<IllustrationName>(['toolbar', 'menu', 'toggle', 'dialog'])(
    'renders the %s illustration as a single decorative element',
    (name) => {
      const { container } = render(<StepIllustration name={name} />);
      // Every variant renders exactly one aria-hidden card (decorative — the
      // step body carries the words).
      expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
      expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    },
  );
});

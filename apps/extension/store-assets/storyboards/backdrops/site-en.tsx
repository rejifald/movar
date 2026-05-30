import type { ReactNode } from 'react';

import { SiteFrame, type SiteFrameContent } from './site-frame';

/**
 * English variant of the fictitious services site — *Tochka24* — in its
 * **English** after-state. Backdrop for the right half of the
 * "correction applied" diptych (scene #2) when the EN listing is being
 * captured. Pairs with the existing `site-ru.tsx` (always-bad RU
 * before-state) to read as "Movar flipped the language switch."
 *
 * Mirrors `site-uk.tsx` structurally; only the localized copy changes,
 * and the popup overlay is hosted via the inherited `children` slot.
 */
const EN_CONTENT: SiteFrameContent = {
  lang: 'en',
  nav: ['Services', 'Pricing', 'Coverage', 'Help'],
  loginLabel: 'Sign in',
  hero: {
    title: 'Refresh your home without the hassle.',
    body: 'Cleaning, small repairs, deliveries — one app, a fixed price, and a 30-minute arrival window for every booking.',
    cta: 'Book a pro →',
  },
  features: [
    {
      title: 'Up-front pricing',
      body: 'You see the total before you book. No surprises on the receipt, no "by the hour" guesses.',
    },
    {
      title: 'Time you can plan around',
      body: 'A 30-minute arrival window. If the pro is late, the discount applies automatically.',
    },
    {
      title: 'Verified professionals',
      body: 'Every pro is background-checked with current credentials and confirmed work history.',
    },
  ],
};

export function SiteBackdropEN({ children }: { children?: ReactNode }) {
  return <SiteFrame content={EN_CONTENT}>{children}</SiteFrame>;
}

import type { JSX } from 'react';

import { VoyaBackdrop, type VoyaSiteContent } from './voya-frame';

/**
 * English variant of the *Voya* travel-site backdrop — used as the
 * with-Movar half of the language-dialog diptych (scene #4). No
 * dialog is rendered: with Accept-Language set, the site recognises
 * the preferred language and serves the English variant directly.
 */
const EN_CONTENT: VoyaSiteContent = {
  lang: 'en',
  nav: ['Flights', 'Hotels', 'Car rental', 'Tours'],
  loginLabel: 'Sign in',
  hero: {
    title: 'Find your next trip',
    subtitle: 'Flights, hotels, and car rentals on one page — no hidden fees.',
    fields: { from: 'From — to', checkIn: 'Check-in', checkOut: 'Check-out' },
    cta: 'Search',
  },
  deals: [
    {
      city: 'Prague',
      tagline: 'Direct flight, weekend for two',
      price: 'from €145',
    },
    {
      city: 'Barcelona',
      tagline: 'Beach and Gaudí architecture',
      price: 'from €220',
    },
    {
      city: 'Tbilisi',
      tagline: 'Gastronomic weekend',
      price: 'from €115',
    },
  ],
};

export function VoyaBackdropEN(): JSX.Element {
  return <VoyaBackdrop content={EN_CONTENT} />;
}

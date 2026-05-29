/**
 * Site registry consumed by `tests/sites.spec.ts`. The order here is
 * the order tests run; we put the deterministic e-com sites first
 * (which rarely flake) and the anti-bot-prone search engines last.
 */
import { site001 } from './001';
import { siteBing } from './bing';
import { siteDuckDuckGo } from './duckduckgo';
import { siteElectricaShop } from './electrica-shop';
import { siteGoogle } from './google';
import { siteUamade } from './uamade';
import { siteYouTube } from './youtube';

export type { SiteFixture } from './types';

export const SITES = [
  siteElectricaShop,
  siteUamade,
  site001,
  siteDuckDuckGo,
  siteBing,
  siteGoogle,
  siteYouTube,
] as const;

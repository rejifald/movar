import { isGoogleHost } from '@movar/rules';
import type { UiLanguage } from '@movar/settings';
import { resolveLocale } from './i18n/resolve';
import type { ResolvedLocale } from './i18n/resolve';

export type ConcealMode = 'curtain' | 'hide';

export type CapabilityChunk =
  | 'features/conceal.js'
  | 'features/curtain-ui.js'
  | `models/${string}.js`;

export interface PageContentModelDescriptor {
  id: string;
  chunk: `models/${string}.js`;
  matches(host: string): boolean;
}

export interface CapabilityResolveSettings {
  contentModification: boolean;
  uiLanguage: UiLanguage;
  /**
   * Future content-filtering-modes.md setting. It is optional here so this
   * branch can add the pure resolver before the settings schema grows.
   */
  concealMode?: ConcealMode;
}

export interface CapabilityNeeds {
  conceal?: 'features/conceal.js';
  model?: `models/${string}.js`;
  presenter?: 'features/curtain-ui.js';
  locale?: Exclude<ResolvedLocale, 'en'>;
}

export const CONCEAL_FEATURE_CHUNK = 'features/conceal.js';
export const CURTAIN_UI_FEATURE_CHUNK = 'features/curtain-ui.js';

const LEGACY_CONCEAL_MODE: ConcealMode = 'curtain';

function isYouTubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

const PAGE_CONTENT_MODEL_DESCRIPTORS = [
  {
    id: 'google',
    chunk: 'models/google.js',
    matches: isGoogleHost,
  },
  {
    id: 'youtube',
    chunk: 'models/youtube.js',
    matches: isYouTubeHost,
  },
] as const satisfies readonly PageContentModelDescriptor[];

export function lookupPageContentModelDescriptor(
  host: string,
): PageContentModelDescriptor | undefined {
  const normalized = normalizeHost(host);
  return PAGE_CONTENT_MODEL_DESCRIPTORS.find((descriptor) => descriptor.matches(normalized));
}

export function resolveNeeds(
  host: string,
  settings: CapabilityResolveSettings,
  browserUiLanguage = '',
): CapabilityNeeds {
  if (!settings.contentModification) return {};

  const needs: CapabilityNeeds = { conceal: CONCEAL_FEATURE_CHUNK };
  const descriptor = lookupPageContentModelDescriptor(host);
  if (descriptor) needs.model = descriptor.chunk;

  const concealMode = settings.concealMode ?? LEGACY_CONCEAL_MODE;
  if (concealMode !== 'curtain') return needs;

  needs.presenter = CURTAIN_UI_FEATURE_CHUNK;
  const locale = resolveLocale(settings.uiLanguage, browserUiLanguage);
  if (locale !== 'en') needs.locale = locale;
  return needs;
}

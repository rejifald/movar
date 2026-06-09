import type { MovarSettings } from '@movar/settings';
import { isGoogleHost } from '@movar/rules';
import { resolveLocale } from './i18n/resolve';
import type { ResolvedLocale } from './i18n/resolve';

export type ConcealFeatureChunk = 'features/conceal.js';
export type CurtainUiFeatureChunk = 'features/curtain-ui.js';
export type ModelChunk = 'models/google.js' | 'models/youtube.js';
export type CapabilityChunk = ConcealFeatureChunk | CurtainUiFeatureChunk | ModelChunk;

interface ModelCapabilityDescriptor {
  id: 'google' | 'youtube';
  chunk: ModelChunk;
  matches(host: string): boolean;
}

export interface CapabilityNeeds {
  conceal: ConcealFeatureChunk | null;
  model: ModelChunk | null;
  presenter: CurtainUiFeatureChunk | null;
  locale: ResolvedLocale;
}

const CONCEAL_CHUNK: ConcealFeatureChunk = 'features/conceal.js';
const CURTAIN_UI_CHUNK: CurtainUiFeatureChunk = 'features/curtain-ui.js';

const MODEL_CAPABILITIES: readonly ModelCapabilityDescriptor[] = [
  {
    id: 'google',
    chunk: 'models/google.js',
    matches: isGoogleHost,
  },
  {
    id: 'youtube',
    chunk: 'models/youtube.js',
    matches(host: string): boolean {
      return host === 'youtube.com' || host.endsWith('.youtube.com');
    },
  },
];

function lookupModelCapability(host: string): ModelCapabilityDescriptor | null {
  return MODEL_CAPABILITIES.find((descriptor) => descriptor.matches(host)) ?? null;
}

export function resolveNeeds(
  host: string,
  settings: MovarSettings,
  browserUiLanguage: string,
): CapabilityNeeds {
  const locale = resolveLocale(settings.uiLanguage, browserUiLanguage);
  if (!settings.contentModification) {
    return { conceal: null, model: null, presenter: null, locale };
  }
  return {
    conceal: CONCEAL_CHUNK,
    model: lookupModelCapability(host)?.chunk ?? null,
    presenter: settings.concealMode === 'curtain' ? CURTAIN_UI_CHUNK : null,
    locale,
  };
}

export function needsChunks(needs: CapabilityNeeds): readonly CapabilityChunk[] {
  return [needs.conceal, needs.model, needs.presenter].filter(
    (chunk): chunk is CapabilityChunk => chunk !== null,
  );
}

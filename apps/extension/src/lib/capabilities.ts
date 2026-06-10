import type { MovarSettings } from '@movar/settings';
import { isGoogleHost, isYouTubeHost } from '@movar/rules';

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
    matches: isYouTubeHost,
  },
];

function lookupModelCapability(host: string): ModelCapabilityDescriptor | null {
  return MODEL_CAPABILITIES.find((descriptor) => descriptor.matches(host)) ?? null;
}

export function resolveNeeds(host: string, settings: MovarSettings): CapabilityNeeds {
  if (!settings.contentModification) {
    return { conceal: null, model: null, presenter: null };
  }
  return {
    conceal: CONCEAL_CHUNK,
    model: lookupModelCapability(host)?.chunk ?? null,
    presenter: settings.concealMode === 'curtain' ? CURTAIN_UI_CHUNK : null,
  };
}

export function needsChunks(needs: CapabilityNeeds): readonly CapabilityChunk[] {
  return [needs.conceal, needs.model, needs.presenter].filter(
    (chunk): chunk is CapabilityChunk => chunk !== null,
  );
}

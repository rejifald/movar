import type { MovarSettings } from '@movar/settings';
import type { ModelChunk } from '../sites/types';
import { resolveModelChunk } from '../sites/registry';

export type ConcealFeatureChunk = 'features/conceal.js';
export type CurtainUiFeatureChunk = 'features/curtain-ui.js';
export type { ModelChunk } from '../sites/types';
export type CapabilityChunk = ConcealFeatureChunk | CurtainUiFeatureChunk | ModelChunk;

export interface CapabilityNeeds {
  conceal: ConcealFeatureChunk | null;
  model: ModelChunk | null;
  presenter: CurtainUiFeatureChunk | null;
}

const CONCEAL_CHUNK: ConcealFeatureChunk = 'features/conceal.js';
const CURTAIN_UI_CHUNK: CurtainUiFeatureChunk = 'features/curtain-ui.js';

/** Resolve the deferred chunks a (host, settings) pair needs. The host model
 *  comes from the eager site registry; conceal and the curtain presenter are
 *  pure settings gates. */
export function resolveNeeds(host: string, settings: MovarSettings): CapabilityNeeds {
  if (!settings.contentModification) {
    return { conceal: null, model: null, presenter: null };
  }
  return {
    conceal: CONCEAL_CHUNK,
    model: resolveModelChunk(host),
    presenter: settings.concealMode === 'curtain' ? CURTAIN_UI_CHUNK : null,
  };
}

export function needsChunks(needs: CapabilityNeeds): readonly CapabilityChunk[] {
  return [needs.conceal, needs.model, needs.presenter].filter(
    (chunk): chunk is CapabilityChunk => chunk !== null,
  );
}

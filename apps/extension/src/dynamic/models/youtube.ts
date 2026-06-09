import type { PageContentModel } from '@movar/page-content/types';
import { YOUTUBE_EXTRACTOR } from '@movar/page-content/youtube';

export const id = 'youtube';

export function matches(host: string): boolean {
  return YOUTUBE_EXTRACTOR.matches(host);
}

export function extract(root: ParentNode = document): PageContentModel {
  return YOUTUBE_EXTRACTOR.extract(root);
}

import type { PageContentModel } from '@movar/page-content/types';
import { GOOGLE_EXTRACTOR } from '@movar/page-content/google';

export const id = 'google';

export function matches(host: string): boolean {
  return GOOGLE_EXTRACTOR.matches(host);
}

export function extract(root: ParentNode = document): PageContentModel {
  return GOOGLE_EXTRACTOR.extract(root);
}

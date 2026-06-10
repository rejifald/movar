import type { PageContentModel } from '@movar/page-content/types';
import { GOOGLE_EXTRACTOR } from '@movar/page-content/google';

export function extract(root: ParentNode = document): PageContentModel {
  return GOOGLE_EXTRACTOR.extract(root);
}

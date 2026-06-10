import type { PageContentModel } from '@movar/page-content/types';
import { YOUTUBE_EXTRACTOR } from '@movar/page-content/youtube';

export function extract(root: ParentNode = document): PageContentModel {
  return YOUTUBE_EXTRACTOR.extract(root);
}

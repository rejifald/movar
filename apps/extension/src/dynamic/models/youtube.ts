import { YOUTUBE_EXTRACTOR } from '@movar/page-content/youtube';

export const id = YOUTUBE_EXTRACTOR.id;

export function matches(host: string): boolean {
  return YOUTUBE_EXTRACTOR.matches(host);
}

export function buildModel(
  root: ParentNode = document,
): ReturnType<typeof YOUTUBE_EXTRACTOR.extract> {
  return YOUTUBE_EXTRACTOR.extract(root);
}

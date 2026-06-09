import { GOOGLE_EXTRACTOR } from '@movar/page-content/google';

export const id = GOOGLE_EXTRACTOR.id;

export function matches(host: string): boolean {
  return GOOGLE_EXTRACTOR.matches(host);
}

export function buildModel(
  root: ParentNode = document,
): ReturnType<typeof GOOGLE_EXTRACTOR.extract> {
  return GOOGLE_EXTRACTOR.extract(root);
}

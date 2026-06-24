import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Track an element's natural (layout) height, refined after first paint.
 *
 * Returns a ref to attach and the latest measured `offsetHeight`. Reading
 * `offsetHeight` rather than a bounding rect is deliberate: it ignores any CSS
 * `transform: scale()` the caller applies for fitting, so reading the height
 * back never feeds a re-layout loop. A `ResizeObserver` keeps the value current
 * when the observed content grows *after* mount — e.g. the popup boots from
 * `defaultSettings` (content filter off, no conceal picker) and only grows to
 * its full height once its async settings load swaps the taller picker in,
 * which a one-shot measurement on mount would miss.
 *
 * Used by the popup-bearing screenshot frames (portrait single-panel,
 * marketing popup) so they stay fitted to the popup's current height instead
 * of cropping when it grows.
 */
export function useMeasuredHeight(
  initial: number,
): readonly [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      if (el.offsetHeight > 0) setHeight(el.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, height];
}

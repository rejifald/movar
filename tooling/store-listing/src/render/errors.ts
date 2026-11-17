/** The guard classes the renderer enforces; each throws with its own code. */
export type GuardCode =
  | 'picture-aspect'
  | 'phone-body-ratio'
  | 'side-gap'
  | 'cta-overlap'
  | 'headline-lines'
  | 'capture-mismatch'
  | 'phone-clipped'
  | 'split-cut'
  | 'caption-room'
  | 'headline-overlap'
  | 'logo-drift'
  | 'window-clipped'
  | 'window-overlap'
  | 'chrome-top';

/** Thrown when a layout (or the rendered headline) breaks a hard rule. */
export class RenderGuardError extends Error {
  readonly code: GuardCode;

  constructor(code: GuardCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'RenderGuardError';
    this.code = code;
  }
}

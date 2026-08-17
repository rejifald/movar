/**
 * `@movar/audit-engine` — the headless half of the native shells.
 *
 * Loaded into an offscreen `WebView` that never renders. It owns the collector,
 * the DOM digest and the kernel; the shell owns every pixel. See
 * `docs/native-shells.md` for why the split falls here.
 */
export { collectMatrix, AUDIT_BUDGET, MATRIX_HEADERS, ProbeUnavailableError } from './collect';
export type { CollectOptions } from './collect';
export { createEngine } from './host';
export type { Engine, EngineOptions } from './host';
export { ENGINE_PROTOCOL_VERSION } from './protocol';
export type {
  EmitEvent,
  EngineEvent,
  EngineFailureReason,
  EngineRequest,
  ProbeReply,
  ProbeRequest,
  ProbeTransport,
} from './protocol';
export { runAudit } from './run';
export type { AuditResult, RunAuditOptions } from './run';
export { applyIntent, loadSettings } from './settings';
export type { SettingsIntent } from './settings';
export { ENGINE_ID, ENGINE_VERSION } from './version';

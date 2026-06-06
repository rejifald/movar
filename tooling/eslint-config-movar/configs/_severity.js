// @ts-check
/**
 * Internal helper (not a preset — not exported from index.js).
 *
 * Promote any preset rule shipped at `warn` to `error`. Bulk suppressions only
 * ratchet errors, and the workspace convention is "error or off" — a rule left
 * at `warn` lingers as un-actioned noise instead of joining the backlog. `off`
 * and existing `error` entries pass through unchanged.
 *
 * @param {Record<string, unknown>} rules
 * @returns {Record<string, unknown>}
 */
export const asErrors = (rules) =>
  Object.fromEntries(
    Object.entries(rules).map(([id, entry]) => {
      const severity = Array.isArray(entry) ? entry[0] : entry;
      if (severity === 'warn' || severity === 1) {
        return [id, Array.isArray(entry) ? ['error', ...entry.slice(1)] : 'error'];
      }
      return [id, entry];
    }),
  );

// @ts-check
/**
 * Internal helper (not a preset — not exported from index.js).
 *
 * Shared `no-restricted-syntax` selectors that must be present regardless of
 * which presets a consumer composes.
 *
 * `no-restricted-syntax` is a *singleton* flat-config rule: when two config
 * objects both set it for the same file, the last one in the array wins
 * outright — the option arrays are replaced, not merged. The className guard
 * (below) lives in the `quality` preset (composed by every consumer, so the
 * guard is repo-wide), but that placement alone isn't enough: `boundaries` is
 * composed *after* `quality` in apps/extension and apps/diagnostics and also
 * sets `no-restricted-syntax`, so its config would clobber the className
 * selector for every file there (store-assets included — the exact place the
 * guard has to fire). The fix is to define the selector once here and spread it
 * into BOTH presets' rule arrays, so whichever config is the last
 * `no-restricted-syntax` setter for a given file always carries it.
 */

/**
 * Ban a template literal used *directly* as a `className` value, e.g.
 * ``className={`base ${cond ? 'mod' : ''}`}``. prettier-plugin-tailwindcss sorts
 * class strings inside `className` and trims separator whitespace around the
 * interpolation, so `` `base ${cond ? ' mod' : ''}` `` collapses to `basemod` —
 * a runtime class that matches no selector (this shipped once as a silent
 * regression). `cn('base', cond && 'mod')` joins with a real space and has no
 * in-string separator to lose.
 *
 * Direct-child only (`> JSXExpressionContainer > TemplateLiteral`): a template
 * literal nested inside `cn(...)` is intentionally allowed — `cn` is not a
 * `tailwindFunctions` entry, so the plugin never rewrites its arguments, and
 * interpolations like ``cn(`is-${code}`, cond && 'on')`` stay legal.
 *
 * @type {{ selector: string, message: string }}
 */
export const noTemplateLiteralClassName = {
  selector: "JSXAttribute[name.name='className'] > JSXExpressionContainer > TemplateLiteral",
  message:
    'Compose classNames with cn() from @movar/ui — template literals can silently lose separator whitespace to prettier-plugin-tailwindcss',
};

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

/** Message shared by the WebIDL-iterator selectors below. */
const WEBIDL_ITERATOR_MESSAGE =
  'Don\'t call .keys()/.values()/.entries() on URLSearchParams/Headers/FormData — in a Firefox content script (an Xray-wrapped sandbox) these WebIDL iterators don\'t survive the wrapper: for…of throws "is not iterable" and Array.from() silently returns []. Use .forEach((value, key) => …) or spread the object itself.';

/**
 * Ban the WebIDL iterator methods on the URL/fetch collection types.
 *
 * `for (const key of url.searchParams.keys())` threw
 * `TypeError: searchParams.keys() is not iterable` in a Firefox content script,
 * out of `applyStrategy` → `applyOnce` → the whole content-script bootstrap. The
 * result was total: on Google (the one host whose rule scrubs params) Firefox
 * users got no `hl`/`lr` rewrite and no concealment at all, while the popup
 * still answered — so it looked like a filtering bug, not a crash. jsdom and
 * Chromium both iterate these fine, so no unit test or Chromium e2e run can
 * catch a reintroduction; this selector is the guard.
 *
 * Two shapes, matching how the types are reached in practice: a `.searchParams`
 * member (`url.searchParams.keys()`) and a direct construction
 * (`new URLSearchParams(str).entries()`). Measured working alternatives in
 * Firefox 153: `.forEach()`, `[...params]`, `Object.fromEntries(params)`.
 *
 * @type {{ selector: string, message: string }[]}
 */
export const noWebidlIteratorMethods = [
  {
    selector:
      "CallExpression[callee.object.property.name='searchParams'][callee.property.name=/^(keys|values|entries)$/]",
    message: WEBIDL_ITERATOR_MESSAGE,
  },
  {
    selector:
      "CallExpression[callee.object.type='NewExpression'][callee.object.callee.name=/^(URLSearchParams|Headers|FormData)$/][callee.property.name=/^(keys|values|entries)$/]",
    message: WEBIDL_ITERATOR_MESSAGE,
  },
];

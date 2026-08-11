// @ts-check
/**
 * Orthography lint preset. Two rules; the export keeps its historical
 * `ukrainian` name because every consumer config imports it by that name.
 *
 * 1. `movar/ua-apostrophe` — Ukrainian apostrophe orthography, everywhere.
 * 2. `movar/copy-ascii-quotes` — ASCII quotes in the copy catalogues only.
 *
 * ── 1. Ukrainian apostrophe ────────────────────────────────────────────
 *
 * Enforces U+02BC ʼ MODIFIER LETTER
 * APOSTROPHE inside Cyrillic words. ASCII U+0027 (') and right single quote
 * U+2019 (’) are typographically wrong when adjacent to a Cyrillic letter and
 * break shaping in some Cyrillic fonts (Manrope renders U+0027 with Latin
 * tracking, sliding into the next glyph).
 *
 * The rule inspects the cooked value of string and template literals — both
 * raw source and `'` escapes are caught because the resulting runtime
 * string is what readers see.
 *
 * English possessives ("Movar's") stay valid: the ASCII apostrophe has no
 * Cyrillic neighbour, so the rule does not fire.
 *
 * Intentional exemptions live with the consumer config (e.g. lang-detect
 * tests probing U+2019 detection, live e2e scenarios mirroring what users
 * actually type in search boxes).
 *
 * ── 2. Curly quotes in the copy catalogues ─────────────────────────────
 *
 * `docs/copy.md` §5.2 requires straight ASCII quotes in English copy, and
 * §4.2 requires « » guillemets in Ukrainian — so a curly `“ ” ‘ ’` is
 * wrong in both languages. Nothing enforced that, and four separate
 * catalogues had drifted into curly quotes by the time anyone looked.
 *
 * The rule is deliberately scoped to the copy catalogues rather than run
 * repo-wide, because curly quotes are *correct* in several places and a
 * rule that needs a standing exemption list is a rule nobody trusts:
 *
 *  - `packages/browser-ui/src/labels.ts` reproduces the browsers' own
 *    shipped strings (Chrome really does render `Add “Movar”?`), which
 *    `docs/copy.md` §6.2 puts outside this document's authority;
 *  - build scripts print console output, which §Scope doesn't govern;
 *  - test names and detector fixtures quote real-world text on purpose.
 *
 * None of those are named `i18n.ts` / `messages-*.ts` or live under
 * `store-assets/`, so the glob below excludes them by construction and
 * the rule ships with no exemptions at all.
 */

const CURLY_QUOTE = /[‘’“”]/u;

/** @type {import("eslint").Rule.RuleModule} */
const copyAsciiQuotesRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow curly quotes in copy catalogues; English copy takes ASCII quotes and Ukrainian takes « » guillemets.',
    },
    schema: [],
    messages: {
      bad: String.raw`Curly quotes are wrong in copy: English takes straight ASCII " and ' (docs/copy.md §5.2), Ukrainian takes « » guillemets (§4.2).`,
    },
  },
  create(context) {
    /** @param {import("eslint").Rule.Node} node @param {string} text */
    const check = (node, text) => {
      if (CURLY_QUOTE.test(text)) {
        context.report({ node, messageId: 'bad' });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          check(node, node.value);
        }
      },
      TemplateElement(node) {
        const cooked = node.value?.cooked;
        if (typeof cooked === 'string') {
          check(node, cooked);
        }
      },
    };
  },
};

const BAD_APOSTROPHE_NEXT_TO_CYRILLIC = /[Ѐ-ӿԀ-ԯ]['’]|['’][Ѐ-ӿԀ-ԯ]/u;

const messageText = String.raw`Ukrainian orthography requires U+02BC ʼ MODIFIER LETTER APOSTROPHE between Cyrillic letters; ASCII U+0027 and right single quote U+2019 are wrong here. Replace with ʼ (or 'ʼ' if escaped).`;

/** @type {import("eslint").Rule.RuleModule} */
const uaApostropheRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ASCII U+0027 and right single quote U+2019 adjacent to Cyrillic letters; require U+02BC instead.',
    },
    schema: [],
    messages: {
      bad: messageText,
    },
  },
  create(context) {
    /** @param {import("eslint").Rule.Node} node @param {string} text */
    const check = (node, text) => {
      if (BAD_APOSTROPHE_NEXT_TO_CYRILLIC.test(text)) {
        context.report({ node, messageId: 'bad' });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          check(node, node.value);
        }
      },
      TemplateElement(node) {
        const cooked = node.value?.cooked;
        if (typeof cooked === 'string') {
          check(node, cooked);
        }
      },
    };
  },
};

const movarPlugin = {
  rules: {
    'ua-apostrophe': uaApostropheRule,
    'copy-ascii-quotes': copyAsciiQuotesRule,
  },
};

/**
 * The copy catalogues, as `**`-prefixed globs so they resolve the same
 * whatever cwd ESLint runs from — lint is sharded per project, and a
 * repo-relative glob like `apps/**` silently matches nothing in a shard
 * rooted inside that app, which would leave the rule dormant.
 */
const COPY_CATALOGUES = ['**/i18n.ts', '**/messages-*.ts', '**/store-assets/**/*.{ts,tsx}'];

/** @type {import("eslint").Linter.Config[]} */
export const ukrainian = [
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs,astro,mdx}'],
    plugins: {
      movar: movarPlugin,
    },
    rules: {
      'movar/ua-apostrophe': 'error',
    },
  },
  {
    files: COPY_CATALOGUES,
    plugins: {
      movar: movarPlugin,
    },
    rules: {
      'movar/copy-ascii-quotes': 'error',
    },
  },
];

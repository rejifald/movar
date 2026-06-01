// @ts-check
/**
 * Ukrainian-orthography lint preset. Enforces U+02BC ʼ MODIFIER LETTER
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
 */

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
  },
};

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
];

import { beforeEach, describe, expect, it } from 'vitest';
import { applyStrategy } from './strategy';
import { makeContext } from './strategy.test-utils';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('applyStrategy — searchParams', () => {
  it('sets all params on a single navigation', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
    const out = applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'hl' }, { name: 'lr', values: { uk: 'lang_uk' } }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('hl')).toBe('uk');
    expect(target.searchParams.get('lr')).toBe('lang_uk');
    expect(target.searchParams.get('q')).toBe('apple');
    expect(out).toEqual({ navigated: true, needsReload: false, appliedSteps: 1 });
  });

  it('preserves unrelated query params', () => {
    const { ctx, navigate } = makeContext(
      'https://www.google.com/search?q=apple&oq=apple&sourceid=chrome',
    );
    applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'hl' }, { name: 'lr', values: { uk: 'lang_uk' } }],
      },
      'uk',
      ctx,
    );
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('oq')).toBe('apple');
    expect(target.searchParams.get('sourceid')).toBe('chrome');
  });

  it('overwrites an existing param when its value differs', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple&hl=ru');
    applyStrategy({ type: 'searchParams', params: [{ name: 'hl' }] }, 'uk', ctx);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('hl')).toBe('uk');
  });

  it('is a no-op when every param is already at the target value', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple&hl=uk&lr=lang_uk');
    const out = applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'hl' }, { name: 'lr', values: { uk: 'lang_uk' } }],
      },
      'uk',
      ctx,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('is a no-op when onlyWhenParam is absent (e.g. homepage)', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/');
    const out = applyStrategy(
      {
        type: 'searchParams',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('applies when onlyWhenParam is present', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
    applyStrategy(
      {
        type: 'searchParams',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when onlyOnPath does not match the current pathname', () => {
    // google.com/maps shares the host with /search but `lr=lang_uk` can break
    // Maps. The rule must skip non-/search paths.
    const { ctx, navigate } = makeContext('https://www.google.com/maps?q=київ');
    const out = applyStrategy(
      {
        type: 'searchParams',
        onlyOnPath: '/search',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('applies when onlyOnPath matches the current pathname', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=київ');
    applyStrategy(
      {
        type: 'searchParams',
        onlyOnPath: '/search',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('onlyOnPath uses a prefix match (allows deeper subpaths under the gate)', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search/foo?q=test');
    applyStrategy(
      {
        type: 'searchParams',
        onlyOnPath: '/search',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the bare target code when no values map matches', () => {
    const { ctx, navigate } = makeContext('https://duckduckgo.com/?q=apple');
    applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'kl', values: { uk: 'ua-uk' } }],
      },
      // 'xx' has no mapping — encodedValue returns the raw target.
      'xx',
      ctx,
    );
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('kl')).toBe('xx');
  });
});

import { afterEach } from 'vitest';

// Every test ends from a clean document: body/head content and any attribute a
// test set on <html> (lang, dir, class, style, data-*) never leaks across cases.
afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  const root = document.documentElement;
  for (const name of root.getAttributeNames()) {
    if (['lang', 'dir', 'class', 'style'].includes(name) || name.startsWith('data-')) {
      root.removeAttribute(name);
    }
  }
});

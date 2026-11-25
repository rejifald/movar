import { afterEach } from 'vitest';

// Every test starts from a clean document: DOM content and anything a test set
// on <html> (lang, dir, data-*) never leaks into the next case.
afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  for (const name of document.documentElement.getAttributeNames()) {
    document.documentElement.removeAttribute(name);
  }
});

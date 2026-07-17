import { beforeEach } from 'vitest';

// Mirrors the extension's global test-setup: every test starts from a clean
// document so DOM state (body/head content, <html lang>) never leaks across
// cases. These model packages don't create curtains/tooltips, so no overlay
// teardown is needed here.
beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('data-lang');
  document.documentElement.removeAttribute('data-locale');
});

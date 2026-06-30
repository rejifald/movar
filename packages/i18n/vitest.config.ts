import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The I18nProvider renders React and reflects the resolved locale onto
    // <html lang>, so its tests need a DOM. The rest of the package (catalogue
    // shape, plural, resolve, display-names) is pure and runs fine here too.
    environment: 'jsdom',
  },
});

import { detectModeForHost } from '@movar/page-mode/registry';
import { watchPageMode } from '@movar/page-mode/observer';
import { setCurrentColorScheme } from '@movar/page-mode/context';
import type { PageMode } from '@movar/page-mode/types';
import type { ContentPresenter } from '../../lib/content-presenter';
import { createContentPresenterAdapter } from '../../lib/content-presenter-factory';
import { setAllCurtainsColorScheme } from '../../lib/curtain';
import { setAllTooltipsColorScheme } from '../../lib/tooltip';
import { loadContentMessages, setContentLocale } from '../../lib/i18n/content';
import type { ResolvedLocale } from '../../lib/i18n/resolve';

export interface CurtainPresenterOptions {
  host: string;
  locale: ResolvedLocale;
}

export interface ProvisionedContentPresenter extends ContentPresenter {
  setLocale(locale: ResolvedLocale): Promise<void>;
  setColorScheme(mode: PageMode): void;
  teardown(): void;
}

async function loadLocale(locale: ResolvedLocale): Promise<void> {
  setContentLocale(locale);
  await loadContentMessages();
}

export async function createContentPresenter({
  host,
  locale,
}: CurtainPresenterOptions): Promise<ProvisionedContentPresenter> {
  let colorScheme = detectModeForHost(host);
  setCurrentColorScheme(colorScheme);
  await loadLocale(locale);

  const repaint = (mode: PageMode): void => {
    colorScheme = mode;
    setCurrentColorScheme(mode);
    setAllCurtainsColorScheme(mode);
    setAllTooltipsColorScheme(mode);
  };
  const stopWatching = watchPageMode(() => detectModeForHost(host), repaint);
  const presenter = createContentPresenterAdapter({ getColorScheme: () => colorScheme });

  return {
    ...presenter,
    async setLocale(nextLocale: ResolvedLocale): Promise<void> {
      await loadLocale(nextLocale);
    },
    setColorScheme(mode: PageMode): void {
      repaint(mode);
    },
    teardown(): void {
      stopWatching();
      presenter.detachAllTooltips();
      presenter.detachCurtains();
    },
  };
}

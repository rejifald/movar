import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { defaultSettings, type MovarSettings } from '@movar/shared';

export function App() {
  const [settings, setSettings] = useState<MovarSettings>(defaultSettings);

  useEffect(() => {
    void (async () => {
      const synced = await browser.storage.sync.get('settings');
      if (synced.settings) setSettings(synced.settings as MovarSettings);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-8 font-sans text-slate-900">
      <h1 className="mb-1 text-2xl font-semibold">Movar settings</h1>
      <p className="mb-6 text-sm text-slate-500">Keep the web in your language.</p>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Language priority</h2>
        <p className="text-sm text-slate-600">{settings.priority.join(' → ')}</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Activity</h2>
        {/* TODO: Tremor dashboard goes here — corrections over time, top offenders,
            breakdown by mechanism. See movar-spec.md §6. */}
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          Usefulness dashboard (Tremor) — coming soon
        </div>
      </section>
    </main>
  );
}

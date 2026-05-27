import type { MovarSettings } from '@movar/shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PageContentSection({ settings, onChange }: Props) {
  const toggle = (): void => {
    onChange({ ...settings, contentModification: !settings.contentModification });
  };

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        Page content
      </h3>
      <p className="text-ink-soft mb-4 text-sm">
        When on, Movar also hides blocked-language entries from on-site language pickers and blurs
        content cards (e.g. YouTube videos) in a blocked language. Off by default; turn on if you
        want a tidier page.
      </p>

      <label className="flex max-w-md cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={settings.contentModification}
          onChange={toggle}
          className="accent-accent mt-0.5 size-4"
        />
        <span className="text-ink text-[13px] leading-relaxed">
          Allow Movar to modify page content on visited sites.
        </span>
      </label>
    </section>
  );
}

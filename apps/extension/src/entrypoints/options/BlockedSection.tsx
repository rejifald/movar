import { Lock } from 'lucide-react';
import { useMemo } from 'react';
import { isLockedBlocked } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { LanguageCode } from '@movar/lang-detect';
import { IconButton } from '@movar/ui';
import { useI18n } from '../../lib/i18n';
import { AddLanguagePicker, SUPPORTED_LANGUAGES, displayLanguage } from './shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function BlockedSection({ settings, onChange }: Readonly<Props>) {
  const { t, locale } = useI18n();

  const addable = useMemo(
    () => SUPPORTED_LANGUAGES.filter((c) => !settings.blocked.includes(c) && !isLockedBlocked(c)),
    [settings.blocked],
  );

  const remove = (code: LanguageCode): void => {
    // Locked codes are non-removable; ignore even if the UI managed to call us.
    if (isLockedBlocked(code)) return;
    onChange({ ...settings, blocked: settings.blocked.filter((c) => c !== code) });
  };

  const add = (code: LanguageCode): void => {
    if (!code || settings.blocked.includes(code)) return;
    onChange({ ...settings, blocked: [...settings.blocked, code] });
  };

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        {t.options.blocked.title}
      </h3>
      <p className="text-ink-soft mb-6 text-sm">{t.options.blocked.intro}</p>

      {settings.blocked.length === 0 ? (
        <p className="text-ink-faint mb-4 text-sm italic">{t.options.blocked.empty}</p>
      ) : (
        <ul className="mb-4 flex max-w-md flex-wrap gap-2">
          {settings.blocked.map((code) => (
            <BlockedItem key={code} code={code} locale={locale} onRemove={remove} />
          ))}
        </ul>
      )}

      {addable.length > 0 ? (
        <AddLanguagePicker label={t.options.blocked.addLabel} options={addable} onAdd={add} />
      ) : null}
    </section>
  );
}

interface BlockedItemProps {
  code: LanguageCode;
  locale: string;
  onRemove: (code: LanguageCode) => void;
}

/** One blocked-language chip: endonym + popup-locale name, then either a lock
 *  indicator (permanently-blocked codes) or an unblock button. Extracted so
 *  `BlockedSection`'s list reads as a single map, mirroring `PriorityItem`. */
function BlockedItem({ code, locale, onRemove }: Readonly<BlockedItemProps>) {
  const { t } = useI18n();
  const locked = isLockedBlocked(code);
  const name = displayLanguage(code, locale);

  return (
    <li className="border-border bg-surface-2 text-ink-strong flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium">
      <span>
        {displayLanguage(code, code)}
        <span className="text-ink-soft ml-1.5 text-[12px] font-normal">({name})</span>
      </span>
      {locked ? (
        // size-7 matches the IconButton footprint in the unlock branch so the
        // chip's height doesn't jump between locked and removable. The wrapping
        // span carries the aria-label and `title` (the SVG is decorative —
        // `aria-hidden`).
        <span
          className="text-ink-faint inline-flex size-7 items-center justify-center"
          aria-label={t.options.blocked.lockedHint(name)}
          title={t.options.blocked.lockedHint(name)}
        >
          <LockIcon />
        </span>
      ) : (
        <IconButton
          label={t.options.blocked.unblock(name)}
          onClick={() => {
            onRemove(code);
          }}
        >
          ×
        </IconButton>
      )}
    </li>
  );
}

/** Closed padlock indicator for the locked-blocked branch. Inline SVG (rather
 *  than the 🔒 emoji) so the glyph follows `currentColor` — important because
 *  the parent span sets `text-ink-faint`, and OS emoji fonts ignore CSS color.
 *  Also stable across platforms: an SVG renders identically in CI, Playwright
 *  baselines, and marketing screenshots regardless of the runner's emoji font.
 *
 *  16×16 viewBox matches the Select chevron and StatusHeader check; stroke
 *  width 1.5 matches the project's outline-icon vocabulary. Rendered at 14×14
 *  to read cleanly next to the chip's text-[13px] language name without
 *  dominating it. Decorative — `aria-hidden`; the wrapping span owns the
 *  aria-label. */
function LockIcon() {
  return <Lock size={14} aria-hidden="true" className="block" />;
}

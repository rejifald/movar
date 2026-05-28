import { useMemo } from 'react';
import { isLockedBlocked, type LanguageCode, type MovarSettings } from '@movar/shared';
import { IconButton } from '@movar/ui';
import { useI18n } from '../../lib/i18n';
import { AddLanguagePicker, SUPPORTED_LANGUAGES, displayLanguage } from './shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function BlockedSection({ settings, onChange }: Props) {
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
          {settings.blocked.map((code) => {
            const locked = isLockedBlocked(code);
            const name = displayLanguage(code, locale);
            return (
              <li
                key={code}
                className="border-border bg-surface-2 text-ink-strong flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium"
              >
                <span>
                  {displayLanguage(code, code)}
                  <span className="text-ink-soft ml-1.5 text-[12px] font-normal">({name})</span>
                </span>
                {locked ? (
                  <span
                    className="text-ink-faint text-[13px] leading-none"
                    aria-label={t.options.blocked.lockedHint(name)}
                    title={t.options.blocked.lockedHint(name)}
                  >
                    🔒
                  </span>
                ) : (
                  <IconButton
                    label={t.options.blocked.unblock(name)}
                    onClick={() => {
                      remove(code);
                    }}
                  >
                    ×
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {addable.length > 0 ? (
        <AddLanguagePicker label={t.options.blocked.addLabel} options={addable} onAdd={add} />
      ) : null}
    </section>
  );
}

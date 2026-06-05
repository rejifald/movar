import { useMemo } from 'react';
import { isLockedBlocked, type MovarSettings } from '@movar/settings';
import type { LanguageCode } from '@movar/lang-detect';
import { IconButton } from '@movar/ui';
import { useI18n } from '../../lib/i18n';
import { AddLanguagePicker, SUPPORTED_LANGUAGES, displayLanguage } from './shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PrioritySection({ settings, onChange }: Props) {
  const { t } = useI18n();

  const addable = useMemo(
    // Locked-blocked languages are excluded — making a permanently-blocked
    // language "preferred" would be a contradiction the UI shouldn't allow.
    () => SUPPORTED_LANGUAGES.filter((c) => !settings.priority.includes(c) && !isLockedBlocked(c)),
    [settings.priority],
  );

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= settings.priority.length) return;
    const next = [...settings.priority];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange({ ...settings, priority: next });
  };

  const remove = (code: LanguageCode): void => {
    if (settings.priority.length <= 1) return;
    onChange({ ...settings, priority: settings.priority.filter((c) => c !== code) });
  };

  const add = (code: LanguageCode): void => {
    if (!code || settings.priority.includes(code) || isLockedBlocked(code)) return;
    onChange({ ...settings, priority: [...settings.priority, code] });
  };

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        {t.options.priority.title}
      </h3>
      <p className="text-ink-soft mb-6 text-sm">{t.options.priority.intro}</p>

      <ol className="flex max-w-md flex-col gap-2">
        {settings.priority.map((code, i) => (
          <PriorityItem
            key={code}
            code={code}
            index={i}
            isLast={i === settings.priority.length - 1}
            canRemove={settings.priority.length > 1}
            onMove={move}
            onRemove={remove}
          />
        ))}
      </ol>

      {addable.length > 0 ? (
        <AddLanguagePicker label={t.options.priority.addLabel} options={addable} onAdd={add} />
      ) : null}
    </section>
  );
}

interface PriorityItemProps {
  code: LanguageCode;
  index: number;
  isLast: boolean;
  canRemove: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (code: LanguageCode) => void;
}

function PriorityItem({ code, index, isLast, canRemove, onMove, onRemove }: PriorityItemProps) {
  const { t, locale } = useI18n();
  const primary = index === 0;
  // Use the popup-locale name for aria-labels — screen readers should read
  // them in the UI language, not in the language being labelled.
  const labelName = displayLanguage(code, locale);

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
        primary ? 'border-accent/30 bg-accent-surface' : 'border-border bg-surface-2'
      }`}
    >
      <div className="text-ink-faint w-4 font-mono text-[11px]">{index + 1}</div>
      <div className="text-ink-strong flex-1 text-sm font-medium">
        {displayLanguage(code, locale)}
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          label={t.options.priority.moveUp(labelName)}
          disabled={index === 0}
          onClick={() => {
            onMove(index, index - 1);
          }}
        >
          ↑
        </IconButton>
        <IconButton
          label={t.options.priority.moveDown(labelName)}
          disabled={isLast}
          onClick={() => {
            onMove(index, index + 1);
          }}
        >
          ↓
        </IconButton>
        <IconButton
          label={t.options.priority.remove(labelName)}
          disabled={!canRemove}
          onClick={() => {
            onRemove(code);
          }}
        >
          ×
        </IconButton>
      </div>
    </li>
  );
}

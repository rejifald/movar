// Structurally mirrors BlockedSection — a list of language chips with add/remove. The two
// option sections stay parallel by intent rather than collapsing into one component; the
// duplication is exempted in .fallowrc.json (file-level inline suppression is banned).
import { useMemo } from 'react';
import type { JSX } from 'react';
import { isLockedBlocked } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { LanguageCode } from '@movar/lang-detect';
import { IconButton, Text, cn } from '@movar/ui';
import { useI18n } from '@movar/i18n';
import { AddLanguagePicker, SUPPORTED_LANGUAGES, displayLanguage } from './shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PrioritySection({ settings, onChange }: Readonly<Props>): JSX.Element {
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
      <Text as="h3" variant="heading" tone="strong" className="mb-1.5">
        {t.options.priority.title}
      </Text>
      <p className="text-ink-soft text-ui-md mb-6">{t.options.priority.intro}</p>

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

function PriorityItem({
  code,
  index,
  isLast,
  canRemove,
  onMove,
  onRemove,
}: Readonly<PriorityItemProps>) {
  const { t, locale } = useI18n();
  const primary = index === 0;
  // Use the popup-locale name for aria-labels — screen readers should read
  // them in the UI language, not in the language being labelled.
  const labelName = displayLanguage(code, locale);

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3.5 py-3',
        primary ? 'border-accent/30 bg-accent-surface' : 'border-border bg-surface-2',
      )}
    >
      <div className="text-ink-faint text-ui-xs w-4 font-mono">{index + 1}</div>
      <div className="text-ink-strong text-ui-md flex-1 font-medium">
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

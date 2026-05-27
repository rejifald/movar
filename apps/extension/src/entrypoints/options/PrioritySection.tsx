import { useMemo } from 'react';
import type { LanguageCode, MovarSettings } from '@movar/shared';
import {
  AddLanguagePicker,
  IconButton,
  SUPPORTED_LANGUAGES,
  displayLanguage,
  flagLetter,
} from './shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PrioritySection({ settings, onChange }: Props) {
  const addable = useMemo(
    () => SUPPORTED_LANGUAGES.filter((c) => !settings.priority.includes(c)),
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
    if (!code || settings.priority.includes(code)) return;
    onChange({ ...settings, priority: [...settings.priority, code] });
  };

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        Language priority
      </h3>
      <p className="text-ink-soft mb-6 text-sm">
        Movar will request each site in this order; the first available wins.
      </p>

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
        <AddLanguagePicker label="Add language" options={addable} onAdd={add} />
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
  const primary = index === 0;
  const localName = displayLanguage(code, 'en');

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
        primary ? 'border-accent/30 bg-accent-surface' : 'border-border bg-surface-2'
      }`}
    >
      <div className="text-ink-faint w-4 font-mono text-[11px]">{index + 1}</div>
      <div
        className={`font-display flex size-[22px] items-center justify-center rounded-full text-[10.5px] font-bold ${
          primary ? 'bg-accent text-accent-on' : 'bg-surface-3 text-ink-strong'
        }`}
      >
        {flagLetter(code)}
      </div>
      <div className="text-ink-strong flex-1 text-sm font-medium">
        {displayLanguage(code, code)}
        <span className="text-ink-soft ml-1.5 text-[13px] font-normal">{localName}</span>
      </div>
      <div className="border-border bg-surface text-ink-soft rounded border px-1.5 py-0.5 font-mono text-[11px]">
        {code}
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          label={`Move ${localName} up`}
          disabled={index === 0}
          onClick={() => {
            onMove(index, index - 1);
          }}
        >
          ↑
        </IconButton>
        <IconButton
          label={`Move ${localName} down`}
          disabled={isLast}
          onClick={() => {
            onMove(index, index + 1);
          }}
        >
          ↓
        </IconButton>
        <IconButton
          label={`Remove ${localName}`}
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

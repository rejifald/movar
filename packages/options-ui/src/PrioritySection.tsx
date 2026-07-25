// Structurally mirrors BlockedSection — a list of language chips with add/remove. The two
// option sections stay parallel by intent rather than collapsing into one component; the
// duplication is exempted in .fallowrc.json (file-level inline suppression is banned).
import { useLayoutEffect, useMemo, useRef } from 'react';
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

/** The three per-row controls a `PriorityItem` renders — also the vocabulary
 *  focus restoration below moves between (see `PendingFocus`). */
type PriorityControl = 'up' | 'down' | 'remove';

/** A row's three button DOM nodes, keyed by language code so focus restoration
 *  can reach a specific row's control after a re-render — populated by each
 *  `PriorityItem`'s `registerRef` callback. */
type RowButtons = Record<PriorityControl, HTMLButtonElement | null>;

/** Set right before `onChange` fires, naming the control that should receive
 *  focus once the reordered/filtered list re-renders. Consumed (and cleared)
 *  by the `useLayoutEffect` below. `null` means the acted-upon control is
 *  still enabled after the update, so the browser keeps focus there on its
 *  own — no restoration needed. */
interface PendingFocus {
  code: LanguageCode;
  control: PriorityControl;
}

/** A move only strands focus at the two boundaries: landing at index 0
 *  disables that row's Move-up, landing at the last index disables its
 *  Move-down. Either way the row itself (matched by `code`, its React key)
 *  is still on screen, so the fix is just "focus its other button." Interior
 *  moves need no help — the moved row keeps its DOM node and neither button
 *  disables, so the browser leaves focus exactly where it was. */
function boundaryFocusTarget(code: LanguageCode, to: number, length: number): PendingFocus | null {
  if (to === 0) return { code, control: 'down' };
  if (to === length - 1) return { code, control: 'up' };
  return null;
}

/** After a removal, focus the remove button of whichever row now occupies the
 *  removed row's old slot — the row that shifted up to fill it, or, if the
 *  last row was the one removed (nothing shifted into that now-nonexistent
 *  slot), the row before it (the new last row). */
function removalFocusTarget(
  prev: readonly LanguageCode[],
  removed: LanguageCode,
  next: readonly LanguageCode[],
): PendingFocus | null {
  const removedIndex = prev.indexOf(removed);
  if (removedIndex === -1) return null;
  const code = next[Math.min(removedIndex, next.length - 1)];
  return code === undefined ? null : { code, control: 'remove' };
}

/** Records `el` under `code`'s entry, creating it on first registration.
 *  Pulled out of the component so the map-mutation logic is testable in
 *  isolation from React. */
function setRowButtonRef(
  refs: Map<LanguageCode, RowButtons>,
  code: LanguageCode,
  control: PriorityControl,
  el: HTMLButtonElement | null,
): void {
  const entry = refs.get(code) ?? { up: null, down: null, remove: null };
  entry[control] = el;
  refs.set(code, entry);
}

export function PrioritySection({ settings, onChange }: Readonly<Props>): JSX.Element {
  const { t } = useI18n();

  // Persist across renders without themselves triggering one — `rowButtons`
  // is DOM bookkeeping (see `setRowButtonRef`) and `pendingFocus` is a
  // same-tick handoff from move/remove to the layout effect below, not
  // component state.
  const rowButtons = useRef(new Map<LanguageCode, RowButtons>());
  const pendingFocus = useRef<PendingFocus | null>(null);

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
    pendingFocus.current = boundaryFocusTarget(item, to, next.length);
    onChange({ ...settings, priority: next });
  };

  const remove = (code: LanguageCode): void => {
    if (settings.priority.length <= 1) return;
    const next = settings.priority.filter((c) => c !== code);
    pendingFocus.current = removalFocusTarget(settings.priority, code, next);
    onChange({ ...settings, priority: next });
  };

  const add = (code: LanguageCode): void => {
    if (!code || settings.priority.includes(code) || isLockedBlocked(code)) return;
    onChange({ ...settings, priority: [...settings.priority, code] });
  };

  // Runs after the reordered/filtered list has committed to the DOM — by
  // then, a control that got disabled or unmounted has already lost focus to
  // `<body>` (the browser's doing, not React's), so this is corrective, not
  // preventative. `useLayoutEffect` (not `useEffect`) so the correction lands
  // before paint and no flash to `<body>` is visible. A no-op whenever
  // move/remove left `pendingFocus` unset, i.e. every render this section
  // wasn't the cause of (including `add`, which also replaces the array).
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    rowButtons.current.get(pending.code)?.[pending.control]?.focus();
  }, [settings.priority]);

  return (
    <section>
      <Text as="h3" variant="heading" tone="strong" className="mb-2">
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
            registerRef={(control, el) => {
              setRowButtonRef(rowButtons.current, code, control, el);
            }}
          />
        ))}
      </ol>

      {addable.length > 0 ? (
        <AddLanguagePicker
          label={t.options.priority.addLabel}
          buttonLabel={t.options.priority.addButton}
          options={addable}
          onAdd={add}
        />
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
  /** Reports this row's button DOM nodes up to `PrioritySection` so its
   *  focus-restoration effect can reach them after a move/remove. */
  registerRef: (control: PriorityControl, el: HTMLButtonElement | null) => void;
}

function PriorityItem({
  code,
  index,
  isLast,
  canRemove,
  onMove,
  onRemove,
  registerRef,
}: Readonly<PriorityItemProps>) {
  const { t, locale } = useI18n();
  const primary = index === 0;
  // Use the popup-locale name for aria-labels — screen readers should read
  // them in the UI language, not in the language being labelled.
  const labelName = displayLanguage(code, locale);

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3',
        primary ? 'border-accent/30 bg-accent-surface' : 'border-border bg-surface-2',
      )}
    >
      <div className="text-ink-faint text-ui-xs w-4 font-mono">{index + 1}</div>
      <div className="text-ink-strong text-ui-md flex-1 font-medium">
        {displayLanguage(code, locale)}
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          ref={(el) => {
            registerRef('up', el);
          }}
          label={t.options.priority.moveUp(labelName)}
          disabled={index === 0}
          onClick={() => {
            onMove(index, index - 1);
          }}
        >
          ↑
        </IconButton>
        <IconButton
          ref={(el) => {
            registerRef('down', el);
          }}
          label={t.options.priority.moveDown(labelName)}
          disabled={isLast}
          onClick={() => {
            onMove(index, index + 1);
          }}
        >
          ↓
        </IconButton>
        <IconButton
          ref={(el) => {
            registerRef('remove', el);
          }}
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

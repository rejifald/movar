import type { JSX } from 'react';
import { Switch } from '@movar/ui';
import type { ConcealMode } from '@movar/settings';
import { useI18n } from '@movar/i18n';
import { ConcealModeField } from './ConcealModeField';

interface ContentToggleProps {
  enabled: boolean;
  concealMode: ConcealMode;
  onToggle: (next: boolean) => void;
  onConcealModeChange: (next: ConcealMode) => void;
  className?: string;
  concealModeClassName?: string;
}

/** Compact control for `MovarSettings.contentModification` + `concealMode`.
 *  Used by both the popup and the options page so the copy, switch semantics,
 *  and curtain-vs-hide picker stay in sync. */
export function ContentToggle({
  enabled,
  concealMode,
  onToggle,
  onConcealModeChange,
  className = 'border-border border-t px-4.5 py-4',
  concealModeClassName = 'mt-3.5',
}: Readonly<ContentToggleProps>): JSX.Element {
  const { t } = useI18n();
  return (
    <div className={className}>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        label={t.contentToggle.label}
        description={
          // data-testid anchors the e2e test for the Ukrainian description
          // string to a stable selector instead of a raw UA literal.
          <span data-testid="content-toggle-description">{t.contentToggle.description}</span>
        }
        className="w-full"
      />
      {enabled ? (
        <div className={concealModeClassName}>
          <ConcealModeField value={concealMode} onChange={onConcealModeChange} />
        </div>
      ) : null}
    </div>
  );
}

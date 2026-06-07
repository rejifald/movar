import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { MovarSettings } from '@movar/settings';
import { Button, IconButton } from '@movar/ui';
import { useI18n } from '../../lib/i18n';
import { DOMAIN_PATTERN, normaliseDomain } from './shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function AllowlistSection({ settings, onChange }: Readonly<Props>) {
  const { t } = useI18n();

  const remove = (domain: string): void => {
    onChange({ ...settings, allowlist: settings.allowlist.filter((d) => d !== domain) });
  };

  const add = (domain: string): void => {
    onChange({ ...settings, allowlist: [...settings.allowlist, domain] });
  };

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        {t.options.allowlist.title}
      </h3>
      <p className="text-ink-soft mb-6 text-sm">{t.options.allowlist.intro}</p>

      {settings.allowlist.length === 0 ? (
        <p className="text-ink-faint mb-4 text-sm italic">{t.options.allowlist.empty}</p>
      ) : (
        <ul className="mb-4 flex max-w-md flex-wrap gap-2">
          {settings.allowlist.map((domain) => (
            <AllowlistItem key={domain} domain={domain} onRemove={remove} />
          ))}
        </ul>
      )}

      <AddDomainForm existing={settings.allowlist} onAdd={add} />
    </section>
  );
}

interface AllowlistItemProps {
  domain: string;
  onRemove: (domain: string) => void;
}

/** One exempt-domain chip: the domain in mono + a remove button. Extracted so
 *  `AllowlistSection`'s list reads as a single map, mirroring `PriorityItem`. */
function AllowlistItem({ domain, onRemove }: Readonly<AllowlistItemProps>) {
  const { t } = useI18n();

  return (
    <li className="border-border bg-surface-2 text-ink-strong flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[12.5px]">
      <span>{domain}</span>
      <IconButton
        label={t.options.allowlist.remove(domain)}
        onClick={() => {
          onRemove(domain);
        }}
      >
        ×
      </IconButton>
    </li>
  );
}

interface AddDomainFormProps {
  /** Current allowlist — checked for duplicates before adding. */
  existing: string[];
  onAdd: (domain: string) => void;
}

/** The add-a-domain form: owns the draft + inline-error state and the
 *  normalise/validate/dedupe gate, calling `onAdd` only for a clean new domain.
 *  Split from `AllowlistSection` so the section is just "list + form" and the
 *  validation lives next to the input it guards. */
function AddDomainForm({ existing, onAdd }: Readonly<AddDomainFormProps>) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const domain = normaliseDomain(draft);
    if (!domain) return;
    if (!DOMAIN_PATTERN.test(domain)) {
      setError(t.options.allowlist.errorBadDomain);
      return;
    }
    if (existing.includes(domain)) {
      setError(t.options.allowlist.errorDuplicate);
      return;
    }
    onAdd(domain);
    setDraft('');
    setError(null);
  };

  return (
    <>
      <form onSubmit={submit} className="flex max-w-md gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          placeholder="example.com"
          aria-label={t.options.allowlist.inputLabel}
          className="border-border bg-surface text-ink-strong placeholder:text-ink-faint focus:border-accent flex-1 rounded-lg border px-3 py-2 font-mono text-[13px] outline-none"
        />
        <Button type="submit">{t.options.allowlist.addButton}</Button>
      </form>
      {error == null ? null : <p className="text-accent mt-2 text-[12.5px]">{error}</p>}
    </>
  );
}

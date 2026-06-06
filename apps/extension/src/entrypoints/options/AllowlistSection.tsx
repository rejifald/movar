import { useState } from 'react';
import type { FormEvent } from 'react';
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
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remove = (domain: string): void => {
    onChange({ ...settings, allowlist: settings.allowlist.filter((d) => d !== domain) });
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const domain = normaliseDomain(draft);
    if (!domain) return;
    if (!DOMAIN_PATTERN.test(domain)) {
      setError(t.options.allowlist.errorBadDomain);
      return;
    }
    if (settings.allowlist.includes(domain)) {
      setError(t.options.allowlist.errorDuplicate);
      return;
    }
    onChange({ ...settings, allowlist: [...settings.allowlist, domain] });
    setDraft('');
    setError(null);
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
            <li
              key={domain}
              className="border-border bg-surface-2 text-ink-strong flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[12.5px]"
            >
              <span>{domain}</span>
              <IconButton
                label={t.options.allowlist.remove(domain)}
                onClick={() => {
                  remove(domain);
                }}
              >
                ×
              </IconButton>
            </li>
          ))}
        </ul>
      )}

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
    </section>
  );
}

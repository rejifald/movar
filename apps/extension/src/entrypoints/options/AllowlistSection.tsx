import { useState, type FormEvent } from 'react';
import type { MovarSettings } from '@movar/shared';
import { DOMAIN_PATTERN, IconButton, normaliseDomain } from './shared';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function AllowlistSection({ settings, onChange }: Props) {
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
      setError('Enter a domain like example.com');
      return;
    }
    if (settings.allowlist.includes(domain)) {
      setError('Already on the list');
      return;
    }
    onChange({ ...settings, allowlist: [...settings.allowlist, domain] });
    setDraft('');
    setError(null);
  };

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        Exempt sites
      </h3>
      <p className="text-ink-soft mb-6 text-sm">Movar takes no action on these domains.</p>

      {settings.allowlist.length === 0 ? (
        <p className="text-ink-faint mb-4 text-sm italic">No sites are exempt.</p>
      ) : (
        <ul className="mb-4 flex max-w-md flex-wrap gap-2">
          {settings.allowlist.map((domain) => (
            <li
              key={domain}
              className="border-border bg-surface-2 text-ink-strong flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[12.5px]"
            >
              <span>{domain}</span>
              <IconButton
                label={`Remove ${domain}`}
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
          aria-label="Domain to exempt"
          className="border-border bg-surface text-ink-strong placeholder:text-ink-faint focus:border-accent flex-1 rounded-lg border px-3 py-2 font-mono text-[13px] outline-none"
        />
        <button
          type="submit"
          className="bg-ink-strong text-bg hover:bg-ink rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
        >
          Add
        </button>
      </form>
      {error ? <p className="text-accent mt-2 text-[12.5px]">{error}</p> : null}
    </section>
  );
}

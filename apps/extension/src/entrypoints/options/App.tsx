import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import {
  defaultSettings,
  FEEDBACK_URL,
  type LanguageCode,
  type MovarSettings,
} from '@movar/shared';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { BrandMark } from '../../components/BrandMark';

const version = browser.runtime.getManifest().version;

/**
 * Catalog of languages users can pick from in either list. Mirrors the
 * "Preferred-language options" list in apps/extension/STORE-LISTING.md —
 * keep them in sync when adding support for a new language.
 */
const SUPPORTED_LANGUAGES: readonly LanguageCode[] = [
  'uk',
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pl',
  'ru',
];

function displayLanguage(code: LanguageCode, locale?: string): string {
  try {
    const names = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'language' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

function flagLetter(code: LanguageCode): string {
  return displayLanguage(code, code).charAt(0).toUpperCase();
}

/** Strip protocol, path, and port from whatever the user typed. */
function normaliseDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/:].*$/, '');
}

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function App() {
  const [settings, setSettings] = useState<MovarSettings>(defaultSettings);
  const [domainDraft, setDomainDraft] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
    })();
  }, []);

  const update = (next: MovarSettings): void => {
    setSettings(next);
    void persistSettings(next);
  };

  const priorityAddable = useMemo(
    () => SUPPORTED_LANGUAGES.filter((c) => !settings.priority.includes(c)),
    [settings.priority],
  );

  const blockedAddable = useMemo(
    () => SUPPORTED_LANGUAGES.filter((c) => !settings.blocked.includes(c)),
    [settings.blocked],
  );

  const movePriority = (from: number, to: number): void => {
    if (to < 0 || to >= settings.priority.length) return;
    const next = [...settings.priority];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    update({ ...settings, priority: next });
  };

  const removePriority = (code: LanguageCode): void => {
    if (settings.priority.length <= 1) return;
    update({ ...settings, priority: settings.priority.filter((c) => c !== code) });
  };

  const addPriority = (code: LanguageCode): void => {
    if (!code || settings.priority.includes(code)) return;
    update({ ...settings, priority: [...settings.priority, code] });
  };

  const removeBlocked = (code: LanguageCode): void => {
    update({ ...settings, blocked: settings.blocked.filter((c) => c !== code) });
  };

  const addBlocked = (code: LanguageCode): void => {
    if (!code || settings.blocked.includes(code)) return;
    update({ ...settings, blocked: [...settings.blocked, code] });
  };

  const addDomain = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const domain = normaliseDomain(domainDraft);
    if (!domain) return;
    if (!DOMAIN_PATTERN.test(domain)) {
      setDomainError('Enter a domain like example.com');
      return;
    }
    if (settings.allowlist.includes(domain)) {
      setDomainError('Already on the list');
      return;
    }
    update({ ...settings, allowlist: [...settings.allowlist, domain] });
    setDomainDraft('');
    setDomainError(null);
  };

  const removeDomain = (domain: string): void => {
    update({ ...settings, allowlist: settings.allowlist.filter((d) => d !== domain) });
  };

  const toggleContentModification = (): void => {
    update({ ...settings, contentModification: !settings.contentModification });
  };

  return (
    <main className="bg-bg text-ink-strong min-h-screen px-6 py-10 font-sans">
      <div className="border-border bg-surface mx-auto max-w-3xl overflow-hidden rounded-2xl border shadow-md">
        <header className="border-border flex items-center justify-between border-b px-7 py-4">
          <div className="flex items-center gap-2.5">
            <BrandMark size={22} className="text-ink-strong" title="Movar" />
            <span className="font-display text-ink-strong text-lg font-bold tracking-tight">
              Movar
            </span>
            <span className="text-ink-faint ml-1 font-mono text-[10.5px] font-normal tracking-wide">
              v{version}
            </span>
          </div>
          <nav className="flex gap-1">
            <span className="bg-surface-2 text-ink-strong rounded-md px-3 py-1.5 text-[13px] font-medium">
              Languages
            </span>
          </nav>
        </header>

        <div className="grid grid-cols-[1fr_240px] gap-14 px-7 py-9">
          <div className="space-y-10">
            <section>
              <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
                Language priority
              </h3>
              <p className="text-ink-soft mb-6 text-sm">
                Movar will request each site in this order; the first available wins.
              </p>

              <ol className="flex max-w-md flex-col gap-2">
                {settings.priority.map((code, i) => {
                  const primary = i === 0;
                  const lastIndex = settings.priority.length - 1;
                  return (
                    <li
                      key={code}
                      className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
                        primary
                          ? 'border-accent/30 bg-accent-surface'
                          : 'border-border bg-surface-2'
                      }`}
                    >
                      <div className="text-ink-faint w-4 font-mono text-[11px]">{i + 1}</div>
                      <div
                        className={`font-display flex size-[22px] items-center justify-center rounded-full text-[10.5px] font-bold ${
                          primary ? 'bg-accent text-accent-on' : 'bg-surface-3 text-ink-strong'
                        }`}
                      >
                        {flagLetter(code)}
                      </div>
                      <div className="text-ink-strong flex-1 text-sm font-medium">
                        {displayLanguage(code, code)}
                        <span className="text-ink-soft ml-1.5 text-[13px] font-normal">
                          {displayLanguage(code, 'en')}
                        </span>
                      </div>
                      <div className="border-border bg-surface text-ink-soft rounded border px-1.5 py-0.5 font-mono text-[11px]">
                        {code}
                      </div>
                      <div className="flex items-center gap-1">
                        <IconButton
                          label={`Move ${displayLanguage(code, 'en')} up`}
                          disabled={i === 0}
                          onClick={() => {
                            movePriority(i, i - 1);
                          }}
                        >
                          ↑
                        </IconButton>
                        <IconButton
                          label={`Move ${displayLanguage(code, 'en')} down`}
                          disabled={i === lastIndex}
                          onClick={() => {
                            movePriority(i, i + 1);
                          }}
                        >
                          ↓
                        </IconButton>
                        <IconButton
                          label={`Remove ${displayLanguage(code, 'en')}`}
                          disabled={settings.priority.length <= 1}
                          onClick={() => {
                            removePriority(code);
                          }}
                        >
                          ×
                        </IconButton>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {priorityAddable.length > 0 ? (
                <AddLanguagePicker
                  label="Add language"
                  options={priorityAddable}
                  onAdd={addPriority}
                />
              ) : null}
            </section>

            <section>
              <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
                Blocked languages
              </h3>
              <p className="text-ink-soft mb-6 text-sm">
                Movar will switch away from any page served in these languages.
              </p>

              {settings.blocked.length === 0 ? (
                <p className="text-ink-faint mb-4 text-sm italic">No languages are blocked.</p>
              ) : (
                <ul className="mb-4 flex max-w-md flex-wrap gap-2">
                  {settings.blocked.map((code) => (
                    <li
                      key={code}
                      className="border-border bg-surface-2 text-ink-strong flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium"
                    >
                      <span>
                        {displayLanguage(code, code)}
                        <span className="text-ink-soft ml-1.5 text-[12px] font-normal">
                          ({displayLanguage(code, 'en')})
                        </span>
                      </span>
                      <IconButton
                        label={`Unblock ${displayLanguage(code, 'en')}`}
                        onClick={() => {
                          removeBlocked(code);
                        }}
                      >
                        ×
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}

              {blockedAddable.length > 0 ? (
                <AddLanguagePicker
                  label="Block another"
                  options={blockedAddable}
                  onAdd={addBlocked}
                />
              ) : null}
            </section>

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
                          removeDomain(domain);
                        }}
                      >
                        ×
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addDomain} className="flex max-w-md gap-2">
                <input
                  type="text"
                  value={domainDraft}
                  onChange={(e) => {
                    setDomainDraft(e.target.value);
                    setDomainError(null);
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
              {domainError ? <p className="text-accent mt-2 text-[12.5px]">{domainError}</p> : null}
            </section>

            <section>
              <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
                Page content
              </h3>
              <p className="text-ink-soft mb-4 text-sm">
                When on, Movar also hides blocked-language entries from on-site language pickers and
                blurs content cards (e.g. YouTube videos) in a blocked language. Off by default;
                turn on if you want a tidier page.
              </p>

              <label className="flex max-w-md cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={settings.contentModification}
                  onChange={toggleContentModification}
                  className="accent-accent mt-0.5 size-4"
                />
                <span className="text-ink text-[13px] leading-relaxed">
                  Allow Movar to modify page content on visited sites.
                </span>
              </label>
            </section>
          </div>

          <aside className="border-border text-ink-soft border-l pt-1 pl-4 text-[12.5px] leading-[1.6]">
            <b className="text-ink-strong mb-1 block text-[13px] font-semibold">
              How priority works
            </b>
            Movar negotiates each request with the site&apos;s available languages. If a site offers
            Ukrainian, it serves Ukrainian. If only English, English. If only Russian, Movar tries
            to switch you away.
            <b className="text-ink-strong mt-4 mb-1 block text-[13px] font-semibold">
              Blocked vs exempt
            </b>
            <em>Blocked</em> languages trigger an automatic switch away.
            <em> Exempt</em> sites are ignored entirely — Movar does nothing on them.
          </aside>
        </div>
      </div>

      <footer className="text-ink-faint mx-auto mt-6 max-w-3xl px-1 text-center text-[12px]">
        <a href={FEEDBACK_URL} className="hover:text-ink-strong transition-colors">
          Send feedback
        </a>
      </footer>
    </main>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled = false, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="text-ink-soft hover:text-ink-strong hover:bg-surface-3 disabled:text-ink-faint flex size-7 items-center justify-center rounded-md font-mono text-[14px] transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

interface AddLanguagePickerProps {
  label: string;
  options: readonly LanguageCode[];
  onAdd: (code: LanguageCode) => void;
}

function AddLanguagePicker({ label, options, onAdd }: AddLanguagePickerProps) {
  const [draft, setDraft] = useState('');

  const handleAdd = (): void => {
    if (!draft) return;
    onAdd(draft);
    setDraft('');
  };

  return (
    <div className="mt-4 flex max-w-md items-center gap-2">
      <select
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        aria-label={label}
        className="border-border bg-surface text-ink-strong focus:border-accent flex-1 rounded-lg border px-3 py-2 text-[13px] outline-none"
      >
        <option value="">{label}…</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {displayLanguage(code, 'en')} ({code})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!draft}
        className="bg-ink-strong text-bg hover:bg-ink disabled:bg-surface-3 disabled:text-ink-faint rounded-lg px-4 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed"
      >
        Add
      </button>
    </div>
  );
}

# Exempt sites (the allowlist)

An **exempt site** is a domain where Movar takes no action at all: no
Accept-Language / URL switching, no picker filtering, no content concealment.
Stored in `MovarSettings.allowlist` (`packages/settings`), default empty.

This is the permanent, per-site off switch. It is distinct from the two
temporary levers — the global **pause** and the per-site **snooze** — which
lapse on their own; an exemption stays until the user removes it.

## Stored domain form (the contract)

Every entry is canonicalised before it reaches storage or matching, by
`normaliseDomain` + `normalizeAllowlist` (`packages/settings/src/index.ts`):

- lowercased, surrounding whitespace trimmed;
- a `https://` / `http://` scheme, any path, query, or `:port` stripped;
- a leading `www.` stripped;
- syntactically invalid entries (wildcards, bare single labels, empty) dropped;
- de-duplicated, first-seen order preserved.

So `HTTPS://www.Example.com/path`, `www.example.com`, and `example.com` all
store as `example.com`.

**No wildcards, no Public Suffix List.** An entry is a registrable domain, not a
pattern. There is deliberately no `*.example.com` syntax and no PSL awareness —
matching (below) already covers subdomains, and a PSL dependency isn't worth the
size budget in the content script.

## Matching

`hostMatchesDomain` (`apps/extension/src/lib/host-match.ts`) matches a host
against a stored domain **exactly or as a subdomain**, dot-anchored:

- `example.com` matches `example.com` and `news.example.com`;
- `example.com` does **not** match `notexample.com` (the `.` anchor);
- because entries are `www.`-stripped on the way in, `example.com` covers
  `www.example.com` via the subdomain rule.

The matcher itself only folds case and a trailing dot — it trusts that stored
entries are already canonical. That guarantee is upheld at the settings boundary
(`enforceInvariants` in `apps/extension/src/lib/settings.ts`), which normalises
the allowlist on every read and before every write. Legacy or hand-edited
`storage.sync` values are cleaned on read and persist cleaned on the next write.

## Where it takes effect (and when)

Two runtime consumers read the same normalised `settings.allowlist`, so they
always agree for a given host and its subdomains:

- **Content script** (`content-runtime.ts`) — bails at load for an exempt host,
  so nothing is switched or concealed.
- **DNR** (`lib/dnr.ts`) — the exempt domains ride `excludedRequestDomains`, so
  the network-level Accept-Language rewrite skips them too.

**Reload semantics.** Both gates are evaluated at page load. Exempting the active
site (or re-enabling it) therefore reloads that tab so the change takes effect
immediately; edits made from the options page apply on the next load of an
affected tab.

## User surfaces

- **Popup** — "Always skip this site" adds the active host; the exempt hero's
  "Turn on for this site" removes every entry matching the active host. The
  popup reports the active tab's exempt state. The "Always skip" action is only
  offered when the active host reduces to a storable domain (`isStorableDomain`)
  — a dotless host (`localhost`, an intranet name) would be dropped at the
  storage boundary, so the affordance is hidden there rather than reloading the
  tab with nothing stored.
- **Options page** — `AllowlistSection` (`@movar/options-ui`) lists stored
  entries, adds a typed domain (normalised + validated + de-duplicated through
  the same helpers), and removes entries.

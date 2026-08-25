import { useEffect, useState } from 'react';
import type { CorrectionMechanism } from '@movar/events';
import { useI18n } from '@movar/i18n';
import type { Messages } from '@movar/i18n';
import { cn } from '@movar/ui';
import { getCorrectionEvents } from '../../lib/events';
import { aggregateCorrections } from '../../lib/insights';
import type { CorrectionsInsights } from '../../lib/insights';

/**
 * Read-only insights for the on-device corrections log. Performs a single
 * `getCorrectionEvents()` read on mount, aggregates it with `aggregateCorrections`,
 * and renders the rollup. Never writes back — this is a pure local readout, so
 * it adds no permissions and makes no network call: nothing leaves the browser.
 *
 * `null` insights = the load effect hasn't settled yet; render nothing until it
 * does (mirrors the load-then-render pattern in `options/App.tsx`).
 */
export function InsightsSection() {
  const { t } = useI18n();
  const [insights, setInsights] = useState<CorrectionsInsights | null>(null);

  useEffect(() => {
    void (async () => {
      setInsights(aggregateCorrections(await getCorrectionEvents(), Date.now()));
    })();
  }, []);

  return (
    <section>
      <h3 className="font-display text-ink-strong text-ui-xl mb-2 font-bold tracking-tight">
        {t.options.insights.title}
      </h3>

      <InsightsContent insights={insights} />
    </section>
  );
}

interface ContentProps {
  /** `null` until the load effect settles — renders nothing in that frame. */
  insights: CorrectionsInsights | null;
}

/** Picks the right body: nothing while loading, a quiet State line when the
 *  log is empty, the rollup otherwise. Split out so the section heading never
 *  flickers and the choice avoids a nested ternary in JSX. */
function InsightsContent({ insights }: Readonly<ContentProps>) {
  const { t } = useI18n();
  if (insights == null) return null;
  if (insights.isEmpty) {
    return <p className="text-ink-faint mt-4 text-sm italic">{t.options.insights.empty}</p>;
  }
  return <InsightsBody insights={insights} />;
}

interface BodyProps {
  insights: CorrectionsInsights;
}

function InsightsBody({ insights }: Readonly<BodyProps>) {
  const { t } = useI18n();

  return (
    <div className="mt-4 max-w-md space-y-6">
      <div className="space-y-1">
        <p className="text-ink-strong text-ui-lg font-semibold">
          {t.options.insights.thisWeek(insights.thisWeek)}
        </p>
        <p className="text-ink-soft text-ui-base">{t.options.insights.total(insights.total)}</p>
      </div>

      <CountList
        label={t.options.insights.topSitesLabel}
        rows={insights.topSites.map((s) => ({
          key: s.domain,
          term: s.domain,
          value: t.options.insights.siteCount(s.count),
          mono: true,
        }))}
      />

      <CountList
        label={t.options.insights.byMechanismLabel}
        rows={mechanismRows(insights.byMechanism, t)}
      />

      <CountList
        label={t.options.insights.bySourceLabel}
        rows={sourceRows(insights.byEngine, insights.syncTier, t)}
      />
    </div>
  );
}

interface CountRow {
  key: string;
  term: string;
  value: string;
  /** Render the term in mono — used for domains, the one term that is a
   *  literal string from the page rather than translated copy. */
  mono?: boolean;
}

interface CountListProps {
  label: string;
  rows: CountRow[];
}

/** A labelled term/count list. Renders nothing when there are no rows, so an
 *  absent breakdown quietly disappears rather than showing an empty heading. */
function CountList({ label, rows }: Readonly<CountListProps>) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h4 className="text-ink-soft text-ui-xs mb-2 font-mono tracking-wide uppercase">{label}</h4>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3">
            <dt
              className={cn(
                'text-ink-strong text-ui-base',
                row.mono === true && 'text-ui-base font-mono',
              )}
            >
              {row.term}
            </dt>
            <dd className="text-ink-soft text-ui-base tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Mechanism tallies, sorted by count desc, mapped through the i18n label map. */
function mechanismRows(byMechanism: CorrectionsInsights['byMechanism'], t: Messages): CountRow[] {
  return (Object.entries(byMechanism) as [CorrectionMechanism, number][])
    .toSorted(([, a], [, b]) => b - a)
    .map(([mechanism, count]) => ({
      key: mechanism,
      term: t.options.insights.mechanism[mechanism],
      value: String(count),
    }));
}

/** How Movar learned each page's language, as two rows: the page said so
 *  outright (the sync tiers) versus Movar had to read the visible text
 *  (tier 7). The per-engine tallies are summed into the "read" row rather
 *  than listed: which detector won the tier-7 race is diagnostics, not
 *  something a reader can act on, and folding them keeps raw detector ids
 *  ("franc", "chrome-ai") off a page whose every other row is prose.
 *  Unlike the sibling lists this order is fixed, not count-sorted — two rows
 *  that swap places between visits read as churn, and the pair tells a story
 *  in this order. Empty buckets drop out, so a log that never needed reading
 *  shows one row rather than a zero. */
function sourceRows(
  byEngine: CorrectionsInsights['byEngine'],
  syncTier: number,
  t: Messages,
): CountRow[] {
  const read = Object.values(byEngine).reduce((sum, count) => sum + count, 0);

  return [
    { key: 'declared', term: t.options.insights.source.declared, count: syncTier },
    { key: 'read', term: t.options.insights.source.read, count: read },
  ]
    .filter(({ count }) => count > 0)
    .map(({ key, term, count }) => ({ key, term, value: String(count) }));
}

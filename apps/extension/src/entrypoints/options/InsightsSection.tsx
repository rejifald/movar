import { useEffect, useState } from 'react';
import type { CorrectionMechanism } from '@movar/events';
import { useI18n } from '@movar/i18n';
import type { Messages } from '@movar/i18n';
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
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
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
      <div className="space-y-0.5">
        <p className="text-ink-strong text-[15px] font-semibold">
          {t.options.insights.thisWeek(insights.thisWeek)}
        </p>
        <p className="text-ink-soft text-[13px]">{t.options.insights.total(insights.total)}</p>
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
        label={t.options.insights.byEngineLabel}
        rows={engineRows(insights.byEngine, insights.syncTier, t)}
      />
    </div>
  );
}

interface CountRow {
  key: string;
  term: string;
  value: string;
  /** Render the term in mono — used for domains and engine ids. */
  mono?: boolean;
}

interface CountListProps {
  label: string;
  rows: CountRow[];
}

/** A labelled term/count list. Renders nothing when there are no rows, so an
 *  absent breakdown (e.g. no engine-tagged corrections) quietly disappears
 *  rather than showing an empty heading. */
function CountList({ label, rows }: Readonly<CountListProps>) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h4 className="text-ink-soft mb-2 font-mono text-[11px] tracking-wide uppercase">{label}</h4>
      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3">
            <dt
              className={`text-ink-strong text-[13px] ${row.mono === true ? 'font-mono text-[12.5px]' : ''}`}
            >
              {row.term}
            </dt>
            <dd className="text-ink-soft text-[13px] tabular-nums">{row.value}</dd>
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

/** Engine tallies plus the sync-tier (engine-less) bucket, sorted by count desc.
 *  The sync-tier row is appended only when there are engine-less corrections. */
function engineRows(
  byEngine: CorrectionsInsights['byEngine'],
  syncTier: number,
  t: Messages,
): CountRow[] {
  const engines: CountRow[] = Object.entries(byEngine)
    .toSorted(([, a], [, b]) => b - a)
    .map(([engine, count]) => ({ key: engine, term: engine, value: String(count), mono: true }));

  if (syncTier > 0) {
    engines.push({ key: 'sync-tier', term: t.options.insights.syncTier, value: String(syncTier) });
  }
  return engines;
}

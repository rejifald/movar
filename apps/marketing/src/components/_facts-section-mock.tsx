import type { JSX } from 'react';

/**
 * Shared mock shell for the Problem + Stakes story files. The production
 * `Problem.astro` and `Stakes.astro` components are themselves
 * near-identical — same Tailwind shell, different i18n slice and
 * section id — and the React story mocks mirrored that duplication
 * before being extracted here. Underscored filename + non-`.stories.tsx`
 * suffix keeps Storybook from picking it up as a story.
 *
 * If/when production extracts a shared `FactsSection.astro`, fold this
 * mock into its sibling `.stories.tsx` and delete the helper.
 */
export interface FactsSlice {
  sectionTitle: string;
  sectionLead: string;
  facts: readonly { heading: string; body: string }[];
  closeLine: string;
}

export function FactsSectionMock({
  sectionId,
  t,
}: {
  sectionId: string;
  t: FactsSlice;
}): JSX.Element {
  return (
    <section id={sectionId} className="border-border bg-bg border-t px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <p className="font-display text-accent text-xs font-bold tracking-wider uppercase">
          {t.sectionTitle}
        </p>
        <h2 className="font-display text-ink-strong mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionLead}
        </h2>

        <ul className="mt-10 space-y-6">
          {t.facts.map((fact) => (
            <li key={fact.heading}>
              <p className="font-display text-ink-strong text-lg font-bold">{fact.heading}</p>
              <p className="text-ink-soft mt-1 leading-relaxed">{fact.body}</p>
            </li>
          ))}
        </ul>

        <p className="text-ink-strong mt-10 text-lg font-medium">{t.closeLine}</p>
      </div>
    </section>
  );
}

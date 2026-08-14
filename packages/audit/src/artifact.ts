/**
 * The artifact: one self-contained HTML file carrying the readable report, the
 * evidence it was adjudicated from, and the command that re-runs it.
 *
 * Three properties are the whole point, and each is a structural choice here
 * rather than a convention someone has to remember:
 *
 * 1. **One file, no network.** The stylesheet is inlined and there is no
 *    script, font, stylesheet or image reference of any kind — the icon is an
 *    empty `data:` URI so opening the file cannot provoke even a favicon
 *    request. An artifact that fetches anything is one a reader can be tracked
 *    by and one that decays the day a CDN path moves; neither is survivable for
 *    a document whose job is to still be checkable in three years.
 * 2. **Report and proof cannot be separated.** `{ evidence, report }` rides
 *    inside the document as JSON, so the file an auditor posts is the file the
 *    accused re-runs. Publishing the readable half alone turns a bug report
 *    with a repro back into an accusation.
 * 3. **Every string in here is hostile input.** Not "may be" — *is*: URLs,
 *    picker labels, `<html lang>` values and finding summaries all quote bytes
 *    from an audited third party, and `--replay` renders bundles that arrive
 *    from strangers, which makes rule ids, collector names and ruleset ids
 *    untrusted too. So every interpolated value goes through
 *    {@link escapeHtml}, and the embedded JSON gets a second escape of its own:
 *    `JSON.stringify` alone breaks out of a `<script>` block the moment a page
 *    quotes the substring that closes one.
 *
 * Pure, like the rest of the kernel. `generatedAt` is a parameter rather than a
 * reading of the clock because one bundle must render one document, byte for
 * byte, however many times it is rendered — that is the same property `replay`
 * rests on, and a timestamp read in here would quietly break it.
 *
 * @see ../../../docs/movar-audit.md — ADR §8, "The artifact"
 */

import type { Evidence, Vantage } from './evidence';
import type { EvidenceRef, Finding, FindingSubject, FindingVerdict, Verdict } from './finding';
import type { CoverageSummary, EvidenceStamp, Report, RuleResult } from './report';

/**
 * The document's own language. The prose is English — the rule titles, the
 * finding summaries and the CLI already are — and the one Ukrainian phrase in
 * it carries its own `lang`. A report that misdeclares its language would be
 * failed by family A of its own catalogue.
 */
const DOCUMENT_LANGUAGE = 'en';

/** The product name, and the artifact's name in both languages. */
const PRODUCT = 'Movar Audit';
const ARTIFACT_TITLE = 'Language conformance report';
const ARTIFACT_TITLE_UK = 'Звіт про мовну відповідність';

/**
 * The filename the replay command names.
 *
 * This renderer cannot know what the file will be saved as — it is producing a
 * string, and the caller decides where the string lands — so the command prints
 * the ADR's canonical name and the sentence beside it tells the reader to
 * substitute their own. A placeholder like `<file>` reads as a template nobody
 * ran; a real name reads as a command, and being one word wrong is cheaper than
 * being unrunnable.
 */
const REPLAY_FILENAME = 'report.html';
const REPLAY_COMMAND = `npx @movar/audit --replay ${REPLAY_FILENAME}`;

/** The id a replay reader looks the embedded bundle up by. Part of the contract. */
const BUNDLE_ELEMENT_ID = 'movar-audit-bundle';

/**
 * Findings the report accuses with, and findings it merely records. The split
 * is the document's spine: a reader must meet what failed before what was
 * noticed, and an observation must never be laid out as if it were a defect.
 * Within each group the catalogue order of `report.findings` survives, so two
 * reports of the same site diff line by line.
 */
const ACCUSING_VERDICTS = new Set<FindingVerdict>(['fail', 'warn']);
const FINDING_VERDICT_ORDER: readonly FindingVerdict[] = ['fail', 'warn', 'observation', 'info'];

/**
 * The five characters that can end an HTML text run or an attribute value.
 *
 * Escaped in one pass off this table rather than by chained `.replaceAll` calls:
 * a chain has to replace `&` first or it re-escapes its own output, and "first"
 * is exactly the ordering constraint that a later edit silently breaks.
 */
const HTML_ESCAPES = new Map<string, string>([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/** Escape a value for either HTML text or a double-quoted attribute value. */
function escapeHtml(value: string): string {
  return value.replaceAll(/["&'<>]/gu, (character) => HTML_ESCAPES.get(character) ?? character);
}

/**
 * The JSON escape for `<` — the six characters, never the character itself.
 * Written as a named constant because a bare escape sequence inside a
 * `replaceAll` argument is the kind of thing an editor, a codemod or a careless
 * merge silently turns back into a literal `<`, which fails open.
 */
const JSON_LESS_THAN = String.raw`\u003c`;

/**
 * Serialize the bundle for a `<script type="application/json">` block.
 *
 * An HTML parser does not parse that block's contents — it scans for the string
 * that closes the element — so one finding quoting a page's own closing script
 * tag would end the block early and spill the rest of the JSON into the
 * document as markup. Escaping every `<` closes that: JSON only ever puts `<`
 * inside a string literal, where the escape means the same character to every
 * parser, so the bundle still round-trips through `JSON.parse` unchanged.
 */
function embedJson(bundle: AuditBundle): string {
  return JSON.stringify(bundle).replaceAll('<', JSON_LESS_THAN);
}

/** `1 page`, `3 pages`. A document that writes "1 pages" is not one to trust with facts. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * One `<dt>`/`<dd>` pair inside a `<dl>`.
 *
 * Escapes the label as well as the value. Labels are ours today, but a helper
 * that escapes only *some* of what it is handed is one refactor away from being
 * the hole, and escaping a literal costs nothing.
 */
function pair(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

/** A titled section of the document. `body` is already-rendered markup. */
function section(id: string, heading: string, body: string): string {
  return `<section id="${escapeHtml(id)}"><h2>${escapeHtml(heading)}</h2>${body}</section>`;
}

/**
 * The verdict, as a badge that says the verdict word.
 *
 * Colour is never the only carrier: the token itself is printed, so the
 * distinction survives greyscale printing, a photocopy and colour-blindness.
 */
function verdictBadge(verdict: Verdict | FindingVerdict): string {
  return `<span class="verdict verdict--${escapeHtml(verdict)}">${escapeHtml(verdict)}</span>`;
}

/** What a finding is about: the page, and the node inside it when it named one. */
function subjectLine(subject: FindingSubject): string {
  const where = subject.url ?? subject.path ?? '';
  const node = subject.node ?? '';
  return [where, node].filter((part) => part !== '').join(' · ');
}

/** A citation into the evidence, in the reader's words rather than the union's. */
function evidenceRefLabel(ref: EvidenceRef): string {
  switch (ref.kind) {
    case 'page': {
      return `page ${ref.pageId}`;
    }
    case 'node': {
      return `node ${ref.pageId} ${ref.nodePath}`;
    }
    case 'probe': {
      return `probe ${ref.probeId}`;
    }
    case 'redirect-chain': {
      return `redirect chain of probe ${ref.probeId}`;
    }
    case 'attachment': {
      return `attachment ${ref.attachmentId}`;
    }
  }
}

/** The grounding, the hybrid `via`, and the denominator a classified finding must carry. */
function findingMeta(finding: Finding): readonly string[] {
  const meta = [`grounding: ${finding.grounding}`];
  if (finding.via !== undefined) meta.push(`answered by: ${finding.via}`);
  if (finding.denominator !== undefined) {
    meta.push(`${finding.denominator.matched} of ${finding.denominator.examined} examined`);
  }
  return meta;
}

/** A prose list. Each item is escaped: the counts inside them are interpolated. */
function bullets(items: readonly string[]): string {
  const listItems = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<ul class="prose">${listItems}</ul>`;
}

/** An optional line of a finding, rendered only when it has something to say. */
function findingLine(className: string, text: string): string {
  if (text === '') return '';
  return `<p class="finding__${escapeHtml(className)}">${escapeHtml(text)}</p>`;
}

/**
 * One finding, with everything it rests on.
 *
 * The `downgradedFrom` note is printed rather than smoothed away: the kernel
 * strips failing power from anything the classifier answered, and a report that
 * hid that would be presenting a statistical guess with the same weight as a
 * site's own markup.
 */
function findingItem(finding: Finding): string {
  const citations = finding.evidence.map((ref) => evidenceRefLabel(ref)).join(', ');
  const citation =
    finding.citation === undefined
      ? ''
      : `${finding.citation.source} · ${finding.citation.article} · ${finding.citation.url}`;
  const downgraded =
    finding.downgradedFrom === undefined
      ? ''
      : 'The classifier answered this one, so it cannot fail the site — recorded as an observation.';

  return (
    `<li class="finding finding--${escapeHtml(finding.verdict)}">` +
    `<p class="finding__head">${verdictBadge(finding.verdict)}` +
    `<code>${escapeHtml(finding.rule)}</code></p>` +
    findingLine('summary', finding.summary) +
    findingLine('subject', subjectLine(finding.subject)) +
    findingLine('meta', findingMeta(finding).join(' · ')) +
    findingLine('note', downgraded) +
    findingLine('cite', citations === '' ? '' : `evidence: ${citations}`) +
    findingLine('law', citation) +
    '</li>'
  );
}

/** A group of findings, or an honest sentence saying there were none. */
function findingGroup(heading: string, findings: readonly Finding[], empty: string): string {
  const body =
    findings.length === 0
      ? `<p class="prose">${escapeHtml(empty)}</p>`
      : `<ol class="findings">${findings.map((finding) => findingItem(finding)).join('')}</ol>`;
  return `<h3>${escapeHtml(heading)}</h3>${body}`;
}

/** The findings whose verdicts fall in `wanted`, worst first, catalogue order within. */
function findingsByVerdict(
  report: Report,
  wanted: ReadonlySet<FindingVerdict>,
): readonly Finding[] {
  return FINDING_VERDICT_ORDER.filter((verdict) => wanted.has(verdict)).flatMap((verdict) =>
    report.findings.filter((finding) => finding.verdict === verdict),
  );
}

/**
 * The right-hand column of the per-rule table.
 *
 * A `not-collected` rule says, in words, that it was not checked and that this
 * is not a pass. Silently passing what it did not check is the default failure
 * mode of every audit tool, and a table that renders "not-collected" as just
 * another quiet row is how a reader ends up believing 41 rules were run.
 */
function ruleNote(result: RuleResult): string {
  if (result.verdict === 'not-collected') {
    const missing = [...(result.missingCapabilities ?? [])].join(', ');
    const lacked = missing === '' ? 'this run' : `this run collected no ${missing}`;
    return `not checked — ${lacked}. This is not a pass.`;
  }
  if (result.verdict === 'not-applicable') {
    return result.notApplicableReason ?? 'the rule found nothing to adjudicate';
  }
  if (result.findings.length === 0) return '';
  return plural(result.findings.length, 'finding');
}

/** One row of the per-rule table, keyed by rule id so the table stays machine-readable. */
function ruleRow(result: RuleResult): string {
  return (
    `<tr class="rule rule--${escapeHtml(result.verdict)}" data-rule="${escapeHtml(result.rule)}">` +
    `<td>${verdictBadge(result.verdict)}</td>` +
    `<td><code>${escapeHtml(result.rule)}</code>` +
    `<span class="rule__title">${escapeHtml(result.title)}</span></td>` +
    `<td class="rule__note">${escapeHtml(ruleNote(result))}</td>` +
    '</tr>'
  );
}

/** A vantage's country is a claim, never a measurement — so the line says which. */
function vantageLine(vantage: Vantage): string {
  const { country } = vantage;
  if (country === undefined) return `${vantage.id} (${vantage.kind})`;
  const confidence = country.verified === true ? 'verified' : 'claimed, unverified';
  return `${vantage.id} (${vantage.kind}) — ${country.claimed}, ${confidence}`;
}

/** How much was actually collected, so an empty bundle cannot look like a thorough run. */
function evidenceVolume(evidence: Evidence): string {
  const parts = [plural(evidence.pages.length, 'page')];
  if (evidence.source.kind === 'network') {
    parts.push(plural(evidence.source.probes.length, 'probe'));
  }
  const attachments = evidence.attachments?.length ?? 0;
  if (attachments > 0) parts.push(plural(attachments, 'attachment'));
  return parts.join(' · ');
}

/** Where the evidence came from, and what the collector's shape allowed to be judged. */
function provenancePairs(stamp: EvidenceStamp, evidence: Evidence): readonly string[] {
  const capabilities = [...stamp.capabilities].join(', ');
  return [
    pair('Evidence collected', stamp.collectedAt),
    pair('Collector', `${stamp.collector.id} ${stamp.collector.version}`),
    pair('Source', stamp.sourceKind),
    ...(stamp.root === undefined ? [] : [pair('Build root', stamp.root)]),
    ...(stamp.vantage === undefined ? [] : [pair('Vantage', vantageLine(stamp.vantage))]),
    pair('Collected', evidenceVolume(evidence)),
    pair('Capabilities', capabilities === '' ? 'none' : capabilities),
  ];
}

/** The masthead: what this is, about what, produced when, from what. */
function masthead(report: Report, evidence: Evidence, target: string, generatedAt: string): string {
  const { ruleset } = report;
  const pairs = [
    pair('Target', target),
    pair('Report generated', generatedAt),
    ...provenancePairs(report.evidence, evidence),
    pair('Ruleset', `${ruleset.id} ${ruleset.version} · ${plural(ruleset.ruleIds.length, 'rule')}`),
    pair('Schema', `report v${report.schemaVersion} · evidence v${report.evidence.schemaVersion}`),
  ];
  return (
    '<header class="masthead">' +
    `<p class="eyebrow">${escapeHtml(PRODUCT)}</p>` +
    `<h1>${escapeHtml(ARTIFACT_TITLE)}</h1>` +
    `<p class="masthead__uk" lang="uk">${escapeHtml(ARTIFACT_TITLE_UK)}</p>` +
    `<dl class="stamps">${pairs.join('')}</dl>` +
    '</header>'
  );
}

/**
 * The headline is a **count of broken promises**, and says so.
 *
 * Never a score and never a grade: a weight is an argument nobody wins, and one
 * number would laminate a redirect chain onto a classifier verdict so the
 * weakest input sets the credibility of the whole document.
 */
function headline(report: Report): string {
  const count = report.brokenPromises;
  const label = count === 1 ? 'broken promise' : 'broken promises';
  return (
    '<section id="headline" class="headline">' +
    `<p class="headline__count">${escapeHtml(String(count))}</p>` +
    `<p class="headline__label">${escapeHtml(label)}</p>` +
    '<p class="headline__note">A count of the findings that failed — where this site ' +
    'did not deliver what it declared about itself. It is not a score and not a grade: ' +
    'nothing here is weighted, and observations are cited rather than counted.</p>' +
    '</section>'
  );
}

/** How much of the catalogue actually ran, with `not-collected` never folded into a pass. */
function coverageSection(coverage: CoverageSummary): string {
  const stats = [
    pair('Rules in the ruleset', String(coverage.rules)),
    pair('Ran', String(coverage.ran)),
    pair('Passed', String(coverage.passed)),
    pair('Failed', String(coverage.failed)),
    pair('Warned', String(coverage.warned)),
    pair('Not applicable', String(coverage.notApplicable)),
    pair('Not collected', String(coverage.notCollected)),
  ];
  const note =
    coverage.notCollected === 0
      ? 'Every rule in the ruleset had the evidence it needed.'
      : `Not everything was checked: ${plural(coverage.notCollected, 'rule')} lacked the ` +
        'evidence needed to adjudicate. Each is listed below with what was missing, and none ' +
        'of them counts as a pass.';
  return section(
    'coverage',
    'Coverage',
    `<dl class="stats">${stats.join('')}</dl><p class="prose">${escapeHtml(note)}</p>`,
  );
}

/** Failures and warnings first; observations and infos after, as the record they are. */
function findingsSection(report: Report): string {
  const accusing = findingsByVerdict(report, ACCUSING_VERDICTS);
  const recorded = report.findings.filter((finding) => !ACCUSING_VERDICTS.has(finding.verdict));
  return section(
    'findings',
    'Findings',
    findingGroup(
      'Failures and warnings',
      accusing,
      'Nothing failed and nothing warned in what was checked.',
    ) +
      findingGroup(
        'Observations',
        recorded,
        'Nothing else was recorded — no observations, no notes.',
      ),
  );
}

/** Every rule in the ruleset, in catalogue order, including the ones that never ran. */
function rulesSection(report: Report): string {
  const rows = report.results.map((result) => ruleRow(result)).join('');
  return section(
    'rules',
    'Every rule in the ruleset',
    '<p class="prose">In catalogue order, so two reports of the same site can be read side ' +
      'by side. A rule that did not run says so and says what was missing.</p>' +
      '<table class="rules"><thead><tr><th>Verdict</th><th>Rule</th><th>Note</th></tr></thead>' +
      `<tbody>${rows}</tbody></table>`,
  );
}

/** The line that turns an accusation into a bug report with a repro. */
function replaySection(): string {
  return section(
    'replay',
    'Replay this report',
    '<p class="prose">The evidence this report was adjudicated from is embedded in this ' +
      'file. Re-adjudicate it yourself, against the ruleset stamped above, on your own ' +
      'machine:</p>' +
      `<pre class="command"><code>${escapeHtml(REPLAY_COMMAND)}</code></pre>` +
      '<p class="prose">Substitute whatever you saved this file as. Report and proof cannot ' +
      'be separated here: the file an auditor posts is the file the site owner re-runs. If a ' +
      'finding above is wrong, that command is how you show it.</p>',
  );
}

/**
 * What the document proves and what it does not.
 *
 * The wording is deliberately unflattering to the tool. Claiming more than a
 * reproducible record — legal proof, certainty, a verdict — would be the one
 * overreach that discredits every true finding beside it.
 */
function scopeSection(coverage: CoverageSummary): string {
  const does = [
    'It is a reproducible record. It carries the evidence it was adjudicated from and the ' +
      'ruleset it was adjudicated against, so the same bytes yield the same report on anyone’s ' +
      'machine — including the audited site’s.',
    'Every finding cites the evidence it rests on, so a finding you believe is wrong is ' +
      'falsifiable rather than arguable.',
    'It reports what the site declared about itself and what the collector observed. It never ' +
      'asserts that a site ought to offer a language it does not declare.',
  ];
  const doesNot = [
    'It is not legal proof. Admissibility turns on jurisdiction, chain of custody and usually ' +
      'an affidavit from whoever ran the audit. This file is a measurement record; whoever ' +
      'needs to attest wraps it in their own document.',
    'Detection is not 100% accurate, and a human must judge. Language classification is ' +
      'statistical, so findings the classifier answered are recorded as observations and can ' +
      'never fail a site.',
    `It says nothing about the rules that did not run — ${plural(
      coverage.notCollected,
      'rule',
    )} here. That is not a pass.`,
    'It carries no operator identity: no names, no accounts, no signatures, nothing personal. ' +
      'Movar Audit is an instrument, not an audit firm’s workflow product.',
  ];
  return section(
    'scope',
    'What this proves — and what it does not',
    `<h3>What it does</h3>${bullets(does)}<h3>What it does not</h3>${bullets(doesNot)}`,
  );
}

/**
 * The document's own type scale.
 *
 * `@movar/theme`'s type roles are product-UI only — `type-display` is size-less
 * and has already shipped broken once on a marketing page — and this file must
 * render with nobody else's stylesheet anyway. So the scale is declared here in
 * document terms: a masthead, one headline number, prose measured for reading,
 * and a dense data table. The palette is fixed light and says so with
 * `color-scheme`, because the ADR's PDF path is a rendering of this HTML and a
 * force-darkened artifact prints as a black rectangle.
 */
const STYLESHEET = `
:root {
  color-scheme: light;
  --paper: #fffdfb;
  --paper-shade: #f4f1ec;
  --ink: #1c1917;
  --ink-soft: #57534e;
  --hairline: #e0dbd4;
  --fail: #9f1239;
  --warn: #92400e;
  --pass: #15803d;
  --idle: #57534e;
  --font-text: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  --type-xs: 0.75rem;
  --type-sm: 0.8125rem;
  --type-base: 1.0625rem;
  --type-lg: 1.1875rem;
  --type-xl: 1.625rem;
  --type-display: 4rem;
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-text);
  font-size: var(--type-base);
  line-height: 1.6;
}
.report { max-width: 44rem; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
h1, h2, h3 { font-family: var(--font-ui); font-weight: 600; line-height: 1.25; }
h1 { font-size: var(--type-xl); margin: 0.25rem 0 0; letter-spacing: -0.01em; }
h2 { font-size: var(--type-lg); margin: 0 0 0.75rem; }
h3 {
  font-size: var(--type-sm);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  margin: 2rem 0 0.75rem;
}
p { margin: 0 0 0.75rem; }
code { font-family: var(--font-mono); font-size: 0.9em; }
section { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--hairline); }
.prose { max-width: 34rem; color: var(--ink-soft); }
ul.prose, ol.prose { padding-left: 1.25rem; }
ul.prose li { margin-bottom: 0.5rem; }
.eyebrow {
  font-family: var(--font-ui);
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-soft);
  margin: 0;
}
.masthead__uk { font-style: italic; color: var(--ink-soft); margin: 0.25rem 0 0; }
.stamps, .stats { margin: 2rem 0 0; font-family: var(--font-ui); font-size: var(--type-sm); }
.stamps div, .stats div { display: flex; gap: 1rem; padding: 0.3rem 0; }
.stamps dt, .stats dt { flex: 0 0 11rem; color: var(--ink-soft); }
.stamps dd, .stats dd { margin: 0; word-break: break-word; }
.stats div { border-bottom: 1px solid var(--hairline); }
.headline { display: flex; flex-direction: column; }
.headline__count {
  font-family: var(--font-ui);
  font-size: var(--type-display);
  font-weight: 700;
  line-height: 1;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.headline__label {
  font-family: var(--font-ui);
  font-size: var(--type-lg);
  margin: 0.25rem 0 1rem;
}
.headline__note { max-width: 34rem; color: var(--ink-soft); font-size: var(--type-sm); }
.verdict {
  font-family: var(--font-mono);
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: var(--idle);
}
.verdict--fail { color: var(--fail); font-weight: 700; }
.verdict--warn { color: var(--warn); font-weight: 700; }
.verdict--pass { color: var(--pass); }
.verdict--not-collected {
  color: var(--ink);
  border: 1px dashed var(--ink-soft);
  border-radius: 0.2rem;
  padding: 0.05rem 0.3rem;
}
.findings { list-style: none; padding: 0; margin: 0; }
.finding { padding: 1rem 0 1rem 1rem; border-left: 3px solid var(--hairline); margin-bottom: 1rem; }
.finding--fail { border-left-color: var(--fail); }
.finding--warn { border-left-color: var(--warn); }
.finding__head { display: flex; gap: 0.75rem; align-items: baseline; margin-bottom: 0.35rem; }
.finding__summary { margin-bottom: 0.35rem; }
.finding__subject, .finding__meta, .finding__cite, .finding__law, .finding__note {
  font-family: var(--font-ui);
  font-size: var(--type-sm);
  color: var(--ink-soft);
  margin: 0.15rem 0 0;
  word-break: break-word;
}
.finding__note { font-style: italic; }
table.rules { width: 100%; border-collapse: collapse; font-size: var(--type-sm); margin-top: 1rem; }
table.rules th {
  text-align: left;
  font-family: var(--font-ui);
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--ink-soft);
  padding: 0.4rem 0.6rem;
}
table.rules td { vertical-align: top; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--hairline); }
.rule__title { display: block; font-family: var(--font-ui); color: var(--ink-soft); }
.rule__note { font-family: var(--font-ui); color: var(--ink-soft); }
.rule--not-collected td { background: var(--paper-shade); }
.rule--fail code { color: var(--fail); }
.command {
  background: var(--paper-shade);
  border: 1px solid var(--hairline);
  border-radius: 0.25rem;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  font-size: var(--type-sm);
}
@page { margin: 18mm; }
@media print {
  body { background: #fff; }
  .report { max-width: none; padding: 0; }
  section, .finding, tr { break-inside: avoid; }
}
`;

/**
 * The embedded bundle: the report and the exact evidence it was adjudicated
 * from, in one object, because the pair is the unit that has to survive being
 * forwarded.
 */
interface AuditBundle {
  readonly evidence: Evidence;
  readonly report: Report;
}

export interface ArtifactInput {
  readonly report: Report;
  readonly evidence: Evidence;
  /** The URL that was audited, as the operator named it. */
  readonly target: string;
  /**
   * ISO 8601, supplied by the caller. Reading a clock in here would make one
   * bundle render two different documents — see the module comment.
   */
  readonly generatedAt: string;
}

/**
 * Render one audit run as a self-contained HTML document.
 *
 * The result references nothing outside itself, carries `{ evidence, report }`
 * as embedded JSON, and escapes every value that came from the audited site.
 */
export function renderReportArtifact(input: ArtifactInput): string {
  const { report, evidence, target, generatedAt } = input;
  const bundle: AuditBundle = { evidence, report };
  const title = escapeHtml(`${ARTIFACT_TITLE} — ${target}`);
  return [
    '<!doctype html>',
    `<html lang="${DOCUMENT_LANGUAGE}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // An empty data: icon. Without it a browser asks the host for /favicon.ico,
    // which is the one request a "self-contained" document must not make.
    '<link rel="icon" href="data:,">',
    `<title>${title}</title>`,
    `<style>${STYLESHEET}</style>`,
    '</head>',
    '<body>',
    '<main class="report">',
    masthead(report, evidence, target, generatedAt),
    headline(report),
    coverageSection(report.coverage),
    findingsSection(report),
    rulesSection(report),
    replaySection(),
    scopeSection(report.coverage),
    '</main>',
    `<script type="application/json" id="${BUNDLE_ELEMENT_ID}">${embedJson(bundle)}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

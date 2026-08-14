/**
 * `Evidence` — the serializable structural digest a collector produces and
 * {@link ../evaluate.ts | evaluate()} consumes.
 *
 * Four properties are load-bearing and must survive every future edit:
 *
 * 1. **Never raw HTML.** A collector extracts the declared `lang`, the hreflang
 *    alternates, the picker model, link targets, text-node samples with node
 *    paths, and the response status / headers / redirect chain. It never hands
 *    the kernel a document to re-parse. That is what keeps `evaluate()` free of
 *    `jsdom`, free of I/O, and replayable from a stored bundle.
 * 2. **Attachments are citable, never readable.** {@link Attachment} carries a
 *    hash, a size and a media type — and deliberately **no content field**. A
 *    rule can point a reader at a screenshot or a stored body; it structurally
 *    cannot adjudicate on one, so a report replays identically when payload
 *    capture was off.
 * 3. **`source` is a discriminated union.** {@link ProbeEvidence} lives on the
 *    `network` branch only, so `http` / `matrix` / `multi-vantage` rules are
 *    structurally `not-collected` on `filesystem` evidence — no rule remembers
 *    to check.
 * 4. **`schemaVersion` is on the wire.** Schema growth is additive by
 *    discipline; a field added in v2 is simply absent from a v1 bundle and the
 *    rules that need it degrade to `not-collected` instead of crashing.
 */

/**
 * The `Evidence` wire-format version. Bump on every additive change; a stored
 * bundle carries the version it was written with and replays against it.
 *
 * - **v2** added {@link DocumentEvidence.head}. It is optional, so a stored v1
 *   bundle still parses and the rules that read the head report
 *   `not-applicable` naming the schema rather than crashing or, worse, passing.
 * - **v3** added {@link DocumentEvidence.textSampling}. Optional for the same
 *   reason: on a v1/v2 bundle the denominator falls back to the sample count it
 *   can see, which is what it quoted before the field existed.
 */
export const EVIDENCE_SCHEMA_VERSION = 3;

/**
 * A stable pointer to an element inside a collected page (a CSS-ish path).
 *
 * Deliberately a named alias rather than a bare `string`: it is a field of the
 * permanent `Evidence` contract, every collector must produce the same shape
 * for it, and it is the most likely field to gain structure (a path plus an
 * nth-of-type disambiguator) once a second collector lands.
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- names a wire-format field of a permanent public contract; see above
export type NodePath = string;

/** How the audit reached a page. */
export type PageReach = 'requested' | 'declared-target';

/** Whether the collector's cookie jar was empty for a probe. */
export type CookieState = 'cold' | 'warm';

/**
 * The network location an observation is made *from*: which egress IP, and
 * therefore which country the site thinks you are in. Part of a finding's
 * identity — the same rule legitimately passes from one vantage and fails from
 * another.
 */
export interface Vantage {
  /** Stable id; two probes share an id iff they share an egress. */
  readonly id: string;
  readonly kind: 'local' | 'proxy' | 'relay';
  /**
   * The country this vantage *claims*. Never a measurement — see
   * {@link VantageCountry}. Absent when the collector makes no claim.
   */
  readonly country?: VantageCountry;
}

/**
 * A vantage's country is a **claim, not a measurement**. A mock vantage must be
 * able to say "I am Germany" while egressing from Kyiv, and a future paid relay
 * is no different. The field is named `claimed` so a geo-dependent finding
 * cannot accidentally present it as an observed fact; `verified` is set only
 * when the collector independently confirmed the egress country.
 */
export interface VantageCountry {
  /** ISO 3166-1 alpha-2, as claimed by whoever configured the vantage. */
  readonly claimed: string;
  /** `true` only when the claim was independently confirmed. Default: false. */
  readonly verified?: boolean;
}

/** How `robots.txt` was treated for this run. */
export type RobotsPosture = 'honoured' | 'ignored' | 'not-applicable';

/** A collected page fetched over the network. */
export interface NetworkSource {
  readonly kind: 'network';
  /** The vantage the run was launched from. Per-probe vantage wins. */
  readonly vantage: Vantage;
  /**
   * Every response observation. Lives here — not on `Evidence` — so filesystem
   * evidence structurally cannot carry probes.
   */
  readonly probes: readonly ProbeEvidence[];
  readonly robots: RobotsPosture;
}

/** A built `dist/` read off disk. A filesystem has no network location. */
export interface FilesystemSource {
  readonly kind: 'filesystem';
  /** The build root every `path` is relative to. */
  readonly root: string;
}

export type EvidenceSource = NetworkSource | FilesystemSource;

/** Identifies the collector that wrote a bundle, for replay forensics. */
export interface CollectorStamp {
  /** e.g. `'node-undici'`, `'swift-urlsession'`, `'diagnostics-content-script'`. */
  readonly id: string;
  readonly version: string;
}

/** One hop of a redirect chain, in order. */
export interface RedirectHop {
  readonly url: string;
  readonly status: number;
  readonly location: string;
}

/**
 * Whether a probe produced something adjudicable. `blocked` is first-class: a
 * WAF or captcha interstitial returns HTTP 200 with its own `<html lang>` and
 * body text, so adjudicating it would manufacture a false accusation about a
 * named company. The kernel drops non-`ok` probes before any rule sees them.
 */
export type ProbeOutcome = 'ok' | 'blocked' | 'error';

/** One response observation: the unit the response matrix is built from. */
export interface ProbeEvidence {
  readonly id: string;
  /** The page this probe produced, when it produced one. */
  readonly pageId?: string;
  readonly url: string;
  /**
   * The `Accept-Language` this probe sent, or `null` for the no-preference leg.
   * The matrix varies **only** this.
   */
  readonly acceptLanguage: string | null;
  /** Authoritative for this probe — `source.vantage` is only the run default. */
  readonly vantage: Vantage;
  readonly cookieState: CookieState;
  readonly outcome: ProbeOutcome;
  readonly status: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly redirectChain: readonly RedirectHop[];
  /** Hash of the response body — byte identity without storing the bytes. */
  readonly bodyHash?: string;
  /** Attachment id for the stored body, when payload capture was on. */
  readonly bodyAttachmentId?: string;
  readonly certificateChain?: readonly string[];
}

/** An `<html lang>`-bearing element other than `<html>` itself. */
export interface LangAttribute {
  readonly nodePath: NodePath;
  /** The attribute value verbatim — never normalized by the collector. */
  readonly value: string;
}

/** A declared alternate: `<link rel="alternate" hreflang>` or a sitemap entry. */
export interface AlternateLink {
  /** The `hreflang` value verbatim, or `'x-default'`. */
  readonly hreflang: string;
  readonly href: string;
  readonly source: 'link' | 'header' | 'sitemap';
  readonly nodePath?: NodePath;
}

/** One entry of an on-site language picker. */
export interface PickerOption {
  /**
   * The language this entry offers, exactly as the site expressed it — a code,
   * a `value` attribute, or the visible label. Normalization is the kernel's
   * job, never the collector's.
   */
  readonly label: string;
  readonly href: string | null;
  readonly active: boolean;
  readonly nodePath: NodePath;
}

/** The `@movar/lang-pickers` model, digested. */
export interface PickerEvidence {
  readonly nodePath: NodePath;
  /** The picker family the model matched (`'select'`, `'anchor-list'`, …). */
  readonly kind: string;
  /** The active entry's language as the site expressed it, when it has one. */
  readonly activeLabel: string | null;
  readonly options: readonly PickerOption[];
}

/** A navigable target discovered in the page's own markup. */
export interface LinkTarget {
  readonly href: string;
  readonly nodePath: NodePath;
  readonly rel?: string;
  readonly hreflang?: string;
}

/**
 * A sampled text node — the classifier's only input. The collector samples;
 * it never classifies, so stored evidence re-adjudicates against an improved
 * classifier years later.
 */
export interface TextNodeSample {
  readonly nodePath: NodePath;
  readonly text: string;
  /** The nearest ancestor's declared `lang`, when one exists. */
  readonly inheritedLang: string | null;
  /** e.g. `'nav'`, `'footer'`, `'main'` — lets chrome-vs-body rules split. */
  readonly region?: string;
}

/**
 * A language declaration carried in the document head, or in the response
 * header the head duplicates.
 *
 * `source` mirrors {@link AlternateLink.source}, and for the same reason: a
 * `Content-Language` response header and a `<meta http-equiv>` assert the same
 * thing through different carriers, so folding the header into the document
 * digest is what keeps the rule that reads it `static` — adjudicable against a
 * stored bundle, with no probe lookup and no second capability.
 */
export interface HeadLanguageDeclaration {
  readonly kind: 'og-locale' | 'og-locale-alternate' | 'content-language';
  /** The value verbatim — never normalized by the collector. */
  readonly value: string;
  readonly source: 'meta' | 'header';
  /** Absent on the `header` source, which has no element to point at. */
  readonly nodePath?: NodePath;
}

/**
 * A head field whose text may be classified. Closed on purpose: the head is
 * read for the language its text is in, never audited for metadata quality,
 * and an open string would invite the second thing.
 */
export type HeadTextField =
  | 'title'
  | 'meta-description'
  | 'og:title'
  | 'og:description'
  | 'twitter:title'
  | 'twitter:description';

/**
 * One head string, sampled verbatim — the head's analogue of
 * {@link TextNodeSample}, and deliberately **not** one of them.
 *
 * A `<title>` folded into `textNodes` would be one short string among up to a
 * thousand-odd: statistically invisible to the body-dominance rules, and
 * skewing their denominators on the way past. Kept apart, it is adjudicated as
 * its own sample against its own denominator.
 */
export interface HeadTextSample {
  readonly field: HeadTextField;
  readonly text: string;
  readonly nodePath: NodePath;
}

/**
 * The document head's language surface: what it *declares* the language to be,
 * and what its own text is written in.
 *
 * Added in `schemaVersion` 2. Absent means "this collector did not look",
 * which is not the same as an empty head and must never read as `pass`.
 */
export interface HeadEvidence {
  readonly declarations: readonly HeadLanguageDeclaration[];
  readonly texts: readonly HeadTextSample[];
}

/**
 * How much of a page's body text the collector actually looked at.
 *
 * A collector caps how many text nodes it samples, so `textNodes` is a floor,
 * not a census. Without these counts nothing downstream can tell a 1500-node
 * page from a truncated 4000-node one, and every "N of M text nodes"
 * denominator quotes the cap as if it were the page — understating M and so
 * **inflating** the share the finding publishes.
 *
 * Added in `schemaVersion` 3.
 */
export interface TextSampling {
  /** Eligible text nodes the walker saw, cap or no cap. The honest `M`. */
  readonly examined: number;
  /** How many of them reached {@link DocumentEvidence.textNodes}. */
  readonly sampled: number;
  /**
   * The ceiling that bit, set **only** when the sample was truncated. Its
   * presence — not a comparison of the two counts — is how a rule asks "may I
   * still compare these pages by volume?".
   */
  readonly cappedAt?: number;
}

/** The structural digest of one document. Never the document. */
export interface DocumentEvidence {
  /**
   * `<html lang>` verbatim, or `null` when the attribute is absent. An empty
   * string means the attribute is present and empty — a different defect.
   */
  readonly htmlLang: string | null;
  /** Every *other* element carrying `lang`. Excludes `<html>` by construction. */
  readonly langAttributes: readonly LangAttribute[];
  readonly alternates: readonly AlternateLink[];
  readonly picker: PickerEvidence | null;
  readonly links: readonly LinkTarget[];
  /**
   * Body text only. The walker starts at `<body>`, so head strings are
   * structurally absent — see {@link HeadTextSample} for why that separation is
   * load-bearing rather than incidental.
   */
  readonly textNodes: readonly TextNodeSample[];
  /**
   * What {@link textNodes} is a sample *of*. Optional: absent on `schemaVersion`
   * 1 and 2 bundles. See {@link TextSampling}.
   */
  readonly textSampling?: TextSampling;
  /** Optional: absent on `schemaVersion` 1 bundles. See {@link HeadEvidence}. */
  readonly head?: HeadEvidence;
}

/** One page in the audited set. */
export interface PageEvidence {
  readonly id: string;
  /** Present on network evidence. */
  readonly url?: string;
  /** Present on filesystem evidence, relative to `FilesystemSource.root`. */
  readonly path?: string;
  readonly reach: PageReach;
  /** `true` when a rendered tier (a live DOM) produced this digest. */
  readonly rendered: boolean;
  readonly document: DocumentEvidence;
}

/**
 * Opt-in heavyweight payload. Carries **no content field on purpose**: rules
 * may cite an attachment, and structurally cannot read one.
 */
export interface Attachment {
  readonly id: string;
  readonly kind: 'response-body' | 'screenshot';
  readonly mediaType: string;
  readonly byteLength: number;
  readonly sha256: string;
  /** Screenshots only — the layout pass the regions were measured in. */
  readonly viewport?: ScreenshotViewport;
}

/** The geometry a screenshot's finding regions are measured against. */
export interface ScreenshotViewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly fullPageHeight: number;
  /** Set when a height cap was applied during capture. */
  readonly cappedAt?: number;
}

/** A rect in CSS pixels, document origin. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The complete, serializable record one audit run produced. */
export interface Evidence {
  readonly schemaVersion: number;
  readonly source: EvidenceSource;
  /** ISO 8601, from the collector's clock. */
  readonly collectedAt: string;
  readonly collector: CollectorStamp;
  readonly pages: readonly PageEvidence[];
  readonly attachments?: readonly Attachment[];
}

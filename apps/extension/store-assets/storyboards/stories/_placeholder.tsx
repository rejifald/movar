/**
 * TODO placeholder for the four `English` story exports in PR1. Replaced
 * in PR2 with per-scene English backdrop components (see
 * `store-assets/STORYBOOK-PIPELINE-PLAN.md` §6). The capture script
 * skips these via the `skip-capture` story tag — the placeholder exists
 * so the story file structure is already set up when the PR2 design work
 * lands.
 */
export function EnglishBackdropPlaceholder({ scene }: { scene: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fffaf0',
        color: '#7c2d12',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        padding: 64,
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            margin: 0,
            color: '#a3370c',
          }}
        >
          PR2 — English backdrop pending
        </p>
        <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: '12px 0 16px' }}>{scene}</h1>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          The English backdrop for this scene lands in PR2 of the marketplace screenshot pipeline.
          PR1 ships the UK-only screenshots and the capture pipeline; this story is tagged{' '}
          <code>skip-capture</code> so the capture script does not emit a half-finished PNG.
        </p>
      </div>
    </div>
  );
}

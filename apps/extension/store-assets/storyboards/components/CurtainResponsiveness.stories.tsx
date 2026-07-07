import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import type { PageMode } from '@movar/page-mode/types';

import { attachCurtain, defaultHiddenIcon } from '../../../src/lib/curtain';
import type { ActionContext, CurtainOptions } from '../../../src/lib/curtain';

/**
 * Component showcase for the "conceal curtain" overlay's RESPONSIVE
 * collapse — `attachCurtain`'s cover-mode pill (`src/lib/curtain.ts`) sits
 * inside a CSS size container (`movar-cover`), so as its target's box
 * shrinks the vertical card folds into a horizontal bar, then sheds its
 * secondary action, then its title, leaving just the eye icon (plus, space
 * permitting, the primary action) at the smallest sizes. See the
 * `@container movar-cover` rules in curtain.ts for the exact breakpoints
 * this showcase drives through.
 *
 * `attachCurtain` is a vanilla-DOM API — it mutates `target`'s children in
 * place and hands back a `{ detach() }` handle — so it can't be rendered as
 * a React child. Every demo below follows the same imperative pattern
 * instead: a `useEffect` builds a plain target (a sized `<div>` for the
 * card tiers, an inline `<span>` for the inline-target demo) with
 * placeholder content, attaches a real curtain to it, and detaches + clears
 * the container on cleanup. Nothing about the collapse is mocked — it's the
 * production CSS reacting to a target sized by the story.
 *
 * Lives under `Components/*` (not `Marketplace|Marketing|Promo/*`), so the
 * screenshot capture pipeline ignores it — this is a dev/review surface, not
 * a shipped asset.
 */

/** Ghost action's onClick — the demo has nothing for "Hide all" to do. Named
 *  + hoisted (rather than an inline arrow) so it reads like the placeholder
 *  handlers in StatusHeader.stories.tsx. */
function noop(): void {
  // stories don't need the secondary action to do anything
}

/** Primary action's onClick — the one bit of real interactivity these demos
 *  have: clicking "Показати" actually detaches the curtain. */
function handleShow(ctx: ActionContext): void {
  ctx.detach();
}

/** Fresh options every call — `icon` must be a new SVG node per
 *  `attachCurtain` call (see `defaultHiddenIcon`'s doc comment in
 *  curtain.ts): a DOM node lives under one parent at a time, so sharing a
 *  single options object across the gallery's several simultaneous curtains
 *  would silently steal the icon out of whichever curtain mounted it first. */
function buildCurtainOptions(colorScheme: PageMode): CurtainOptions {
  return {
    mode: 'cover',
    icon: defaultHiddenIcon(),
    title: 'Приховано вміст',
    description: 'Російською мовою',
    ariaLabel: 'Приховано вміст російською мовою',
    colorScheme,
    actions: [
      { label: 'Показати', variant: 'primary', onClick: handleShow },
      { label: 'Приховати всі', variant: 'ghost', onClick: noop },
    ],
  };
}

/** Short, plausible Russian shopping/article lines — placeholder content for
 *  the blur to obscure. Only the page content is Russian; the curtain's own
 *  copy (title/description/actions, above) stays Ukrainian, same split as the
 *  real extension: it's the page underneath that's in the blocked language,
 *  not Movar's UI. */
const FILLER_LINES = [
  'Новый смартфон получил тройную камеру и быструю зарядку.',
  'Обзор повербанка: ёмкость 20000 мАч, компактный корпус.',
  'Скидка на наушники действует до конца недели.',
];

const CAPTION_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  marginBottom: 6,
};

/** Monospace px + tier-name caption shared by every demo below. Color is an
 *  explicit inline value (not a design-token class) so it stays legible
 *  against both the light `Gallery` canvas and the dark `GalleryDark` page
 *  background. */
function Caption({ colorScheme, children }: { colorScheme: PageMode; children: ReactNode }) {
  return (
    <div
      className="font-mono uppercase"
      style={{ ...CAPTION_STYLE, color: colorScheme === 'dark' ? '#a1a1aa' : '#6b7280' }}
    >
      {children}
    </div>
  );
}

interface CurtainDemoProps {
  width: number;
  height: number;
  label: string;
  colorScheme?: PageMode;
}

/** Mounts a real `attachCurtain` cover overlay inside a `width`×`height`
 *  target — the size IS the point: it's what the curtain's `movar-cover`
 *  size container measures to pick which collapse tier renders. See the
 *  module doc comment above for why this has to be imperative rather than
 *  plain JSX. */
function CurtainDemo({ width, height, label, colorScheme = 'light' }: CurtainDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // React 18 StrictMode double-invokes effects in dev; clear defensively so
    // a leftover target from a prior mount never stacks with this one.
    container.innerHTML = '';

    const dark = colorScheme === 'dark';
    const target = document.createElement('div');
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    target.style.boxSizing = 'border-box';
    target.style.borderRadius = '10px';
    target.style.border = `1px solid ${dark ? '#3f3f46' : '#d4d4d8'}`;
    target.style.background = dark
      ? 'linear-gradient(135deg, #27272a, #18181b)'
      : 'linear-gradient(135deg, #f4f4f5, #e4e4e7)';
    target.style.padding = '10px';
    target.style.display = 'flex';
    target.style.flexDirection = 'column';
    target.style.gap = '6px';
    target.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    target.style.fontSize = '12px';
    target.style.lineHeight = '1.4';
    target.style.color = dark ? '#d4d4d8' : '#3f3f46';

    for (const line of FILLER_LINES) {
      const row = document.createElement('div');
      row.textContent = line;
      target.append(row);
    }

    container.append(target);
    const handle = attachCurtain(target, buildCurtainOptions(colorScheme));

    return () => {
      handle.detach();
      container.innerHTML = '';
    };
  }, [width, height, colorScheme]);

  return (
    <div>
      <Caption colorScheme={colorScheme}>{`${width}×${height} — ${label}`}</Caption>
      <div ref={containerRef} />
    </div>
  );
}

/** Same imperative pattern as `CurtainDemo`, but the target is an inline
 *  `<span>` mid-sentence rather than a sized block — this is what exercises
 *  `attachCurtain`'s inline → inline-block promotion (see
 *  `promoteInlineTarget` in curtain.ts): a bare inline element has no box for
 *  the cover overlay to fill or clip against, so the curtain forces
 *  `inline-block` on it first. */
function InlineCurtainDemo({ colorScheme = 'light' }: { colorScheme?: PageMode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const dark = colorScheme === 'dark';
    const paragraph = document.createElement('p');
    paragraph.style.margin = '0';
    paragraph.style.maxWidth = '440px';
    paragraph.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    paragraph.style.fontSize = '14px';
    paragraph.style.lineHeight = '1.6';
    paragraph.style.color = dark ? '#d4d4d8' : '#3f3f46';

    paragraph.append(document.createTextNode('Огляд гаджета цитує '));

    const target = document.createElement('span');
    target.textContent = 'відгук з російськомовного форуму';
    target.style.fontWeight = '600';
    paragraph.append(target);

    paragraph.append(document.createTextNode(' — Movar приховує цю вставку прямо в реченні.'));

    container.append(paragraph);
    const handle = attachCurtain(target, buildCurtainOptions(colorScheme));

    return () => {
      handle.detach();
      container.innerHTML = '';
    };
  }, [colorScheme]);

  return (
    <div>
      <Caption colorScheme={colorScheme}>Inline target</Caption>
      <div ref={containerRef} />
    </div>
  );
}

/** The five collapse tiers `Gallery` / `GalleryDark` both render, largest
 *  (full vertical card) to smallest (eye-only). Matches the breakpoints in
 *  curtain.ts's `@container movar-cover` rules. */
const TIERS: { width: number; height: number; label: string }[] = [
  { width: 320, height: 220, label: 'Full card' },
  { width: 720, height: 64, label: 'Bar — both actions' },
  { width: 300, height: 64, label: 'Bar — drop secondary' },
  { width: 170, height: 64, label: 'Icon + Show' },
  { width: 110, height: 60, label: 'Eye only' },
];

/** Every collapse tier stacked vertically, plus one inline-target demo at the
 *  end. Shared by `Gallery` and `GalleryDark` — only `colorScheme` (and the
 *  page background it implies) differs between them. */
function GalleryContent({ colorScheme }: { colorScheme: PageMode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 32,
        padding: 28,
        boxSizing: 'border-box',
        minHeight: '100vh',
        background: colorScheme === 'dark' ? '#18181b' : '#ffffff',
      }}
    >
      {TIERS.map((tier) => (
        <CurtainDemo key={tier.label} {...tier} colorScheme={colorScheme} />
      ))}
      <InlineCurtainDemo colorScheme={colorScheme} />
    </div>
  );
}

const meta = {
  title: 'Components/CurtainResponsiveness',
  component: CurtainDemo,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CurtainDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Meta-level `args` is intentionally omitted (see `CurtainDemo`'s required
 *  props above) so `Resizable`'s `width`/`height` controls infer their type
 *  straight from `CurtainDemoProps`. `Gallery` / `GalleryDark` render their
 *  own multi-demo layout rather than a single sized target, so they have no
 *  natural `args` value of their own — this placeholder is never read; it
 *  exists only to satisfy CSF3 strict typing on a `component` with required
 *  props (same pattern as StatusHeader.stories.tsx / correction-applied). */
const PLACEHOLDER_ARGS: CurtainDemoProps = { width: 320, height: 220, label: 'Full card' };

/** Every collapse tier + the inline-target demo, stacked top to bottom. */
export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  args: PLACEHOLDER_ARGS,
  render: () => <GalleryContent colorScheme="light" />,
};

/** One curtain, live-resizable via the `width`/`height` controls — drag
 *  either slider to watch the pill fold through each tier in real time. */
export const Resizable: Story = {
  parameters: { layout: 'centered' },
  argTypes: {
    width: { control: { type: 'range', min: 90, max: 760, step: 2 } },
    height: { control: { type: 'range', min: 40, max: 260, step: 2 } },
  },
  args: { width: 300, height: 64, label: 'Resize me' },
  render: (args) => <CurtainDemo {...args} />,
};

/** Same tiers as `Gallery`, dark skin — `colorScheme: 'dark'` on every
 *  curtain plus a dark page background so the dark tokens (`DARK_TOKENS` in
 *  curtain.ts) actually read against something instead of a white canvas. */
export const GalleryDark: Story = {
  parameters: { layout: 'fullscreen' },
  args: PLACEHOLDER_ARGS,
  render: () => <GalleryContent colorScheme="dark" />,
};

import type { JSX } from 'react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import type { ConcealMode } from '@movar/settings';
import type { UiLanguage } from '@movar/settings';

import { I18nProvider } from '../../../src/lib/i18n';
import { ConcealModeField } from '../../../src/components/ConcealModeField';

/**
 * The popup/options affordance for choosing how filtered content is concealed —
 * curtain vs. hide — with a small inline preview of each outcome (a blurred row
 * vs. a removed one) so the difference reads at a glance.
 *
 * This is the real `ConcealModeField` the popup renders under the "Filter
 * blocked-language content" toggle, framed at the popup's content width.
 *
 * Lives under `Components/*` so the screenshot-capture pipeline ignores it.
 */
interface DemoProps {
  initial: ConcealMode;
  locale: UiLanguage;
}

function Demo({ initial, locale }: Readonly<DemoProps>): JSX.Element {
  const [value, setValue] = useState<ConcealMode>(initial);
  return (
    <I18nProvider uiLanguage={locale}>
      <div className="bg-surface text-ink-strong border-border w-[324px] rounded-xl border p-[18px] font-sans">
        <ConcealModeField value={value} onChange={setValue} />
      </div>
    </I18nProvider>
  );
}

const meta = {
  title: 'Components/ConcealModeField',
  component: ConcealModeField,
  parameters: { layout: 'centered' },
  // Placeholder args — every story drives its real props via `render` (the
  // field is controlled), so these never reach the screen; they exist to
  // satisfy CSF strict typing on a `component` with required props.
  args: {
    value: 'curtain',
    onChange: () => {
      // Placeholder only; each story render supplies the controlled handler.
    },
  },
} satisfies Meta<typeof ConcealModeField>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Curtain selected — its preview shows the blocked row blurred behind a marker;
 *  the hide option shows the same row removed. Click to switch. */
export const CurtainSelected: Story = { render: () => <Demo initial="curtain" locale="en" /> };

/** Hide selected. */
export const HideSelected: Story = { render: () => <Demo initial="hide" locale="en" /> };

/** Ukrainian copy — parallel action labels, same previews. */
export const Ukrainian: Story = { render: () => <Demo initial="curtain" locale="uk" /> };

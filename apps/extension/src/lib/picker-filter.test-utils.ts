import { filterPickers as filterPickersWithPresenter } from './picker-filter';
import { testContentPresenter } from './dom.test-utils';

export function filterWithTestPresenter(
  pickers: Parameters<typeof filterPickersWithPresenter>[0],
  keep: Parameters<typeof filterPickersWithPresenter>[1],
  options?: Parameters<typeof filterPickersWithPresenter>[2],
): ReturnType<typeof filterPickersWithPresenter> {
  return filterPickersWithPresenter(pickers, keep, options, testContentPresenter);
}

export function describeNodes(container: HTMLElement): string[] {
  return [...container.childNodes].map((n) => {
    if (n.nodeType === Node.TEXT_NODE) return `text:${n.nodeValue ?? ''}`;
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      const kind = el.dataset['movarKind'] ?? '';
      const hidden = el.hasAttribute('data-movar-hidden') ? '[hidden]' : '';
      return `el:${el.tagName.toLowerCase()}${kind ? `[${kind}]` : ''}${hidden}:${el.textContent}`;
    }
    return 'other';
  });
}

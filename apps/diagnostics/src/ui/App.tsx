import { useEffect, useState } from 'react';
import { getCurrent, highlightNode, refreshNow, subscribe } from '../lib/page-diagnostics';
import { Widget } from './Widget';
import type { PageDiagnostics } from '../types';

/**
 * Connects the in-page widget to the page-diagnostics store. Both live in the
 * content script's world, so this reads the snapshot with a direct call and
 * re-reads it whenever the content script rebuilds one (the `subscribe` hook) —
 * no background, no relay, no messaging.
 */
export function App() {
  const [snapshot, setSnapshot] = useState<PageDiagnostics>(() => getCurrent());

  useEffect(() => {
    const update = (): void => {
      setSnapshot(getCurrent());
    };
    subscribe(update);
    update();
    return () => {
      subscribe(null);
    };
  }, []);

  return <Widget snapshot={snapshot} onHighlight={highlightNode} onRefresh={refreshNow} />;
}

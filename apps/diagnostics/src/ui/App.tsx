import { useSyncExternalStore } from 'react';
import { getCurrent, highlightNode, refreshNow, subscribe } from '../lib/page-diagnostics';
import { Widget } from './Widget';

/**
 * Connects the in-page widget to the page-diagnostics store. Both live in the
 * content script's world, so this reads the snapshot with a direct call and
 * re-reads it whenever the content script rebuilds one (the `subscribe` hook) —
 * no background, no relay, no messaging. `useSyncExternalStore` seeds from
 * `getCurrent()` and re-reads on every rebuild without a set-in-effect.
 */
export function App() {
  const snapshot = useSyncExternalStore((onStoreChange) => {
    subscribe(onStoreChange);
    return () => {
      subscribe(null);
    };
  }, getCurrent);

  return <Widget snapshot={snapshot} onHighlight={highlightNode} onRefresh={refreshNow} />;
}

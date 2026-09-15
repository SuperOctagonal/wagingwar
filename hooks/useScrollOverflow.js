'use client';
import { useState, useRef, useEffect } from 'react';

// Shared by every horizontally-scrollable table in the app (OddsTable,
// Movers, Value Bets, Field tab) -- measures actual overflow so a
// "Scroll for more" hint only appears when the table is genuinely wider
// than its container, rather than showing/hiding by guesswork. Pair the
// returned scrollRef with the .ww-scroll-x class (app/globals.css) on the
// scrolling container, and ScrollHint (components/ScrollHint.js) for the
// hint itself.
//
// deps: extra values (besides the container's own size, already tracked
// via ResizeObserver) that should re-run the overflow check -- e.g. the
// row/column data that changes the table's content width without
// necessarily changing the container element itself.
export function useScrollOverflow(deps = []) {
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { scrollRef, hasOverflow };
}

// Wrap an async function so concurrent calls share one in-progress run:
// while a call is pending, further calls get the same promise; once it
// settles (success or failure), the next call starts a fresh run. Nothing
// is cached beyond the in-flight promise.
//
// Plain .mjs (no Next-specific imports) so node --test can run it directly
// (tests/singleFlight.test.mjs).
export function singleFlight(fn) {
  let pending = null;
  return (...args) => {
    if (!pending) {
      pending = Promise.resolve()
        .then(() => fn(...args))
        .finally(() => { pending = null; });
    }
    return pending;
  };
}

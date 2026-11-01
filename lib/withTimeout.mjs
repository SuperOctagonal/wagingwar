// Reject if `promise` hasn't settled within `ms`, with a plain-words error
// naming the source ("Clerk did not respond within 20s"). The underlying
// request isn't cancelled -- the caller just stops waiting for it -- so use
// this where a slow source should degrade one panel, not hang the page.
//
// Plain .mjs (no Next-specific imports) so node --test can run it directly
// (tests/withTimeout.test.mjs).
export class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} did not respond within ${Math.round(ms / 1000)}s`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

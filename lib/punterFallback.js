// Deterministic anonymous fallback for a user with no Clerk username set —
// same clerk_id always produces the same "PunterNNNN", whether computed by
// the user themselves (client-side, e.g. TopNav) or by someone else's
// browser resolving that user's name via the display-names API route. Pure
// function, no dependencies, so it works identically on both sides.
export function punterFallback(clerkId) {
  let hash = 0;
  const s = String(clerkId || '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0; // unsigned 32-bit
  }
  return `Punter${1000 + (hash % 9000)}`; // stable 4-digit number, 1000-9999
}

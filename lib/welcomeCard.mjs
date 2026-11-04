// Who sees the /races welcome card (components/WelcomeCard.js). State lives
// in Clerk unsafeMetadata.welcomeCard so it follows the user across devices:
//   { dismissals: number, lastDismissedAt: ISO string, closedAt: ISO string }
// Pure, no imports: tests/welcomeCard.test.mjs covers it.

export const NEW_USER_MS = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// - Never after a username is saved from the card (closedAt).
// - Not dismissed yet: users with no username, and anyone who signed up in
//   the last 24 hours.
// - Dismissed once: one more time, 7+ days later, only if still no username.
// - Dismissed twice: never.
export function shouldShowWelcome({ hasUsername, createdAt, state, now }) {
  const s = state && typeof state === 'object' ? state : {};
  if (s.closedAt) return false;
  const dismissals = Number(s.dismissals) || 0;
  if (dismissals === 0) {
    const created = createdAt ? new Date(createdAt).getTime() : NaN;
    return !hasUsername || (Number.isFinite(created) && now - created < NEW_USER_MS);
  }
  if (dismissals === 1) {
    const last = Date.parse(s.lastDismissedAt);
    return !hasUsername && Number.isFinite(last) && now - last >= REMIND_AFTER_MS;
  }
  return false;
}

// Next state after "Not now".
export function dismissedState(state, now) {
  const s = state && typeof state === 'object' ? state : {};
  return { ...s, dismissals: (Number(s.dismissals) || 0) + 1, lastDismissedAt: new Date(now).toISOString() };
}

// Next state after a username is saved from the card: closed for good.
export function closedState(state, now) {
  const s = state && typeof state === 'object' ? state : {};
  return { ...s, closedAt: new Date(now).toISOString() };
}

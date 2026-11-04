// The username rules we know for certain (4-64 characters, not numbers
// only), checked before calling Clerk so the user gets a clear inline error
// without a round trip. Characters are left to Clerk, so nothing production
// Clerk allows is blocked here: anything it rejects (taken, a character it
// doesn't allow) comes back through usernameErrorMessage in Clerk's words.
// Pure, no imports: used by hooks/useUsernameSave.js and
// tests/usernameRules.test.mjs.

export const USERNAME_MIN = 4;
export const USERNAME_MAX = 64;

// Error text for a username, or null when it passes. Trims first.
export function validateUsername(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Enter a username.';
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) return `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.`;
  if (/^[0-9]+$/.test(v)) return "Username can't be numbers only.";
  return null;
}

// Clerk error codes we word ourselves (the same wording as validateUsername
// where they overlap); any other Clerk error shows Clerk's own message.
const CLERK_CODES = {
  form_identifier_exists: 'That username is taken. Try another.',
  form_username_invalid_length: `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.`,
  form_username_needs_non_number_char: "Username can't be numbers only.",
};

// Inline message for an error thrown by Clerk's user.update({ username }).
export function usernameErrorMessage(err) {
  const e = err?.errors?.[0];
  return CLERK_CODES[e?.code] || e?.longMessage || e?.message || 'Couldn\'t save that username. Try again.';
}

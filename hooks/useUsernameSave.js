'use client';

import { useState } from 'react';
import { useUser, useReverification } from '@clerk/nextjs';
import { isReverificationCancelledError } from '@clerk/nextjs/errors';
import { validateUsername, usernameErrorMessage } from '@/lib/usernameRules.mjs';

// Saves the signed-in user's Clerk username: checks lib/usernameRules.mjs
// first, then user.update wrapped in useReverification (Clerk shows its own
// step-up modal when needed and retries), same call as /settings. The nav
// and Community read user.username from useUser, so they update as soon as
// this resolves.
//
// Returns { save(value) -> Promise<boolean>, saving, error, clearError }.
// save resolves true when saved; false with `error` set (or quietly, if the
// user closed Clerk's reverification modal). Never throws.
export default function useUsernameSave() {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const update = useReverification(username => user.update({ username }));

  async function save(value) {
    if (!user) return false;
    const invalid = validateUsername(value);
    if (invalid) { setError(invalid); return false; }
    setSaving(true);
    setError(null);
    try {
      await update(String(value).trim());
      return true;
    } catch (err) {
      if (!isReverificationCancelledError(err)) setError(usernameErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { save, saving, error, clearError: () => setError(null) };
}

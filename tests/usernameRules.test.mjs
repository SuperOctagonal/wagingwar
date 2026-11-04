// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUsername, usernameErrorMessage } from '../lib/usernameRules.mjs';

test('valid usernames pass (trimmed)', () => {
  for (const v of ['punt', 'Punter_Pete', 'ab_1', 'x'.repeat(64), '  good_name  ', '1abc', '____']) assert.equal(validateUsername(v), null, v);
});

test('length 4-64', () => {
  assert.match(validateUsername('abc'), /4-64 characters/);
  assert.match(validateUsername('x'.repeat(65)), /4-64 characters/);
  assert.match(validateUsername('   abc  '), /4-64 characters/);
  assert.equal(validateUsername(''), 'Enter a username.');
  assert.equal(validateUsername('   '), 'Enter a username.');
  assert.equal(validateUsername(null), 'Enter a username.');
});

test('characters are left to Clerk: nothing blocked on the client', () => {
  for (const v of ['joé_bloggs', 'punter pete', 'pete.smith', 'pete-smith', 'pete@x', 'üser1', 'punter😀']) assert.equal(validateUsername(v), null, v);
});

test('not numbers only', () => {
  assert.equal(validateUsername('12345'), "Username can't be numbers only.");
  assert.equal(validateUsername('  98765 '), "Username can't be numbers only.");
  assert.equal(validateUsername('1234a'), null);
});

test('Clerk errors map to clear messages', () => {
  assert.equal(usernameErrorMessage({ errors: [{ code: 'form_identifier_exists', message: 'That username is taken. Please try another.' }] }), 'That username is taken. Try another.');
  assert.equal(usernameErrorMessage({ errors: [{ code: 'form_username_needs_non_number_char' }] }), "Username can't be numbers only.");
  // A character Clerk doesn't allow: Clerk's own words, not ours.
  assert.equal(usernameErrorMessage({ errors: [{ code: 'form_username_invalid_character', message: 'Invalid', long_message: 'x', longMessage: 'Your username contains invalid characters. Please use only letters, numbers, and underscores.' }] }), 'Your username contains invalid characters. Please use only letters, numbers, and underscores.');
  assert.equal(usernameErrorMessage({ errors: [{ code: 'something_new', longMessage: 'Clerk says no.' }] }), 'Clerk says no.');
  assert.match(usernameErrorMessage(new Error('')), /Couldn't save/);
  assert.match(usernameErrorMessage(undefined), /Couldn't save/);
});

/**
 * Username rules, shared by sign-up, profile edits and the backfill.
 *
 * Stored lowercase: a username is an identifier people type from memory,
 * so "Tester" and "tester" must never be two different accounts.
 */

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

// Words that would be confusing as a handle, or that read as the system
// talking rather than a person.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'api',
  'me', 'you', 'everyone', 'anyone', 'null', 'undefined', 'none',
  'scriptdocs', 'owner', 'editor', 'viewer', 'commenter', 'guest',
]);

export function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Returns an error message, or null when the username is acceptable. */
export function usernameProblem(value) {
  const username = normalizeUsername(value);

  if (!username) return 'Choose a username.';
  if (username.length < 3) return 'Usernames need at least 3 characters.';
  if (username.length > 30) return 'Usernames can be at most 30 characters.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Usernames can use letters, numbers, dots, dashes and underscores, and must start with a letter or number.';
  }
  if (RESERVED.has(username)) return 'That username is reserved. Pick another.';
  return null;
}

/** Turn an email local part into a plausible starting handle. */
export function suggestFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  const base = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 24);
  return base.length >= 3 ? base : '';
}

/** An email, or a username? Used to interpret whatever is typed at sign-in. */
export function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@');
}

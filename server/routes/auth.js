import express from 'express';
import {
  clearSessionCookie,
  hashPassword,
  publicUser,
  requireAuth,
  setSessionCookie,
  signSession,
  userFromCookies,
  verifyPassword,
} from '../auth.js';
import { one } from '../db.js';
import {
  looksLikeEmail,
  normalizeUsername,
  suggestFromEmail,
  usernameProblem,
} from '../usernames.js';

const router = express.Router();

const PALETTE = [
  '#1a73e8', '#d93025', '#188038', '#f29900',
  '#9334e6', '#007b83', '#c5221f', '#3f51b5',
];

function pickColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// --- naive in-memory throttle on credential guessing -------------------
const attempts = new Map(); // key -> { count, resetAt }
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function throttle(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { ok: false, retryInSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true };
}

function clearThrottle(key) {
  attempts.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.resetAt < now) attempts.delete(key);
}, WINDOW_MS).unref();

// -----------------------------------------------------------------------

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, username, display_name: displayName } = req.body ?? {};

    if (!validEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Use a password of at least 6 characters.' });
    }

    const clean = email.trim();

    // A username is optional over the wire: fall back to the email local
    // part so older clients and scripted signups still work.
    const handle = normalizeUsername(username) || suggestFromEmail(clean);
    const problem = usernameProblem(handle);
    if (problem) return res.status(400).json({ error: problem });

    const clash = await one(
      `select
         exists (select 1 from users where lower(email) = lower($1)) as email_taken,
         exists (select 1 from users where lower(username) = $2)     as username_taken`,
      [clean, handle]
    );
    if (clash.email_taken) {
      return res.status(409).json({ error: 'An account already uses that email. Try signing in.' });
    }
    if (clash.username_taken) {
      return res.status(409).json({ error: 'That username is taken. Pick another.' });
    }

    const name = (typeof displayName === 'string' && displayName.trim()) || handle;

    const user = await one(
      `insert into users (email, username, password_hash, display_name, color)
       values ($1, $2, $3, $4, $5)
       returning id, email, username, display_name, color`,
      [clean, handle, await hashPassword(password), name.slice(0, 80), pickColor()]
    );

    setSessionCookie(res, signSession(user.id));
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    // Unique index race between the check above and the insert.
    if (err.code === '23505') {
      const taken = /username/.test(err.constraint || '') ? 'username' : 'email';
      return res.status(409).json({
        error:
          taken === 'username'
            ? 'That username is taken. Pick another.'
            : 'An account already uses that email. Try signing in.',
      });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'That username contains characters that are not allowed.' });
    }
    next(err);
  }
});

router.post('/signin', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    // `identifier` is either an email or a username. `email` is still
    // accepted so older clients keep working.
    const identifier = typeof body.identifier === 'string' ? body.identifier : body.email;
    const { password } = body;

    if (typeof identifier !== 'string' || !identifier.trim() || typeof password !== 'string') {
      return res.status(400).json({ error: 'Enter your username or email, and your password.' });
    }

    const typed = identifier.trim();
    const key = `${req.ip}:${typed.toLowerCase()}`;
    const gate = throttle(key);
    if (!gate.ok) {
      return res.status(429).json({
        error: `Too many attempts. Try again in about ${Math.ceil(gate.retryInSec / 60)} minute(s).`,
      });
    }

    // Match on whichever the person typed. An address cannot be a valid
    // username (no "@" is allowed), so the two can never collide.
    const row = await one(
      `select id, email, username, display_name, color, password_hash
       from users
       where lower(email) = lower($1) or lower(username) = lower($1)`,
      [typed]
    );

    // Same message either way, so the response does not reveal which
    // emails or usernames have accounts.
    const ok = row && (await verifyPassword(password, row.password_hash));
    if (!ok) {
      return res.status(401).json({
        error: looksLikeEmail(typed)
          ? 'That email and password do not match.'
          : 'That username and password do not match.',
      });
    }

    clearThrottle(key);
    setSessionCookie(res, signSession(row.id));
    res.json({ user: publicUser(row) });
  } catch (err) {
    next(err);
  }
});

router.post('/signout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await userFromCookies(req.cookies);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { display_name: displayName, color, username } = req.body ?? {};
    const patch = {};

    if (typeof displayName === 'string' && displayName.trim()) {
      patch.display_name = displayName.trim().slice(0, 80);
    }
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      patch.color = color;
    }
    if (username !== undefined) {
      const handle = normalizeUsername(username);
      if (handle !== req.user.username) {
        const problem = usernameProblem(handle);
        if (problem) return res.status(400).json({ error: problem });

        const taken = await one(
          'select 1 from users where lower(username) = $1 and id <> $2',
          [handle, req.user.id]
        );
        if (taken) return res.status(409).json({ error: 'That username is taken. Pick another.' });
        patch.username = handle;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const user = await one(
      `update users set display_name = coalesce($2, display_name),
                        color = coalesce($3, color),
                        username = coalesce($4, username)
       where id = $1
       returning id, email, username, display_name, color`,
      [req.user.id, patch.display_name ?? null, patch.color ?? null, patch.username ?? null]
    );
    res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That username is taken. Pick another.' });
    }
    next(err);
  }
});

export default router;

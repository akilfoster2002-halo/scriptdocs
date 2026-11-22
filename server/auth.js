import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one } from './db.js';

const scrypt = promisify(crypto.scrypt);

// scrypt parameters. N=2^15 keeps a hash around 100ms on modest hardware,
// which is a reasonable brake on offline guessing without stalling logins.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

export const SESSION_COOKIE = 'sd_session';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  });
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(N) * Number(r) * 2,
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function signSession(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`,
  });
}

export function readSessionToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return payload.sub || null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

const PUBLIC_USER_COLUMNS = 'id, email, display_name, color, created_at';

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    color: row.color,
  };
}

/** Resolve the signed-in user from the session cookie. */
export async function userFromCookies(cookies) {
  const token = cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const userId = readSessionToken(token);
  if (!userId) return null;
  return one(`select ${PUBLIC_USER_COLUMNS} from users where id = $1`, [userId]);
}

/** Express guard: 401 unless a valid session cookie is present. */
export async function requireAuth(req, res, next) {
  try {
    const user = await userFromCookies(req.cookies);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Reject cross-site state changes. The session cookie is SameSite=Lax, so a
 * cross-origin POST would not carry it anyway; this closes the gap for
 * same-site subdomains and makes the intent explicit.
 */
export function checkOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // non-browser client (curl, tests)

  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Bad origin.' });
  }

  if (host !== req.get('host')) {
    return res.status(403).json({ error: 'Cross-origin request refused.' });
  }
  next();
}

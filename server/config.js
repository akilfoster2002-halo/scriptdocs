import 'dotenv/config';
import crypto from 'node:crypto';

function required(name, hint) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `\n[scriptdocs] Missing required environment variable: ${name}` +
        (hint ? `\n  ${hint}` : '') +
        `\nCopy .env.example to .env and fill it in (see README.md).\n`
    );
    process.exit(1);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

// A missing secret in development gets an ephemeral one so the app still
// runs; in production it is a hard error, since a random secret per boot
// would sign everyone out on every deploy.
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    required('JWT_SECRET', 'Generate one with: openssl rand -hex 32');
  }
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[scriptdocs] JWT_SECRET not set — using a temporary one for this run.');
}

export const config = {
  isProduction,
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL', 'Postgres connection string.'),
  jwtSecret,
  sessionDays: Number(process.env.SESSION_DAYS || 30),

  // How long to wait after the last keystroke before writing the CRDT
  // state to Postgres, and the hard ceiling between writes.
  persistDebounceMs: Number(process.env.PERSIST_DEBOUNCE_MS || 2000),
  persistMaxWaitMs: Number(process.env.PERSIST_MAX_WAIT_MS || 10000),
  roomIdleMs: Number(process.env.ROOM_IDLE_MS || 30000),
};

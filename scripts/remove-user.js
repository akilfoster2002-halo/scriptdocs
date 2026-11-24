/**
 * Remove an account and everything it owns.
 *
 *   npm run user:remove -- someone@example.com [ada ...]
 *
 * Each argument is a username or an email address.
 *
 * Scripts they own are deleted along with their comments and shares;
 * scripts owned by other people keep working, minus this person's access.
 * Needs DATABASE_URL, the same one the server uses.
 */
import 'dotenv/config';
import { pool, one, query } from '../server/db.js';

const targets = process.argv.slice(2).filter(Boolean);

if (targets.length === 0) {
  console.error('Usage: npm run user:remove -- <username or email> [more ...]');
  process.exit(1);
}

let failed = false;

for (const target of targets) {
  const typed = target.trim().replace(/^@/, '');
  try {
    const user = await one(
      `select id, email, username, display_name
       from users
       where lower(email) = lower($1) or lower(username) = lower($1)`,
      [typed]
    );

    if (!user) {
      console.log(`- ${typed}: no such account`);
      continue;
    }

    const owned = await one('select count(*)::int as n from documents where owner_id = $1', [
      user.id,
    ]);

    // Foreign keys cascade from users, so one delete is enough.
    await query('delete from users where id = $1', [user.id]);
    console.log(
      `✓ @${user.username} <${user.email}> removed, along with ${owned.n} script(s) they owned`
    );
  } catch (err) {
    failed = true;
    console.error(`✗ ${typed}: ${err.message}`);
  }
}

await pool.end();
process.exit(failed ? 1 : 0);

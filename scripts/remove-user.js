/**
 * Remove an account and everything it owns.
 *
 *   npm run user:remove -- someone@example.com [more@example.com ...]
 *
 * Scripts they own are deleted along with their comments and shares;
 * scripts owned by other people keep working, minus this person's access.
 * Needs DATABASE_URL, the same one the server uses.
 */
import 'dotenv/config';
import { pool, one, query } from '../server/db.js';

const emails = process.argv.slice(2).filter(Boolean);

if (emails.length === 0) {
  console.error('Usage: npm run user:remove -- <email> [email ...]');
  process.exit(1);
}

let failed = false;

for (const email of emails) {
  try {
    const user = await one(
      'select id, email, display_name from users where lower(email) = lower($1)',
      [email.trim()]
    );

    if (!user) {
      console.log(`- ${email}: no such account`);
      continue;
    }

    const owned = await one('select count(*)::int as n from documents where owner_id = $1', [
      user.id,
    ]);

    // Foreign keys cascade from users, so one delete is enough.
    await query('delete from users where id = $1', [user.id]);
    console.log(
      `✓ ${user.email} (${user.display_name}) removed, along with ${owned.n} script(s) they owned`
    );
  } catch (err) {
    failed = true;
    console.error(`✗ ${email}: ${err.message}`);
  }
}

await pool.end();
process.exit(failed ? 1 : 0);

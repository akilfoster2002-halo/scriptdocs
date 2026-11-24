-- Give every account a username, usable for signing in and for sharing.

alter table users add column if not exists username text;

-- Backfill from the email local part. Looping keeps this correct when two
-- addresses share a local part (ada@a.com and ada@b.com): the older account
-- keeps the bare handle and later ones get a numeric suffix. The loop checks
-- against rows written earlier in this same migration, so it cannot produce
-- a duplicate.
do $$
declare
  rec       record;
  base      text;
  candidate text;
  n         int;
begin
  for rec in
    select id, email from users where username is null order by created_at, id
  loop
    base := regexp_replace(lower(split_part(rec.email, '@', 1)), '[^a-z0-9._-]', '', 'g');
    base := regexp_replace(base, '^[^a-z0-9]+', '');
    base := left(base, 24);

    -- An address like "!!!@example.com" sanitises away to nothing.
    if length(base) < 3 then
      base := 'user' || substr(replace(rec.id::text, '-', ''), 1, 8);
    end if;

    candidate := base;
    n := 1;
    while exists (select 1 from users where lower(username) = candidate) loop
      n := n + 1;
      candidate := left(base, 30 - length(n::text)) || n::text;
    end loop;

    update users set username = candidate where id = rec.id;
  end loop;
end $$;

alter table users alter column username set not null;

create unique index if not exists users_username_lower_idx on users (lower(username));

-- Stored lowercase so comparisons never depend on how it was typed.
alter table users drop constraint if exists users_username_format;
alter table users add constraint users_username_format
  check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

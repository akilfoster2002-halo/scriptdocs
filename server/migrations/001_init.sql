-- ScriptDocs schema. Authorization lives in the API layer (server/access.js);
-- this file is only concerned with shape and integrity.

create extension if not exists "pgcrypto";

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  display_name  text not null default '',
  color         text not null default '#1a73e8',
  created_at    timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx on users (lower(email));

create table if not exists documents (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references users(id) on delete cascade,
  title          text not null default 'Untitled script',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_edited_by uuid references users(id) on delete set null
);

create index if not exists documents_owner_idx on documents (owner_id, updated_at desc);

create table if not exists document_shares (
  document_id uuid not null references documents(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null check (role in ('viewer', 'commenter', 'editor')),
  invited_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index if not exists document_shares_user_idx on document_shares (user_id);

-- The Yjs document, stored as one binary snapshot per script.
create table if not exists document_state (
  document_id uuid primary key references documents(id) on delete cascade,
  ydoc        bytea not null,
  updated_at  timestamptz not null default now()
);

create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  author_id   uuid not null references users(id) on delete cascade,
  body        text not null,
  quote       text not null default '',
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists comments_document_idx on comments (document_id, created_at);

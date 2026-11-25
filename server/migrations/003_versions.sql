-- Edit history: a point-in-time copy of a script that can be read back
-- or restored.

create table if not exists document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  -- A full CRDT state, not a diff. Diffs would be smaller, but reading
  -- version N would mean replaying every version before it, and a
  -- history you cannot open quickly is not much of a history.
  ydoc         bytea not null,
  -- Fingerprint of the rendered content, so an editing session that
  -- changed nothing does not produce a version.
  content_hash text not null,
  -- Null for automatic snapshots; set when someone names one.
  label        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references users(id) on delete set null,
  -- Everyone who typed during the window this version covers.
  authors      uuid[] not null default '{}',
  bytes        integer not null default 0
);

create index if not exists document_versions_doc_idx
  on document_versions (document_id, created_at desc);

-- Named versions are kept; automatic ones are pruned to the most recent
-- few dozen, so history cannot grow without bound.
create index if not exists document_versions_auto_idx
  on document_versions (document_id, created_at desc)
  where label is null;

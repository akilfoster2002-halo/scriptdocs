# ScriptDocs

Real-time collaborative script writing, in the spirit of Google Docs. Several
people open the same script and type at once; everyone sees every keystroke,
each with their own labelled caret, and nobody's work overwrites anybody
else's.

<!-- Replace with your deployed URL once the service is live. -->

## What it does

- **Simultaneous editing.** Conflict-free merging via [Yjs](https://yjs.dev)
  CRDTs over a websocket, so two people can edit the same sentence without
  clobbering each other — no "last write wins".
- **Live presence.** Collaborator avatars in the header and named carets in
  the text, updating as people move.
- **Sharing with three permission levels.** Invite anyone with a ScriptDocs
  account by email as a **Viewer**, **Commenter**, or **Editor**. Permissions
  are enforced on the server, including on the websocket: a viewer's edits are
  refused even if their browser is modified to send them.
- **Comments.** Select text, leave a comment, resolve or reopen the thread.
- **A familiar editor.** Headings, bold/italic/underline/strikethrough,
  text colour and highlight, alignment, lists, quotes, code blocks, links,
  and a live word count — on a page that looks like a page.
- **Autosave.** Edits are debounced to Postgres, flushed when the last
  collaborator disconnects, and again on shutdown.

## How it fits together

```
client/            React + Vite single-page app
  src/pages/       Login, DocList (your scripts), Editor
  src/components/  Toolbar, ShareDialog, CommentsPanel, Avatar, UserMenu
  src/lib/         API client, auth context, Yjs + events hooks

server/
  index.js         Express app, static hosting, websocket routing
  collab.js        Yjs sync protocol, authorization, Postgres persistence
  events.js        JSON notification channel (titles, shares, comments)
  auth.js          scrypt password hashing, signed session cookies
  access.js        The single source of truth for permissions
  routes/          /api/auth and /api/documents
  migrations/      Plain SQL, applied automatically on boot
```

Two websockets do two different jobs. `/collab` carries document content in
the Yjs binary protocol. `/events` carries everything *around* the document —
a renamed title, a new comment, a changed permission — as JSON, so the UI
stays live without polling.

### Why the editor needs a server at all

The CRDT means clients could in principle merge peer-to-peer. The server
exists to decide **who is allowed to connect**, and to keep the document
somewhere durable. It holds each open script in memory, broadcasts updates to
the other participants, and writes a binary snapshot to Postgres a couple of
seconds after the typing stops.

## Security notes

- Passwords are hashed with **scrypt** (N=32768), with a per-user random salt
  and a timing-safe comparison.
- The session is a signed JWT in an **httpOnly, SameSite=Lax** cookie, so it
  is not readable by JavaScript and is not sent on cross-site requests. No
  token is ever placed in a URL, including on the websocket handshake.
- Mutating requests additionally require a same-origin `Origin` header.
- Every document route resolves the caller's role through `access.js` before
  doing anything; the websocket does the same on upgrade and then enforces
  read-only mode per message.
- Sign-in is throttled per IP and email, and failures return one message for
  both "no such user" and "wrong password", so the API does not confirm which
  emails have accounts.

## Running it locally

You need Node 20+ and a Postgres database.

```bash
git clone https://github.com/akilfoster2002-halo/scriptdocs.git
cd scriptdocs
npm install
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — the *External* connection string from your database's page
  in the Render dashboard (or any other Postgres).
- `JWT_SECRET` — generate one with `openssl rand -hex 32`.

Then start both halves:

```bash
npm run dev
```

The API and websockets run on `http://localhost:3000`; Vite serves the UI on
`http://localhost:5173` and proxies to it. Open the Vite URL.

To run exactly what production runs:

```bash
npm run build && npm start
```

The schema is applied automatically at startup — each file in
`server/migrations/` runs once and is recorded in a `_migrations` table.

### Trying out collaboration

Sign up twice with two different emails (a normal window and a private
window). In the first account create a script, press **Share**, and add the
second account's email as an **Editor**. Open the same script in both windows
and type — you should see both carets and both sets of changes.

## Deploying to Render

The repository includes `render.yaml`, so Render can create the web service
and the database together:

1. Go to **Render → Blueprints → New Blueprint Instance**.
2. Point it at this repository and apply.

`DATABASE_URL` is wired from the database and `JWT_SECRET` is generated, so
there is nothing to paste in. Pushing to `main` redeploys.

Two things to know about the free tier:

- A **free Postgres instance expires 30 days after creation** and is then
  deleted. Upgrade the database before that date if the data matters.
- A **free web service sleeps after inactivity**, so the first request after
  an idle spell takes a few seconds, and open websockets are dropped while it
  sleeps. Clients reconnect automatically.

## Things it deliberately does not do

- **No email delivery.** Sharing works by looking up an existing account, so
  the person you are inviting has to sign up first. There are no invitation
  emails and no password reset — both would need an email provider wired in.
- **No link sharing.** Access is per-account only; a URL on its own grants
  nothing.
- **Comments are not anchored to the text.** A comment stores a snapshot of
  the quoted selection, not a live position, so it will not follow the text as
  the document is rewritten.
- **One server process.** Rooms live in memory, so running more than one
  instance would split collaborators across them. Scaling out would need the
  rooms coordinated through something shared, such as Redis.

# ScriptDocs

Real-time collaborative **screenplay** writing. Several people open the same
script and type at once; everyone sees every keystroke, each with their own
labelled caret, and nobody's work overwrites anybody else's — and what they
type comes out in industry standard format.

<!-- Replace with your deployed URL once the service is live. -->

## What it does

- **Simultaneous editing.** Conflict-free merging via [Yjs](https://yjs.dev)
  CRDTs over a websocket, so two people can edit the same sentence without
  clobbering each other — no "last write wins".
- **Live presence.** Collaborator avatars in the header and named carets in
  the text, updating as people move.
- **Sharing with three permission levels.** Invite anyone with a ScriptDocs
  account by **username or email** as a **Viewer**, **Commenter**, or
  **Editor**. Permissions
  are enforced on the server, including on the websocket: a viewer's edits are
  refused even if their browser is modified to send them.
- **Comments.** Select text, leave a comment, resolve or reopen the thread.
- **Download as PDF, Final Draft or Fountain.** A properly paginated PDF
  with a title page and page numbers, `.fdx` for Final Draft, or `.fountain`
  plain text that Highland, Slugline and WriterDuet all read.

- **Screenplay format, automatically.** Seven elements — Scene Heading,
  Action, Character, Parenthetical, Dialogue, Transition, Shot — each with
  its correct indent, width and casing, on a US Letter page set in 12pt
  Courier Prime. Measured in pages and scenes, not words.
- **Autosave.** Edits are debounced to Postgres, flushed when the last
  collaborator disconnects, and again on shutdown.

## Writing in it

The editor behaves the way script software is expected to, so you can type a
scene without reaching for the mouse.

**Enter moves you to whatever comes next:**

| From | Enter gives you |
|---|---|
| Scene Heading | Action |
| Action | Action |
| Character | Dialogue |
| Parenthetical | Dialogue |
| Dialogue | Action |
| Transition | Scene Heading |

**Tab** cycles the current line through the element types, **Shift+Tab** goes
back, and **⌘1–7** (Ctrl on Windows) picks one directly.

**It formats as you type:**

- A line starting `INT.`, `EXT.`, `EST.` or `I/E` becomes a Scene Heading.
- A line ending `TO:`, or `FADE IN:` / `FADE OUT.`, becomes a Transition.
- A short all-caps line on its own becomes a Character cue — but
  `HE SLAMS THE DOOR SHUT.` stays Action, because it is a sentence and too
  long to be a name. Once a name is established, writing it on its own line
  in any case is enough: type `mary` and it becomes `MARY`. The match has to
  be the whole line, so `mary walks in` stays Action.
- Typing `(` on a fresh line under a cue opens a Parenthetical, brackets
  already closed.
- Scene Headings, Character cues, Transitions and Shots uppercase themselves
  as you type, so the text is correct when it leaves the editor rather than
  only looking correct on screen.

**It completes what you have already written.** Character cues suggest names
already in the script, Scene Headings suggest locations you have established
and then times of day after the dash, and Transitions suggest the standard
set. Arrow keys to choose, Enter or Tab to accept, Escape to dismiss.

**Backspace at the start of a styled line** returns it to Action instead of
merging it into the line above — the usual way out when an element is wrong.

Headings, lists, quotes and code blocks are deliberately absent. A screenplay
has seven elements and nothing else.

## Exporting

**Download** in the editor header offers three formats.

**PDF** is laid out here rather than printed by the browser, so the
pagination follows screenplay rules rather than the rules for a web page:

- 55 lines of body text per US Letter page, 12pt Courier, standard margins.
- A scene heading is never left dangling at the foot of a page with nothing
  under it, and a character cue always keeps at least one line of its speech.
- A speech that crosses a page break carries `(MORE)` at the bottom and
  `CHARACTER (CONT'D)` at the top of the next page.
- A title page from the script's title and its owner's name; page numbers
  from page two, as is conventional.

**Final Draft (`.fdx`)** is the format productions pass around. Each element
maps to the Type string Final Draft matches literally, so a script opens with
its formatting intact rather than as a wall of action.

**Fountain (`.fountain`)** is plain text. Fountain infers element types from
how a line looks, which loses anything that does not follow the convention —
a scene heading not starting `INT.`, a cue that is not uppercase. Where that
would change the script, the forcing characters (`.`, `@`, `>`) are written
so the file round-trips as written rather than as guessed.

The PDF engine is fetched the first time you export one, so nobody who never
exports a PDF downloads it.

## How it fits together

```
client/            React + Vite single-page app
  src/pages/       Login, DocList (your scripts), Editor
  src/components/  Toolbar, ShareDialog, CommentsPanel, Avatar, UserMenu
  src/lib/         API client, auth context, Yjs + events hooks
  src/lib/screenplay*.js   element model, editor node, autocomplete
  src/lib/export/          PDF, Final Draft and Fountain writers

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

## Usernames

Every account has a unique username alongside its email. You can sign in with
either, and share scripts with either.

- 3–30 characters: letters, numbers, dots, dashes and underscores, starting
  with a letter or number.
- Stored and compared in lowercase, so `Ada` and `ada` are the same account.
- `@` is not allowed, which is what keeps the two namespaces apart: a single
  sign-in field can tell an email from a username without ambiguity.
- A short list of reserved words (`admin`, `owner`, `viewer`, …) is refused.

Accounts that predate usernames are backfilled from their email local part by
`server/migrations/002_usernames.sql`. Where two addresses share a local part,
the older account keeps the bare handle and later ones get a numeric suffix.

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
second account's username as an **Editor**. Open the same script in both
windows and type — you should see both carets and both sets of changes.

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

## Maintenance

There is no admin UI. To remove an account and everything it owns:

```bash
npm run user:remove -- someone@example.com
npm run user:remove -- ada              # a username works too
```

It needs `DATABASE_URL` in `.env`. Scripts owned by that person are
deleted with them; scripts owned by others keep working, minus that
person's access.

### Test accounts to clear out

This deployment was verified with five throwaway accounts (`tester`, `ada`,
`grace`, `mallory`, `newbie`). **Remove them before sharing the app**, since
their passwords are not secret:

```bash
npm run user:remove -- tester ada grace mallory newbie
```

Getting `DATABASE_URL` for this: open the database in the Render
dashboard, add your IP under **Networking → IP Allow List**, then copy the
**External** connection string. (By default the database accepts only
internal connections, which is why this needs a deliberate step.)

## Things it deliberately does not do

- **No email delivery.** Sharing works by looking up an existing account, so
  the person you are inviting has to sign up first. There are no invitation
  emails and no password reset — both would need an email provider wired in.
- **No link sharing.** Access is per-account only; a URL on its own grants
  nothing.
- **Comments are not anchored to the text.** A comment stores a snapshot of
  the quoted selection, not a live position, so it will not follow the text as
  the document is rewritten.

- **The page count on screen is an estimate.** It is computed from line
  counts, and the editor shows no page breaks. The exported PDF paginates
  properly, so trust that number over the one in the footer.

- **Export is one-way.** There is no importer, so a `.fdx` or `.fountain`
  file cannot be brought back in.

- **Scene numbers and revision marks are not implemented**, nor dual
  dialogue.

- **Film and TV format only.** Stage plays and radio drama use different
  indents and are not covered.
- **One server process.** Rooms live in memory, so running more than one
  instance would split collaborators across them. Scaling out would need the
  rooms coordinated through something shared, such as Redis.

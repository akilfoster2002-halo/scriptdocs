import express from 'express';
import { requireDocRole } from '../access.js';
import { requireAuth } from '../auth.js';
import { one, query } from '../db.js';
import { notifyDocument, notifyUsers } from '../events.js';

const router = express.Router();
router.use(requireAuth);

const ROLES = new Set(['viewer', 'commenter', 'editor']);

const USER_JSON = (alias) => `
  json_build_object(
    'id', ${alias}.id,
    'email', ${alias}.email,
    'display_name', ${alias}.display_name,
    'color', ${alias}.color
  )`;

// ---------------------------------------------------------------- list

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `select d.id, d.title, d.owner_id, d.created_at, d.updated_at,
              ${USER_JSON('o')} as owner,
              case when d.owner_id = $1 then 'owner' else s.role end as my_role
       from documents d
       join users o on o.id = d.owner_id
       left join document_shares s
         on s.document_id = d.id and s.user_id = $1
       where d.owner_id = $1 or s.user_id = $1
       order by d.updated_at desc`,
      [req.user.id]
    );
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const title =
      (typeof req.body?.title === 'string' && req.body.title.trim().slice(0, 300)) ||
      'Untitled script';

    const doc = await one(
      `insert into documents (owner_id, title) values ($1, $2)
       returning id, title, owner_id, created_at, updated_at`,
      [req.user.id, title]
    );
    res.status(201).json({ document: { ...doc, owner: req.user, my_role: 'owner' } });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------ single doc

router.get('/:docId', requireDocRole('viewer'), async (req, res, next) => {
  try {
    const doc = await one(
      `select d.id, d.title, d.owner_id, d.created_at, d.updated_at,
              ${USER_JSON('o')} as owner
       from documents d join users o on o.id = d.owner_id
       where d.id = $1`,
      [req.params.docId]
    );
    res.json({ document: doc, role: req.docRole });
  } catch (err) {
    next(err);
  }
});

router.patch('/:docId', requireDocRole('editor'), async (req, res, next) => {
  try {
    const { title } = req.body ?? {};
    if (typeof title !== 'string') {
      return res.status(400).json({ error: 'A title is required.' });
    }
    const clean = title.trim().slice(0, 300) || 'Untitled script';

    const doc = await one(
      `update documents
       set title = $2, updated_at = now(), last_edited_by = $3
       where id = $1
       returning id, title, updated_at`,
      [req.params.docId, clean, req.user.id]
    );

    notifyDocument(req.params.docId, {
      type: 'document:updated',
      document: doc,
      by: req.user.id,
    });
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
});

router.delete('/:docId', requireDocRole('owner'), async (req, res, next) => {
  try {
    const { rows } = await query('select user_id from document_shares where document_id = $1', [
      req.params.docId,
    ]);
    await query('delete from documents where id = $1', [req.params.docId]);

    notifyDocument(req.params.docId, { type: 'document:deleted', documentId: req.params.docId });
    notifyUsers(
      rows.map((r) => r.user_id),
      { type: 'documents:changed' }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------- sharing

router.get('/:docId/shares', requireDocRole('viewer'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `select s.user_id, s.role, s.created_at, ${USER_JSON('u')} as profile
       from document_shares s join users u on u.id = s.user_id
       where s.document_id = $1
       order by s.created_at`,
      [req.params.docId]
    );
    res.json({ shares: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:docId/shares', requireDocRole('owner'), async (req, res, next) => {
  try {
    const { email, role } = req.body ?? {};
    if (!ROLES.has(role)) return res.status(400).json({ error: 'Pick a valid permission.' });
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Enter an email address.' });
    }

    const target = await one(
      'select id, email, display_name, color from users where lower(email) = lower($1)',
      [email.trim()]
    );
    if (!target) {
      return res.status(404).json({
        error: 'No ScriptDocs account uses that email yet. Ask them to sign up first.',
      });
    }

    const doc = await one('select owner_id from documents where id = $1', [req.params.docId]);
    if (doc.owner_id === target.id) {
      return res.status(400).json({ error: 'That person already owns this script.' });
    }

    await query(
      `insert into document_shares (document_id, user_id, role, invited_by)
       values ($1, $2, $3, $4)
       on conflict (document_id, user_id) do update set role = excluded.role`,
      [req.params.docId, target.id, role, req.user.id]
    );

    notifyDocument(req.params.docId, { type: 'shares:changed' });
    notifyUsers([target.id], { type: 'documents:changed' });
    res.status(201).json({ share: { user_id: target.id, role, profile: target } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:docId/shares/:userId', requireDocRole('owner'), async (req, res, next) => {
  try {
    const { role } = req.body ?? {};
    if (!ROLES.has(role)) return res.status(400).json({ error: 'Pick a valid permission.' });

    const updated = await one(
      `update document_shares set role = $3
       where document_id = $1 and user_id = $2
       returning user_id, role`,
      [req.params.docId, req.params.userId, role]
    );
    if (!updated) return res.status(404).json({ error: 'That person does not have access.' });

    notifyDocument(req.params.docId, { type: 'shares:changed' });
    notifyUsers([req.params.userId], { type: 'documents:changed' });
    res.json({ share: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:docId/shares/:userId', requireDocRole('owner'), async (req, res, next) => {
  try {
    await query('delete from document_shares where document_id = $1 and user_id = $2', [
      req.params.docId,
      req.params.userId,
    ]);

    notifyDocument(req.params.docId, { type: 'shares:changed' });
    notifyUsers([req.params.userId], { type: 'documents:changed' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- comments

router.get('/:docId/comments', requireDocRole('viewer'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `select c.id, c.body, c.quote, c.resolved, c.created_at, c.author_id,
              ${USER_JSON('u')} as author
       from comments c join users u on u.id = c.author_id
       where c.document_id = $1
       order by c.created_at`,
      [req.params.docId]
    );
    res.json({ comments: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:docId/comments', requireDocRole('commenter'), async (req, res, next) => {
  try {
    const { body, quote } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Write something first.' });
    }

    const comment = await one(
      `insert into comments (document_id, author_id, body, quote)
       values ($1, $2, $3, $4)
       returning id, body, quote, resolved, created_at, author_id`,
      [
        req.params.docId,
        req.user.id,
        body.trim().slice(0, 4000),
        typeof quote === 'string' ? quote.slice(0, 500) : '',
      ]
    );

    notifyDocument(req.params.docId, { type: 'comments:changed' });
    res.status(201).json({ comment: { ...comment, author: req.user } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:docId/comments/:commentId', requireDocRole('commenter'), async (req, res, next) => {
  try {
    const { resolved } = req.body ?? {};
    if (typeof resolved !== 'boolean') {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    // Anyone who may comment can resolve a thread, matching how review
    // works in practice; only the author or the owner may delete one.
    const updated = await one(
      `update comments set resolved = $3
       where id = $1 and document_id = $2
       returning id, resolved`,
      [req.params.commentId, req.params.docId, resolved]
    );
    if (!updated) return res.status(404).json({ error: 'That comment is gone.' });

    notifyDocument(req.params.docId, { type: 'comments:changed' });
    res.json({ comment: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:docId/comments/:commentId', requireDocRole('commenter'), async (req, res, next) => {
  try {
    const comment = await one('select author_id from comments where id = $1 and document_id = $2', [
      req.params.commentId,
      req.params.docId,
    ]);
    if (!comment) return res.status(404).json({ error: 'That comment is gone.' });

    if (comment.author_id !== req.user.id && req.docRole !== 'owner') {
      return res.status(403).json({ error: 'Only the author or the script owner can delete this.' });
    }

    await query('delete from comments where id = $1', [req.params.commentId]);
    notifyDocument(req.params.docId, { type: 'comments:changed' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

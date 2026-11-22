import { one } from './db.js';

export const ROLE_RANK = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

/**
 * The single source of truth for "what may this person do with this script".
 * Returns 'owner' | 'editor' | 'commenter' | 'viewer' | null.
 */
export async function docRole(documentId, userId) {
  if (!documentId || !userId) return null;

  const row = await one(
    `select
       case
         when d.owner_id = $2 then 'owner'
         else s.role
       end as role
     from documents d
     left join document_shares s
       on s.document_id = d.id and s.user_id = $2
     where d.id = $1`,
    [documentId, userId]
  );

  return row?.role ?? null;
}

export function atLeast(role, minimum) {
  return (ROLE_RANK[role] || 0) >= ROLE_RANK[minimum];
}

/**
 * Express guard factory. Loads the caller's role for :docId and rejects
 * when it falls short of `minimum`.
 */
export function requireDocRole(minimum) {
  return async (req, res, next) => {
    try {
      const role = await docRole(req.params.docId, req.user.id);
      if (!role) {
        return res
          .status(404)
          .json({ error: 'This script does not exist, or it has not been shared with you.' });
      }
      if (!atLeast(role, minimum)) {
        return res.status(403).json({ error: 'You do not have permission to do that.' });
      }
      req.docRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

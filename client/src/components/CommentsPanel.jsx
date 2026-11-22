import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { docs as docsApi } from '../lib/api.js';
import { personName, relativeTime } from '../lib/format.js';
import Avatar from './Avatar.jsx';

export default function CommentsPanel({
  docId,
  editor,
  canComment,
  isOwner,
  refreshKey,
  onClose,
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setComments(await docsApi.listComments(docId));
    } catch (err) {
      setError(err.message);
    }
  }, [docId]);

  // Reloads on open, and whenever the editor relays a comments event.
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  function selectedText() {
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    if (from === to) return '';
    return editor.state.doc.textBetween(from, to, ' ').slice(0, 280);
  }

  async function onSubmit(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await docsApi.addComment(docId, text, selectedText());
      setBody('');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);
  const shown = showResolved ? resolved : open;

  return (
    <aside className="comments-panel" aria-label="Comments">
      <header className="comments-head">
        <div className="comments-tabs">
          <button
            type="button"
            className={!showResolved ? 'tab tab-active' : 'tab'}
            onClick={() => setShowResolved(false)}
          >
            Open {open.length > 0 && <span className="count">{open.length}</span>}
          </button>
          <button
            type="button"
            className={showResolved ? 'tab tab-active' : 'tab'}
            onClick={() => setShowResolved(true)}
          >
            Resolved {resolved.length > 0 && <span className="count">{resolved.length}</span>}
          </button>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close comments">
          <svg viewBox="0 0 24 24"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>
        </button>
      </header>

      {error && <p className="banner banner-error">{error}</p>}

      <div className="comments-list">
        {shown.length === 0 && (
          <p className="muted comments-empty">
            {showResolved ? 'Nothing resolved yet.' : 'No comments yet. Select some text and add one.'}
          </p>
        )}

        {shown.map((comment) => (
          <article className={comment.resolved ? 'comment comment-resolved' : 'comment'} key={comment.id}>
            <header>
              <Avatar profile={comment.author} size={28} />
              <div>
                <strong>{personName(comment.author)}</strong>
                <span className="muted">{relativeTime(comment.created_at)}</span>
              </div>
            </header>
            {comment.quote && <blockquote className="comment-quote">{comment.quote}</blockquote>}
            <p className="comment-body">{comment.body}</p>
            <footer>
              <button
                type="button"
                className="link"
                onClick={() =>
                  void docsApi
                    .setCommentResolved(docId, comment.id, !comment.resolved)
                    .then(refresh)
                    .catch((err) => setError(err.message))
                }
              >
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
              {(comment.author_id === user.id || isOwner) && (
                <button
                  type="button"
                  className="link link-danger"
                  onClick={() =>
                    void docsApi
                      .deleteComment(docId, comment.id)
                      .then(refresh)
                      .catch((err) => setError(err.message))
                  }
                >
                  Delete
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>

      {canComment && (
        <form className="comment-form" onSubmit={onSubmit}>
          {selectedText() && (
            <blockquote className="comment-quote comment-quote-preview">{selectedText()}</blockquote>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            aria-label="Add a comment"
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !body.trim()}>
            {busy ? 'Posting…' : 'Comment'}
          </button>
        </form>
      )}
    </aside>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { docs as docsApi, ROLES } from '../lib/api.js';
import { personName } from '../lib/format.js';
import Avatar from './Avatar.jsx';

export default function ShareDialog({ docId, doc, onClose }) {
  const { user } = useAuth();
  const [shares, setShares] = useState([]);
  const [person, setPerson] = useState('');
  const [role, setRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      setShares(await docsApi.listShares(docId));
    } catch (err) {
      setError(err.message);
    }
  }, [docId]);

  useEffect(() => {
    void refresh();
    inputRef.current?.focus();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onInvite(event) {
    event.preventDefault();
    const trimmed = person.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { share } = await docsApi.share(docId, trimmed, role);
      setPerson('');
      const verb =
        role === 'viewer' ? 'view' : role === 'commenter' ? 'comment on' : 'edit';
      setNotice(`${personName(share.profile)} can now ${verb} this script.`);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(userId, nextRole) {
    try {
      await docsApi.updateShare(docId, userId, nextRole);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onRemove(userId) {
    try {
      await docsApi.removeShare(docId, userId);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the link.');
    }
  }

  const me = user;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Share this script" ref={dialogRef}>
        <header className="modal-head">
          <h2>Share “{doc?.title || 'Untitled script'}”</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>
          </button>
        </header>

        <form onSubmit={onInvite} className="share-form">
          <input
            ref={inputRef}
            type="text"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            placeholder="Add people by username or email"
            aria-label="Username or email address"
            autoComplete="off"
            spellCheck="false"
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Permission">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary" disabled={busy || !person.trim()}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </form>

        {error && <p className="banner banner-error">{error}</p>}
        {notice && <p className="banner banner-ok">{notice}</p>}

        <div className="share-list">
          <h3>People with access</h3>

          <div className="share-row">
            <Avatar profile={doc?.owner || me} size={36} />
            <div className="share-who">
              <strong>
                {doc?.owner_id === user.id ? `${personName(me)} (you)` : personName(doc?.owner)}
              </strong>
              <span>@{doc?.owner?.username || me.username}</span>
            </div>
            <span className="share-role-static">Owner</span>
          </div>

          {shares.length === 0 && (
            <p className="muted share-empty">
              Nobody else yet. Add a collaborator by their username or email above.
            </p>
          )}

          {shares.map((share) => (
            <div className="share-row" key={share.user_id}>
              <Avatar profile={share.profile} size={36} />
              <div className="share-who">
                <strong>{personName(share.profile)}</strong>
                <span>@{share.profile?.username}</span>
              </div>
              <select
                value={share.role}
                onChange={(e) => void onRoleChange(share.user_id, e.target.value)}
                aria-label={`Permission for ${personName(share.profile)}`}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                title="Remove access"
                aria-label={`Remove ${personName(share.profile)}`}
                onClick={() => void onRemove(share.user_id)}
              >
                <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14z"/></svg>
              </button>
            </div>
          ))}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={() => void onCopyLink()}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </footer>

        <p className="share-note">
          Add people by username (<code>ada</code>) or email. They must already have a
          ScriptDocs account, and will find the script under “Shared with me”.
        </p>
      </div>
    </div>
  );
}

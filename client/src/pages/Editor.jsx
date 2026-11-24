import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useCollab } from '../lib/useCollab.js';
import { useEvents } from '../lib/useEvents.js';
import { docs as docsApi, ROLE_LABEL } from '../lib/api.js';
import { personName } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import UserMenu from '../components/UserMenu.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import DocumentSurface from '../components/DocumentSurface.jsx';

export default function Editor() {
  const { docId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [role, setRole] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [title, setTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const titleTimer = useRef(null);

  const canEdit = role === 'owner' || role === 'editor';
  const canComment = canEdit || role === 'commenter';

  // --- load metadata + permission -------------------------------------
  const loadDoc = useCallback(async () => {
    const { document: meta, role: myRole } = await docsApi.get(docId);
    setDoc(meta);
    setRole(myRole);
    // Do not yank the title out from under someone who is typing it.
    if (!document.activeElement?.dataset?.titleInput) setTitle(meta.title);
  }, [docId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadDoc();
      } catch (err) {
        if (active) setLoadError(err.message);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadDoc]);

  // Reflect title, permission and comment changes other people make.
  const [commentsBump, setCommentsBump] = useState(0);

  const onServerEvent = useCallback(
    (event) => {
      if (event.type === 'document:deleted') {
        setLoadError('This script was deleted by its owner.');
        return;
      }
      if (event.type === 'comments:changed') {
        setCommentsBump((n) => n + 1);
        return;
      }
      // document:updated and shares:changed both need fresh metadata.
      void loadDoc().catch((err) => {
        if (err.status === 404 || err.status === 403) {
          setLoadError('Your access to this script was removed.');
        }
      });
    },
    [loadDoc]
  );

  useEvents(loadError ? null : docId, onServerEvent);

  const identity = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      name: user.display_name || user.email?.split('@')[0] || 'Someone',
      email: user.email,
      color: user.color || '#1a73e8',
    };
  }, [user?.id, user?.display_name, user?.color, user?.email]);

  const { ydoc, provider, connection, peers } = useCollab({
    docId: loadError ? null : docId,
    identity,
  });

  // --- title ------------------------------------------------------------
  const onTitleChange = useCallback(
    (value) => {
      setTitle(value);
      if (!canEdit) return;
      clearTimeout(titleTimer.current);
      titleTimer.current = setTimeout(async () => {
        setSavingTitle(true);
        try {
          await docsApi.rename(docId, value.trim() || 'Untitled script');
        } catch {
          /* the next metadata refresh will reconcile */
        } finally {
          setSavingTitle(false);
        }
      }, 600);
    },
    [canEdit, docId]
  );

  useEffect(() => {
    document.title = title ? `${title} — ScriptDocs` : 'ScriptDocs';
    return () => {
      document.title = 'ScriptDocs';
    };
  }, [title]);

  if (loadError) {
    return (
      <div className="splash">
        <div className="splash-mark" aria-hidden="true" />
        <p>{loadError}</p>
        <Link className="btn" to="/">Back to your scripts</Link>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <header className="editor-bar">
        <Link to="/" className="editor-home" title="All scripts" aria-label="All scripts">
          <span className="brand-mark" aria-hidden="true" />
        </Link>

        <div className="editor-headings">
          <input
            className="title-input"
            data-title-input="true"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            readOnly={!canEdit}
            placeholder="Untitled script"
            aria-label="Script title"
          />
          <div className="editor-substatus">
            <span className={`conn conn-${connection}`}>
              {connection === 'connected'
                ? 'All changes saved'
                : connection === 'error'
                  ? 'Reconnecting failed'
                  : 'Connecting…'}
            </span>
            {savingTitle && <span className="muted">· renaming</span>}
            {role && role !== 'owner' && (
              <span className="role-chip">{ROLE_LABEL[role]}</span>
            )}
            {doc && (
              <span className="muted">
                · {doc.owner_id === user.id ? 'Owned by you' : `Owned by ${personName(doc.owner)}`}
              </span>
            )}
          </div>
        </div>

        <div className="editor-actions">
          <div className="presence" aria-label="People viewing this script">
            {peers.slice(0, 4).map((peer) => (
              <span key={peer.clientId} className="presence-item">
                <Avatar
                  profile={{ display_name: peer.name, email: peer.email, color: peer.color }}
                  size={30}
                  title={`${peer.name} is here`}
                />
              </span>
            ))}
            {peers.length > 4 && <span className="presence-more">+{peers.length - 4}</span>}
          </div>

          <ExportMenu
            editor={editor}
            title={title}
            author={doc?.owner ? personName(doc.owner) : ''}
          />

          {canComment && (
            <button
              type="button"
              className={commentsOpen ? 'btn btn-ghost btn-on' : 'btn btn-ghost'}
              onClick={() => setCommentsOpen((v) => !v)}
            >
              Comments
            </button>
          )}

          {role === 'owner' && (
            <button type="button" className="btn btn-primary" onClick={() => setShareOpen(true)}>
              Share
            </button>
          )}

          <UserMenu />
        </div>
      </header>

      {ydoc && provider ? (
        <DocumentSurface
          key={docId}
          docId={docId}
          doc={doc}
          ydoc={ydoc}
          provider={provider}
          identity={identity}
          canEdit={canEdit}
          canComment={canComment}
          isOwner={role === 'owner'}
          commentsOpen={commentsOpen}
          commentsBump={commentsBump}
          onCloseComments={() => setCommentsOpen(false)}
          onEditor={setEditor}
        />
      ) : (
        <>
          <div className="toolbar" />
          <div className="editor-body">
            <div className="page-scroll">
              <div className="page">
                <p className="muted">Opening the script…</p>
              </div>
            </div>
          </div>
        </>
      )}

      {shareOpen && (
        <ShareDialog docId={docId} doc={doc} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

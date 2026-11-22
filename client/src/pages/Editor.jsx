import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';

import { useAuth } from '../lib/auth.jsx';
import { useCollab } from '../lib/useCollab.js';
import { useEvents } from '../lib/useEvents.js';
import { docs as docsApi, ROLE_LABEL } from '../lib/api.js';
import { personName, relativeTime } from '../lib/format.js';
import Toolbar from '../components/Toolbar.jsx';
import Avatar from '../components/Avatar.jsx';
import UserMenu from '../components/UserMenu.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import CommentsPanel from '../components/CommentsPanel.jsx';

export default function Editor() {
  const { docId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [role, setRole] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [title, setTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
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

  // --- editor ----------------------------------------------------------
  const editor = useEditor(
    {
      extensions: ydoc
        ? [
            // undoRedo must be off: Collaboration brings its own undo stack,
            // scoped so you never undo a collaborator's typing.
            StarterKit.configure({
              undoRedo: false,
              link: { openOnClick: false, autolink: true },
            }),
            TextStyle,
            FontSize,
            Color,
            Highlight.configure({ multicolor: true }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Placeholder.configure({ placeholder: 'Start writing your script…' }),
            CharacterCount,
            Collaboration.configure({ document: ydoc }),
            ...(provider
              ? [CollaborationCaret.configure({ provider, user: identity })]
              : []),
          ]
        : [],
      editable: canEdit,
      editorProps: {
        attributes: {
          class: 'page-body',
          spellcheck: 'true',
        },
      },
    },
    [ydoc, provider]
  );

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  useEffect(() => {
    if (editor && identity) {
      editor.commands.updateUser?.(identity);
    }
  }, [editor, identity]);

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

  const words = editor?.storage.characterCount?.words?.() ?? 0;

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

      <Toolbar editor={editor} canEdit={canEdit} />

      <div className={commentsOpen ? 'editor-body with-panel' : 'editor-body'}>
        <div className="page-scroll">
          <div className="page">
            {editor ? <EditorContent editor={editor} /> : <div className="page-body" />}
          </div>
          <div className="page-footer">
            <span>{words} {words === 1 ? 'word' : 'words'}</span>
            {doc?.updated_at && <span>Edited {relativeTime(doc.updated_at)}</span>}
          </div>
        </div>

        {commentsOpen && canComment && (
          <CommentsPanel
            docId={docId}
            editor={editor}
            canComment={canComment}
            isOwner={role === 'owner'}
            refreshKey={commentsBump}
            onClose={() => setCommentsOpen(false)}
          />
        )}
      </div>

      {shareOpen && (
        <ShareDialog docId={docId} doc={doc} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';

import { relativeTime } from '../lib/format.js';
import Toolbar from './Toolbar.jsx';
import CommentsPanel from './CommentsPanel.jsx';

/**
 * The editing surface.
 *
 * Mounted only once the Yjs document exists. TipTap builds its schema the
 * moment the editor is constructed, so it must never be created with an
 * empty extension list — and Collaboration has to be present from the
 * start, or the first keystrokes would land outside the shared document.
 */
export default function DocumentSurface({
  docId,
  doc,
  ydoc,
  provider,
  identity,
  canEdit,
  canComment,
  isOwner,
  commentsOpen,
  commentsBump,
  onCloseComments,
}) {
  const editor = useEditor(
    {
      extensions: [
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
        CollaborationCaret.configure({ provider, user: identity }),
      ],
      editable: canEdit,
      editorProps: {
        attributes: { class: 'page-body', spellcheck: 'true' },
      },
    },
    [ydoc, provider]
  );

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  useEffect(() => {
    if (editor && identity) editor.commands.updateUser?.(identity);
  }, [editor, identity]);

  const words = editor?.storage.characterCount?.words?.() ?? 0;

  return (
    <>
      <Toolbar editor={editor} canEdit={canEdit} />

      <div className={commentsOpen ? 'editor-body with-panel' : 'editor-body'}>
        <div className="page-scroll">
          <div className="page">
            <EditorContent editor={editor} />
          </div>
          <div className="page-footer">
            <span>
              {words} {words === 1 ? 'word' : 'words'}
            </span>
            {doc?.updated_at && <span>Edited {relativeTime(doc.updated_at)}</span>}
          </div>
        </div>

        {commentsOpen && canComment && (
          <CommentsPanel
            docId={docId}
            editor={editor}
            canComment={canComment}
            isOwner={isOwner}
            refreshKey={commentsBump}
            onClose={onCloseComments}
          />
        )}
      </div>
    </>
  );
}

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { Placeholder } from '@tiptap/extensions';

import { relativeTime } from '../lib/format.js';
import { ScreenplayParagraph } from '../lib/ScreenplayParagraph.js';
import { ScreenplayAutocomplete } from '../lib/screenplayAutocomplete.js';
import { screenplayStats } from '../lib/screenplay.js';
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
  onEditor,
}) {
  const editor = useEditor(
    {
      extensions: [
        // undoRedo must be off: Collaboration brings its own undo stack,
        // scoped so you never undo a collaborator's typing.
        //
        // Headings, lists, quotes and code blocks are off too: screenplays
        // have their own seven elements and nothing else, so offering them
        // would only produce pages that no production would accept.
        StarterKit.configure({
          undoRedo: false,
          paragraph: false,
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          blockquote: false,
          codeBlock: false,
          code: false,
          horizontalRule: false,
          link: false,
          strike: false,
        }),
        ScreenplayParagraph,
        ScreenplayAutocomplete,
        Placeholder.configure({
          placeholder: 'FADE IN:  —  start typing, or press Tab to pick an element',
        }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCaret.configure({ provider, user: identity }),
      ],
      editable: canEdit,
      editorProps: {
        attributes: { class: 'page-body screenplay', spellcheck: 'true' },
      },
    },
    [ydoc, provider]
  );

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // The header needs the editor for Download; it lives out here.
  useEffect(() => {
    onEditor?.(editor ?? null);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  useEffect(() => {
    if (editor && identity) editor.commands.updateUser?.(identity);
  }, [editor, identity]);

  const stats = editor ? screenplayStats(editor.state.doc) : { pages: 0, scenes: 0 };

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
              {stats.pages} {stats.pages === 1 ? 'page' : 'pages'} ·{' '}
              {stats.scenes} {stats.scenes === 1 ? 'scene' : 'scenes'}
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

const FONT_SIZES = ['12', '14', '16', '18', '24', '30'];

function Divider() {
  return <span className="tb-divider" aria-hidden="true" />;
}

function Btn({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      className={active ? 'tb-btn tb-btn-active' : 'tb-btn'}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
    >
      {children}
    </button>
  );
}

export default function Toolbar({ editor, canEdit }) {
  if (!editor) return <div className="toolbar" />;

  const disabled = !canEdit;
  const blockValue = (() => {
    for (const level of [1, 2, 3]) {
      if (editor.isActive('heading', { level })) return `h${level}`;
    }
    return 'p';
  })();

  function setBlock(value) {
    const chain = editor.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(value.slice(1)) }).run();
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn
        label="Undo"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A7.47 7.47 0 0112.5 11c3.04 0 5.63 1.98 6.54 4.73l2.37-.78A9.98 9.98 0 0012.5 8z"/></svg>
      </Btn>
      <Btn
        label="Redo"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <svg viewBox="0 0 24 24"><path d="M18.4 10.6A9.98 9.98 0 002.59 15l2.37.78A7.49 7.49 0 0111.5 11c1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
      </Btn>

      <Divider />

      <select
        className="tb-select tb-select-block"
        value={blockValue}
        disabled={disabled}
        onChange={(e) => setBlock(e.target.value)}
        aria-label="Paragraph style"
      >
        <option value="p">Normal text</option>
        <option value="h1">Title</option>
        <option value="h2">Heading</option>
        <option value="h3">Subheading</option>
      </select>

      <select
        className="tb-select"
        disabled={disabled}
        value={
          FONT_SIZES.find((s) => editor.isActive('textStyle', { fontSize: `${s}px` })) || '16'
        }
        onChange={(e) =>
          editor.chain().focus().setFontSize(`${e.target.value}px`).run()
        }
        aria-label="Font size"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <Divider />

      <Btn label="Bold" active={editor.isActive('bold')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </Btn>
      <Btn label="Italic" active={editor.isActive('italic')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </Btn>
      <Btn label="Underline" active={editor.isActive('underline')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: 'underline' }}>U</span>
      </Btn>
      <Btn label="Strikethrough" active={editor.isActive('strike')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </Btn>
      <Btn label="Highlight" active={editor.isActive('highlight')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <svg viewBox="0 0 24 24"><path d="M6 14l3 3-1.5 1.5H4l2-4.5zm3.9-1.4l5.6-5.6 3.5 3.5-5.6 5.6-3.5-3.5zm7.8-7.8l1.4-1.4a1 1 0 011.4 0l2.1 2.1a1 1 0 010 1.4l-1.4 1.4-3.5-3.5z"/></svg>
      </Btn>

      <label className="tb-color" title="Text colour">
        <span aria-hidden="true">A</span>
        <input
          type="color"
          disabled={disabled}
          value={editor.getAttributes('textStyle').color || '#202124'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          aria-label="Text colour"
        />
      </label>

      <Divider />

      {[
        ['left', 'Align left', 'M3 5h18v2H3zm0 4h12v2H3zm0 4h18v2H3zm0 4h12v2H3z'],
        ['center', 'Align centre', 'M3 5h18v2H3zm3 4h12v2H6zm-3 4h18v2H3zm3 4h12v2H6z'],
        ['right', 'Align right', 'M3 5h18v2H3zm6 4h12v2H9zm-6 4h18v2H3zm6 4h12v2H9z'],
        ['justify', 'Justify', 'M3 5h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3z'],
      ].map(([value, label, d]) => (
        <Btn
          key={value}
          label={label}
          disabled={disabled}
          active={editor.isActive({ textAlign: value })}
          onClick={() => editor.chain().focus().setTextAlign(value).run()}
        >
          <svg viewBox="0 0 24 24"><path d={d} /></svg>
        </Btn>
      ))}

      <Divider />

      <Btn label="Bulleted list" active={editor.isActive('bulletList')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <svg viewBox="0 0 24 24"><path d="M4 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0-6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0 12a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM8 19h13v-2H8zm0-6h13v-2H8zm0-8v2h13V5z"/></svg>
      </Btn>
      <Btn label="Numbered list" active={editor.isActive('orderedList')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <svg viewBox="0 0 24 24"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2zm1-9h1V4H2v1h1zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2zM8 5v2h13V5zm0 14h13v-2H8zm0-6h13v-2H8z"/></svg>
      </Btn>
      <Btn label="Quote" active={editor.isActive('blockquote')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <svg viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>
      </Btn>
      <Btn label="Code block" active={editor.isActive('codeBlock')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <svg viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
      </Btn>
      <Btn label="Horizontal rule" disabled={disabled}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <svg viewBox="0 0 24 24"><path d="M3 11h18v2H3z"/></svg>
      </Btn>

      <Divider />

      <Btn
        label="Link"
        active={editor.isActive('link')}
        disabled={disabled}
        onClick={() => {
          const previous = editor.getAttributes('link').href || '';
          const url = window.prompt('Link URL (leave empty to remove)', previous);
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }
          const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
          editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
        }}
      >
        <svg viewBox="0 0 24 24"><path d="M3.9 12a3.1 3.1 0 013.1-3.1h4V7H7a5 5 0 000 10h4v-1.9H7A3.1 3.1 0 013.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 010 6.2h-4V17h4a5 5 0 000-10z"/></svg>
      </Btn>
      <Btn label="Clear formatting" disabled={disabled}
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
        <svg viewBox="0 0 24 24"><path d="M3.3 4.7l16 16 1.4-1.4-5.6-5.6L20 7V5H8.3l-3.6-3.6L3.3 4.7zM5 19h8v2H5z"/></svg>
      </Btn>
    </div>
  );
}

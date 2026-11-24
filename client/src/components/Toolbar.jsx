import { ELEMENTS, ELEMENT_ORDER, elementOf } from '../lib/screenplay.js';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl+';

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
  const current = elementOf(editor.state.selection.$from.parent);

  return (
    <div className="toolbar" role="toolbar" aria-label="Script formatting">
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

      <div className="element-bar" role="group" aria-label="Element type">
        {ELEMENT_ORDER.map((element) => {
          const config = ELEMENTS[element];
          return (
            <button
              key={element}
              type="button"
              className={current === element ? 'element-chip element-chip-active' : 'element-chip'}
              disabled={disabled}
              aria-pressed={current === element}
              title={`${config.label} — ${MOD}${config.key}`}
              onClick={() => editor.chain().focus().setScreenplayElement(element).run()}
            >
              {config.label}
              <span className="element-key" aria-hidden="true">{config.key}</span>
            </button>
          );
        })}
      </div>

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

      <span className="tb-tip" aria-hidden="true">
        Tab cycles · Enter moves on
      </span>
    </div>
  );
}

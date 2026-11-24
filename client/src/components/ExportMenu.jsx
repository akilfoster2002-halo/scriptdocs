import { useEffect, useRef, useState } from 'react';
import { download } from '../lib/export/download.js';
import { safeFilename } from '../lib/export/script.js';
import { toFountain } from '../lib/export/fountain.js';
import { toFdx } from '../lib/export/fdx.js';

const FORMATS = [
  {
    id: 'pdf',
    label: 'PDF',
    hint: 'Paginated, ready to send',
    extension: 'pdf',
  },
  {
    id: 'fdx',
    label: 'Final Draft',
    hint: 'Opens in Final Draft (.fdx)',
    extension: 'fdx',
  },
  {
    id: 'fountain',
    label: 'Fountain',
    hint: 'Plain text, opens almost anywhere',
    extension: 'fountain',
  },
];

export default function ExportMenu({ editor, title, author }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function run(format) {
    if (!editor) return;
    setBusy(format.id);
    setError(null);

    try {
      const stem = safeFilename(title);
      const filename = `${stem}.${format.extension}`;
      const meta = { title, author };

      if (format.id === 'fountain') {
        download(filename, toFountain(editor.state.doc, meta), 'text/plain;charset=utf-8');
      } else if (format.id === 'fdx') {
        download(filename, toFdx(editor.state.doc, meta), 'application/xml;charset=utf-8');
      } else {
        // The PDF engine is fetched on first use, so this can take a moment.
        const { toPdf } = await import('../lib/export/pdf.js');
        download(filename, await toPdf(editor.state.doc, meta), 'application/pdf');
      }

      setOpen(false);
    } catch (err) {
      setError(err.message || 'Could not build that file.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="export-menu" ref={ref}>
      <button
        type="button"
        className={open ? 'btn btn-ghost btn-on' : 'btn btn-ghost'}
        onClick={() => setOpen((v) => !v)}
        disabled={!editor}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Download
      </button>

      {open && (
        <div className="menu menu-wide" role="menu">
          {FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              role="menuitem"
              className="export-option"
              disabled={busy !== null}
              onClick={() => void run(format)}
            >
              <span className="export-option-label">
                {format.label}
                {busy === format.id && <span className="muted"> · building…</span>}
              </span>
              <span className="export-option-hint">{format.hint}</span>
            </button>
          ))}

          {error && <p className="banner banner-error export-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { docs as docsApi } from '../lib/api.js';
import { contentToBlocks, versionToContent } from '../lib/versionContent.js';
import { fullDate } from '../lib/format.js';

const MARK_TAG = { bold: 'strong', italic: 'em', underline: 'u' };

function Span({ span }) {
  return span.marks.reduce(
    (child, mark) => {
      const Tag = MARK_TAG[mark];
      return Tag ? <Tag>{child}</Tag> : child;
    },
    <>{span.text}</>
  );
}

/**
 * A past version, rendered read-only in the same page as the editor.
 *
 * Deliberately not a second editor: a version is a thing to read and
 * decide about, and an editable copy of it would invite changes that
 * have nowhere to go.
 */
export default function VersionPreview({ docId, version, canEdit, onRestore, onBack }) {
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let active = true;
    setBlocks(null);
    setError(null);

    (async () => {
      try {
        const bytes = await docsApi.versionState(docId, version.id);
        if (!active) return;
        setBlocks(contentToBlocks(versionToContent(bytes)));
      } catch (err) {
        if (active) setError(err.message);
      }
    })();

    return () => {
      active = false;
    };
  }, [docId, version.id]);

  async function restore() {
    setRestoring(true);
    setError(null);
    try {
      const bytes = await docsApi.versionState(docId, version.id);
      await onRestore(versionToContent(bytes));
    } catch (err) {
      setError(err.message);
      setRestoring(false);
    }
  }

  return (
    <div className="version-view">
      <div className="version-bar">
        <div className="version-bar-text">
          <strong>{version.label || 'Autosaved version'}</strong>
          <span>{fullDate(version.created_at)}</span>
        </div>
        <div className="version-bar-actions">
          {canEdit && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void restore()}
              disabled={restoring || !blocks}
            >
              {restoring ? 'Restoring…' : 'Restore this version'}
            </button>
          )}
          <button type="button" className="btn" onClick={onBack}>
            Back to editing
          </button>
        </div>
      </div>

      <div className="page-scroll">
        <div className="page">
          {error ? (
            <p className="banner banner-error">{error}</p>
          ) : blocks === null ? (
            <p className="muted">Loading this version…</p>
          ) : blocks.length === 0 ? (
            <p className="muted">This version was empty.</p>
          ) : (
            <div className="page-body screenplay">
              {blocks.map((block, i) => (
                <p key={i} className={`sp sp-${block.element}`}>
                  {block.spans.length === 0
                    ? ' '
                    : block.spans.map((span, j) => <Span key={j} span={span} />)}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

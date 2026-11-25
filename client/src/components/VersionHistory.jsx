import { useCallback, useEffect, useState } from 'react';
import { docs as docsApi } from '../lib/api.js';
import { fullDate, personName, relativeTime } from '../lib/format.js';
import Avatar from './Avatar.jsx';

export default function VersionHistory({
  docId,
  canEdit,
  refreshKey,
  selectedId,
  onSelect,
  onClose,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setVersions(await docsApi.listVersions(docId));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  async function onName(event) {
    event.preventDefault();
    const clean = label.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      await docsApi.nameVersion(docId, clean);
      setLabel('');
      setNaming(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="history-panel" aria-label="Version history">
      <header className="history-head">
        <h2>Version history</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close history">
          <svg viewBox="0 0 24 24"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>
        </button>
      </header>

      {canEdit && (
        <div className="history-actions">
          {naming ? (
            <form onSubmit={onName} className="history-name-form">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. First draft"
                aria-label="Version name"
                maxLength={120}
                autoFocus
              />
              <div className="history-name-buttons">
                <button type="submit" className="btn btn-primary" disabled={busy || !label.trim()}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setNaming(false);
                    setLabel('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-block" onClick={() => setNaming(true)}>
              Name current version
            </button>
          )}
        </div>
      )}

      {error && <p className="banner banner-error history-error">{error}</p>}

      <div className="history-list">
        {loading ? (
          <p className="muted history-empty">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="muted history-empty">
            No versions yet. One is saved automatically every few minutes while
            anyone is writing, and again when everyone leaves.
          </p>
        ) : (
          <>
            <button
              type="button"
              className={selectedId === null ? 'history-row history-row-active' : 'history-row'}
              onClick={() => onSelect(null)}
            >
              <span className="history-when">
                <strong>Current version</strong>
                <span className="muted">Live, as you are editing it</span>
              </span>
            </button>

            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                className={
                  selectedId === version.id ? 'history-row history-row-active' : 'history-row'
                }
                onClick={() => onSelect(version)}
                title={fullDate(version.created_at)}
              >
                <span className="history-when">
                  <strong>
                    {version.label || relativeTime(version.created_at)}
                    {version.label && <span className="history-tag">named</span>}
                  </strong>
                  <span className="muted">
                    {version.label ? fullDate(version.created_at) : fullDate(version.created_at)}
                  </span>
                </span>

                <span className="history-authors">
                  {(version.authors ?? []).slice(0, 3).map((author) => (
                    <Avatar key={author.id} profile={author} size={22} title={personName(author)} />
                  ))}
                  {(version.authors ?? []).length > 3 && (
                    <span className="history-more">+{version.authors.length - 3}</span>
                  )}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

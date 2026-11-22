import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { docs as docsApi } from '../lib/api.js';
import { useEvents } from '../lib/useEvents.js';
import { personName, relativeTime } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import UserMenu from '../components/UserMenu.jsx';

export default function DocList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all | mine | shared
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDocs(await docsApi.list());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pick up scripts other people share with us while this page is open.
  useEvents(null, useCallback(() => void refresh(), [refresh]));

  // And after the tab has been in the background.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter === 'mine' && d.owner_id !== user.id) return false;
      if (filter === 'shared' && d.owner_id === user.id) return false;
      if (q && !d.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, filter, query, user.id]);

  async function onCreate() {
    setCreating(true);
    try {
      const created = await docsApi.create();
      navigate(`/d/${created.id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  async function onDelete(doc, event) {
    event.stopPropagation();
    if (!window.confirm(`Delete “${doc.title}” permanently? This cannot be undone.`)) return;
    try {
      await docsApi.remove(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="home">
      <header className="home-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">ScriptDocs</span>
        </div>
        <div className="home-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scripts"
            aria-label="Search scripts"
          />
        </div>
        <UserMenu />
      </header>

      <main className="home-main">
        <div className="home-head">
          <h1>Your scripts</h1>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onCreate()}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'New script'}
          </button>
        </div>

        <div className="tabs" role="tablist">
          {[
            ['all', 'All'],
            ['mine', 'Owned by me'],
            ['shared', 'Shared with me'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? 'tab tab-active' : 'tab'}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="banner banner-error">{error}</p>}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="empty">
            <div className="empty-art" aria-hidden="true" />
            <h2>{query ? 'No scripts match that search' : 'Nothing here yet'}</h2>
            <p>
              {query
                ? 'Try a different title.'
                : filter === 'shared'
                  ? 'Scripts other people share with you will appear here.'
                  : 'Create a script, then share it with your collaborators.'}
            </p>
            {!query && filter !== 'shared' && (
              <button type="button" className="btn btn-primary" onClick={() => void onCreate()}>
                New script
              </button>
            )}
          </div>
        ) : (
          <ul className="doc-grid">
            {visible.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  className="doc-card"
                  onClick={() => navigate(`/d/${doc.id}`)}
                >
                  <span className="doc-thumb" aria-hidden="true">
                    <span /><span /><span /><span /><span />
                  </span>
                  <span className="doc-meta">
                    <strong className="doc-title">{doc.title || 'Untitled script'}</strong>
                    <span className="doc-sub">
                      {doc.owner_id === user.id ? 'You' : personName(doc.owner)} ·{' '}
                      {relativeTime(doc.updated_at)}
                    </span>
                  </span>
                  <span className="doc-card-side">
                    <Avatar profile={doc.owner} size={26} />
                    {doc.owner_id === user.id && (
                      <span
                        className="doc-delete"
                        role="button"
                        tabIndex={0}
                        title="Delete script"
                        onClick={(e) => void onDelete(doc, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') void onDelete(doc, e);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                        </svg>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { personName } from '../lib/format.js';
import Avatar from './Avatar.jsx';

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
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

  const me = user ?? { email: '', display_name: '', color: '#5f6368' };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="avatar-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar profile={me} size={34} />
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">
            <Avatar profile={me} size={40} />
            <div>
              <strong>{personName(me)}</strong>
              <span>@{me.username}</span>
              <span>{me.email}</span>
            </div>
          </div>
          <hr />
          <button type="button" role="menuitem" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const isSignUp = mode === 'signup';

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (isSignUp) {
        await signUp(email, password, displayName.trim());
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">ScriptDocs</span>
        </div>

        <h1>{isSignUp ? 'Create your account' : 'Sign in'}</h1>
        <p className="auth-sub">
          {isSignUp
            ? 'Write scripts with your collaborators in real time.'
            : 'Welcome back. Pick up where everyone left off.'}
        </p>

        <form onSubmit={onSubmit} className="auth-form">
          {isSignUp && (
            <label>
              <span>Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignUp ? 'At least 6 characters' : '••••••••'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}
          {notice && <p className="auth-notice">{notice}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignUp ? 'Already have an account?' : 'New to ScriptDocs?'}{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(isSignUp ? 'signin' : 'signup');
              setError(null);
              setNotice(null);
            }}
          >
            {isSignUp ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}

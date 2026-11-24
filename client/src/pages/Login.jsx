import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

// Mirrors the server's rule in server/usernames.js.
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

function suggestUsername(email) {
  const local = String(email || '').split('@')[0] || '';
  return local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 24);
}

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isSignUp = mode === 'signup';

  // Offer a handle derived from the email until the person edits it.
  function onEmailChange(value) {
    setEmail(value);
    if (!usernameTouched) setUsername(suggestUsername(value));
  }

  const usernameHint =
    isSignUp && username && !USERNAME_PATTERN.test(username)
      ? 'Use 3–30 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.'
      : null;

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isSignUp) {
        await signUp({
          email,
          username,
          password,
          displayName: displayName.trim() || username,
        });
      } else {
        await signIn(identifier, password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(isSignUp ? 'signin' : 'signup');
    setError(null);
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
          {isSignUp ? (
            <>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                <span>Username</span>
                <div className="input-prefixed">
                  <span className="input-prefix" aria-hidden="true">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsernameTouched(true);
                      setUsername(e.target.value.toLowerCase());
                    }}
                    placeholder="ada"
                    autoComplete="username"
                    spellCheck="false"
                    minLength={3}
                    maxLength={30}
                    required
                  />
                </div>
                <small className={usernameHint ? 'field-hint field-hint-warn' : 'field-hint'}>
                  {usernameHint || 'People use this to sign in and to share scripts with you.'}
                </small>
              </label>

              <label>
                <span>Display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                />
                <small className="field-hint">Optional — shown on your cursor and comments.</small>
              </label>
            </>
          ) : (
            <label>
              <span>Username or email</span>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="ada  or  you@example.com"
                autoComplete="username"
                spellCheck="false"
                required
              />
            </label>
          )}

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

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignUp ? 'Already have an account?' : 'New to ScriptDocs?'}{' '}
          <button type="button" className="link" onClick={switchMode}>
            {isSignUp ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}

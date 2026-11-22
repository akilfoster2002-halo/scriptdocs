import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import DocList from './pages/DocList.jsx';
import Editor from './pages/Editor.jsx';
import './styles.css';

function Splash({ message }) {
  return (
    <div className="splash">
      <div className="splash-mark" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function Gate({ children }) {
  const { status, error, user } = useAuth();
  if (status === 'loading') return <Splash message="Loading ScriptDocs…" />;
  if (status === 'error') return <Splash message={error || 'Something went wrong.'} />;
  if (!user) return <Navigate to="/signin" replace />;
  return children;
}

function SignInRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Splash message="Loading ScriptDocs…" />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/signin" element={<SignInRoute />} />
          <Route
            path="/"
            element={
              <Gate>
                <DocList />
              </Gate>
            }
          />
          <Route
            path="/d/:docId"
            element={
              <Gate>
                <Editor />
              </Gate>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

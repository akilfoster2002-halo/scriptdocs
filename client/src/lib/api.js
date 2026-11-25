/**
 * Thin wrapper over the app's own JSON API. The session lives in an
 * httpOnly cookie, so nothing here handles tokens.
 */

export const ROLES = [
  { value: 'viewer', label: 'Viewer', hint: 'Can read only' },
  { value: 'commenter', label: 'Commenter', hint: 'Can read and comment' },
  { value: 'editor', label: 'Editor', hint: 'Can make changes' },
];

export const ROLE_LABEL = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status}).`, response.status);
  }
  return payload;
}

// ------------------------------------------------------------------ auth

export const auth = {
  me: () => request('/api/auth/me'),
  // `identifier` is a username or an email; the server accepts either.
  signIn: (identifier, password) =>
    request('/api/auth/signin', { method: 'POST', body: { identifier, password } }),
  signUp: ({ email, username, password, displayName }) =>
    request('/api/auth/signup', {
      method: 'POST',
      body: { email, username, password, display_name: displayName },
    }),
  signOut: () => request('/api/auth/signout', { method: 'POST' }),
  updateMe: (patch) => request('/api/auth/me', { method: 'PATCH', body: patch }),
};

// ------------------------------------------------------------- documents

export const docs = {
  list: () => request('/api/documents').then((r) => r.documents),
  create: (title) =>
    request('/api/documents', { method: 'POST', body: { title } }).then((r) => r.document),
  get: (id) => request(`/api/documents/${id}`),
  rename: (id, title) =>
    request(`/api/documents/${id}`, { method: 'PATCH', body: { title } }).then((r) => r.document),
  remove: (id) => request(`/api/documents/${id}`, { method: 'DELETE' }),

  listShares: (id) => request(`/api/documents/${id}/shares`).then((r) => r.shares),
  // `person` is a username or an email.
  share: (id, person, role) =>
    request(`/api/documents/${id}/shares`, { method: 'POST', body: { person, role } }),
  updateShare: (id, userId, role) =>
    request(`/api/documents/${id}/shares/${userId}`, { method: 'PATCH', body: { role } }),
  removeShare: (id, userId) =>
    request(`/api/documents/${id}/shares/${userId}`, { method: 'DELETE' }),

  listVersions: (id) => request(`/api/documents/${id}/versions`).then((r) => r.versions),
  nameVersion: (id, label) =>
    request(`/api/documents/${id}/versions`, { method: 'POST', body: { label } }),
  renameVersion: (id, versionId, label) =>
    request(`/api/documents/${id}/versions/${versionId}`, { method: 'PATCH', body: { label } }),

  /** The snapshot itself, as raw CRDT bytes. */
  async versionState(id, versionId) {
    const response = await fetch(`/api/documents/${id}/versions/${versionId}`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new ApiError('Could not load that version.', response.status);
    }
    return new Uint8Array(await response.arrayBuffer());
  },

  listComments: (id) => request(`/api/documents/${id}/comments`).then((r) => r.comments),
  addComment: (id, body, quote) =>
    request(`/api/documents/${id}/comments`, { method: 'POST', body: { body, quote } }).then(
      (r) => r.comment
    ),
  setCommentResolved: (id, commentId, resolved) =>
    request(`/api/documents/${id}/comments/${commentId}`, {
      method: 'PATCH',
      body: { resolved },
    }),
  deleteComment: (id, commentId) =>
    request(`/api/documents/${id}/comments/${commentId}`, { method: 'DELETE' }),
};

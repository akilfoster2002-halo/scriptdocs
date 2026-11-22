import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

function wsBase() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

/**
 * Opens one Yjs document per script with a websocket provider alongside it.
 * The server authenticates the upgrade from the session cookie, so no
 * token is passed here.
 */
export function useCollab({ docId, identity }) {
  const [state, setState] = useState({ ydoc: null, provider: null });
  const [connection, setConnection] = useState('connecting');
  const [peers, setPeers] = useState([]);
  const failuresRef = useRef(0);

  useEffect(() => {
    if (!docId) return;

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(wsBase(), 'collab', ydoc, {
      params: { doc: docId },
      maxBackoffTime: 10000,
    });

    const onStatus = ({ status }) => {
      if (status === 'connected') {
        failuresRef.current = 0;
        setConnection('connected');
      } else {
        setConnection((prev) => (prev === 'error' ? 'error' : 'connecting'));
      }
    };
    // A rejected upgrade (401/403) surfaces only as a closed socket, so
    // after several failures stop claiming we are still connecting.
    const onClosed = () => {
      failuresRef.current += 1;
      if (failuresRef.current >= 4) setConnection('error');
    };

    provider.on('status', onStatus);
    provider.on('connection-close', onClosed);
    provider.on('connection-error', onClosed);

    setState({ ydoc, provider });

    return () => {
      provider.off('status', onStatus);
      provider.off('connection-close', onClosed);
      provider.off('connection-error', onClosed);
      provider.awareness.setLocalState(null);
      provider.destroy();
      ydoc.destroy();
      failuresRef.current = 0;
      setState({ ydoc: null, provider: null });
      setPeers([]);
    };
  }, [docId]);

  // Publish who we are, and track everyone else.
  useEffect(() => {
    const provider = state.provider;
    if (!provider || !identity) return;

    provider.awareness.setLocalStateField('user', identity);

    const onChange = () => {
      const entries = [];
      provider.awareness.getStates().forEach((value, clientId) => {
        if (clientId === provider.awareness.clientID) return;
        if (value?.user) entries.push({ clientId, ...value.user });
      });
      // One badge per person, even with several tabs open.
      const unique = new Map();
      for (const entry of entries) unique.set(entry.id || entry.clientId, entry);
      setPeers([...unique.values()]);
    };

    provider.awareness.on('change', onChange);
    onChange();
    return () => provider.awareness.off('change', onChange);
  }, [state.provider, identity?.id, identity?.name, identity?.color]);

  return { ...state, connection, peers };
}

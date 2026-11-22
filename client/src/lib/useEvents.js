import { useEffect, useRef } from 'react';

function eventsUrl(docId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = docId ? `?doc=${encodeURIComponent(docId)}` : '';
  return `${protocol}//${window.location.host}/events${query}`;
}

/**
 * Subscribes to the server's notification channel and calls `onEvent` for
 * each message. Reconnects with backoff, and keeps a ping going so idle
 * proxies do not close the socket.
 */
export function useEvents(docId, onEvent) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let socket = null;
    let pingTimer = null;
    let retryTimer = null;
    let attempt = 0;
    let closed = false;

    const open = () => {
      if (closed) return;
      socket = new WebSocket(eventsUrl(docId));

      socket.onopen = () => {
        attempt = 0;
        pingTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
        }, 25000);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type && payload.type !== 'pong' && payload.type !== 'ready') {
            handlerRef.current?.(payload);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      socket.onclose = () => {
        clearInterval(pingTimer);
        if (closed) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
        retryTimer = setTimeout(open, delay);
      };

      socket.onerror = () => socket?.close();
    };

    open();

    return () => {
      closed = true;
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [docId]);
}

import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getInitData } from '../lib/telegram.js';

const SocketContext = createContext({ socket: null, isConnected: false });

export function SocketProvider({ enabled = true, children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSocket(null);
      setIsConnected(false);
      return undefined;
    }

    const client = io(
      import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || undefined,
      {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 8_000,
        timeout: 10_000,
        auth(callback) {
          callback({ initData: getInitData() });
        },
      },
    );

    setSocket(client);
    client.on('connect', () => setIsConnected(true));
    client.on('disconnect', () => setIsConnected(false));
    client.on('connect_error', (error) => {
      setIsConnected(false);
      console.warn('Real-time chat is reconnecting:', error.message);
    });

    const heartbeat = window.setInterval(() => {
      if (client.connected) client.emit('presence_ping');
    }, 30_000);

    return () => {
      window.clearInterval(heartbeat);
      client.removeAllListeners();
      client.disconnect();
    };
  }, [enabled]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

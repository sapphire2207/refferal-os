'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = apiClient.getToken();
    if (!token) return;

    const s = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    s.on('connect', () => {
      setIsConnected(true);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    // Targeted real-time cache invalidations - no heavy polling needed!
    s.on('referral.stage.changed', (data: { referralId: string; stage: string }) => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      if (data?.referralId) {
        queryClient.invalidateQueries({ queryKey: ['referral', data.referralId] });
      }
      toast.info(`Referral transition: moved to ${data.stage.replace('_', ' ')}`);
    });

    s.on('referral.updated', (data: { referralId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      if (data?.referralId) {
        queryClient.invalidateQueries({ queryKey: ['referral', data.referralId] });
      }
    });

    s.on('notification.new', (notification: { title: string; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.info(notification.title || 'New Notification', {
        description: notification.message,
      });
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [queryClient]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, CheckCheck, Loader2, AlertCircle, Info, Calendar } from 'lucide-react';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get<{ items: NotificationItem[] }>('/notifications');
      return res.items || [];
    },
    staleTime: 30 * 1000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/notifications/mark-all-read', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] font-bold text-white dark:bg-white dark:text-black">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-1.5"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              Loading alerts...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No notifications at this time
            </div>
          ) : (
            notifications.slice(0, 10).map((n) => (
              <div
                key={n.id}
                onClick={() => !n.isRead && markSingleReadMutation.mutate(n.id)}
                className={`p-3 text-xs transition-colors cursor-pointer hover:bg-muted/40 ${
                  !n.isRead ? 'bg-muted/20 font-medium' : 'text-muted-foreground'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-foreground">{n.title}</span>
                  {!n.isRead && (
                    <span className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                  {n.message}
                </p>
                <span className="text-[10px] text-muted-foreground/80 mt-1 block font-mono">
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

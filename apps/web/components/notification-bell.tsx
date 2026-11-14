'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  referralId?: string | null;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['notifications'],
    queryFn: async () => apiClient.get<any>('/notifications'),
    staleTime: 15 * 1000,
  });

  const rawList = extractApiList<any>(data);
  const notifications: NotificationItem[] = rawList.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    isRead: Boolean(n.read ?? n.isRead ?? false),
    createdAt: n.createdAt,
    referralId: n.referralId,
  }));

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

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markSingleReadMutation.mutate(item.id);
    }
    if (item.referralId) {
      router.push(`/referrals/${item.referralId}`);
    }
  };

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
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow-2xs">
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
                onClick={() => handleNotificationClick(n)}
                className={`p-3 text-xs transition-colors cursor-pointer hover:bg-muted/40 ${
                  !n.isRead ? 'bg-muted/20 font-medium' : 'text-muted-foreground'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-foreground">{n.title}</span>
                  {!n.isRead && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                  {n.message}
                </p>
                <span className="text-[10px] text-muted-foreground/80 mt-1 block font-medium tabular-nums">
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="p-2 border-t border-border/60 text-center bg-muted/20">
          <Link
            href="/notifications"
            className="text-xs font-semibold text-primary hover:underline block py-1"
          >
            View All Notifications →
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

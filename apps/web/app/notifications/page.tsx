'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: notifications = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get<{ items: any[] }>('/notifications');
      return res.items || [];
    },
    staleTime: 30 * 1000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/notifications/mark-all-read', {}),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const displayedNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <AppLayout title="Notifications & Operational Alerts">
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Notifications & Operational Alerts
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time workflow transitions, urgent tasks, and clinical assignments
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={notifications.every((n) => n.isRead) || markAllReadMutation.isPending}
              className="h-8 gap-1.5 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black text-xs"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark All Read</span>
            </Button>
          </div>
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className="h-7 text-xs"
          >
            All Alerts ({notifications.length})
          </Button>
          <Button
            variant={filter === 'unread' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unread')}
            className="h-7 text-xs"
          >
            Unread ({notifications.filter((n) => !n.isRead).length})
          </Button>
        </div>

        {/* Notifications List */}
        <Card className="border border-border/80">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                Loading alerts...
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No notifications to display.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {displayedNotifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markSingleReadMutation.mutate(n.id)}
                    className={`p-4 flex items-start justify-between gap-4 transition-colors cursor-pointer text-xs ${
                      !n.isRead ? 'bg-muted/30 font-medium' : 'hover:bg-muted/20 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background">
                        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-xs">{n.title}</span>
                          {!n.isRead && (
                            <Badge variant="default" className="text-[9px] h-4 px-1.5 bg-black text-white dark:bg-white dark:text-black">
                              NEW
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {n.message}
                        </p>
                        <span className="text-[10px] text-muted-foreground/70 mt-1 block font-mono">
                          {new Date(n.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {!n.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          markSingleReadMutation.mutate(n.id);
                        }}
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground shrink-0"
                      >
                        Mark Read
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

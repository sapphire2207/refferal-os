'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/state-views';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ['notifications'],
    queryFn: async () => apiClient.get<any>('/notifications'),
    staleTime: 30 * 1000,
  });

  const notifications = extractApiList<any>(data);

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
        <PageHeader>
          <div>
            <PageHeaderHeading>Notifications & Operational Alerts</PageHeaderHeading>
            <PageHeaderDescription>
              Real-time workflow transitions, urgent tasks, and clinical assignments
            </PageHeaderDescription>
          </div>
          <PageHeaderActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs font-medium border-border"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={notifications.every((n) => n.isRead) || markAllReadMutation.isPending}
              className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark All Read</span>
            </Button>
          </PageHeaderActions>
        </PageHeader>

        {/* Filter Toggle Segmented Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-lg w-fit border border-border/80">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === 'all'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Alerts ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Unread ({notifications.filter((n) => !n.isRead).length})
          </button>
        </div>

        {/* Notifications List */}
        <Card className="border border-border/80 bg-card shadow-2xs">
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message="Loading operational alerts…" />
            ) : displayedNotifications.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No notifications"
                description={
                  filter === 'unread'
                    ? 'You have caught up with all unread notifications.'
                    : 'No operational alerts recorded in this session.'
                }
                actionLabel={filter === 'unread' ? 'Show All' : undefined}
                onAction={() => setFilter('all')}
              />
            ) : (
              <div className="divide-y divide-border/60">
                {displayedNotifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markSingleReadMutation.mutate(n.id)}
                    className={`p-4 flex items-start justify-between gap-4 transition-colors cursor-pointer text-xs ${
                      !n.isRead ? 'bg-accent/40 font-medium' : 'hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground shrink-0">
                        <Bell className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-xs">{n.title}</span>
                          {!n.isRead && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold bg-primary text-primary-foreground">
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {n.message}
                        </p>
                        <span className="text-[10px] text-muted-foreground/70 mt-1 block ">
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
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground shrink-0 font-medium"
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

'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/state-views';
import { ScrollText, Search, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

interface AuditRecord {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: any;
  ipAddress?: string;
  createdAt: string;
}

export default function AuditAdminPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const debouncedAction = useDebounce(actionFilter, 350);
  const debouncedEntity = useDebounce(entityFilter, 350);

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ['audit-logs', { action: debouncedAction, entityType: debouncedEntity }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedAction.trim()) params.set('action', debouncedAction.trim());
      if (debouncedEntity.trim()) params.set('entityType', debouncedEntity.trim());
      params.set('limit', '50');
      return apiClient.get<any>(`/audit?${params.toString()}`);
    },
    staleTime: 60 * 1000,
  });

  const logs = extractApiList<AuditRecord>(data);

  return (
    <AppLayout title="HIPAA Compliance Audit Trail">
      <div className="space-y-6">
        <PageHeader>
          <div>
            <PageHeaderHeading>Immutable HIPAA Surveillance Log</PageHeaderHeading>
            <PageHeaderDescription>
              Cryptographic audit trail tracking patient record access, transitions, downloads, and administrative actions
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
              <span>Refresh Ledger</span>
            </Button>
          </PageHeaderActions>
        </PageHeader>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Filter by Action (e.g. REFERRAL_STAGE_CHANGE, PHI_ACCESS)..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 max-w-xs text-xs bg-white border-border"
          />
          <Input
            placeholder="Filter by Entity Type (e.g. Referral, Patient, Document)..."
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="h-8 max-w-xs text-xs bg-white border-border"
          />
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {isLoading ? 'Querying ledger...' : `${logs.length} audit records retrieved`}
          </span>
        </div>

        {/* Audit Log Table */}
        <Card className="border border-border/80 bg-card shadow-2xs">
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message="Querying cryptographic audit ledger..." />
            ) : logs.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="No audit events found"
                description="No security or transition events match your current filter parameters."
                actionLabel={actionFilter || entityFilter ? 'Clear Filters' : undefined}
                onAction={() => {
                  setActionFilter('');
                  setEntityFilter('');
                }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                      <th className="py-2.5 px-4 font-semibold">Action</th>
                      <th className="py-2.5 px-4 font-semibold">Entity</th>
                      <th className="py-2.5 px-4 font-semibold">User ID</th>
                      <th className="py-2.5 px-4 font-semibold">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors text-[11px]">
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-foreground font-sans">
                          <Badge variant="outline" className="text-[10px] uppercase font-mono border-zinc-200 bg-zinc-50 text-zinc-700">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {log.entityType} ({log.entityId ? log.entityId.slice(0, 8) : 'N/A'})
                        </td>
                        <td className="py-3 px-4 text-foreground truncate max-w-[150px]">
                          {log.userId ? log.userId.slice(0, 8) : 'SYSTEM'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {log.ipAddress || '127.0.0.1'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

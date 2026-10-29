'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-context';
import { canAccessAdmin } from '@/lib/permissions';
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
  const { user } = useAuth();
  const canAudit = canAccessAdmin(user?.roles);
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
    enabled: canAudit,
    staleTime: 60 * 1000,
  });

  const logs = extractApiList<AuditRecord>(data);

  if (!canAudit) {
    return (
      <AppLayout title="Access Restricted">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
          <div className="p-3 bg-rose-500/10 text-rose-600 rounded-full">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Access Restricted to Compliance & Admins</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              HIPAA surveillance audit logs contain protected compliance event trails and require authorized Compliance Officer or Administrator credentials.
            </p>
          </div>
          <Link href="/dashboard">
            <Button size="sm" variant="outline" className="text-xs">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

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
            aria-label="Filter by Action"
            placeholder="Filter by Action (e.g. REFERRAL_STAGE_CHANGE, PHI_ACCESS)…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 max-w-xs text-xs bg-background border-border/80"
          />
          <Input
            aria-label="Filter by Entity Type"
            placeholder="Filter by Entity Type (e.g. Referral, Patient, Document)…"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="h-8 max-w-xs text-xs bg-background border-border/80"
          />
          <span className="text-xs text-muted-foreground font-medium ml-auto tabular-nums">
            {isLoading ? 'Querying ledger…' : `${logs.length} audit records retrieved`}
          </span>
        </div>

        {/* Audit Log Table */}
        <Card className="border border-border/80 bg-card shadow-xs overflow-hidden rounded-xl">
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message="Querying cryptographic audit ledger…" />
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
                  <tbody className="divide-y divide-border/60 ">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors text-[11px]">
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-foreground font-sans">
                          <Badge variant="outline" className="text-[10px] uppercase font-semibold border-border bg-muted/40 text-foreground">
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

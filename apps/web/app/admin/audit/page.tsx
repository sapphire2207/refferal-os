'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

  const { data, isLoading, refetch, isFetching } = useQuery<{
    items: AuditRecord[];
    total: number;
  }>({
    queryKey: ['audit-logs', { action: debouncedAction, entityType: debouncedEntity }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedAction.trim()) params.set('action', debouncedAction.trim());
      if (debouncedEntity.trim()) params.set('entityType', debouncedEntity.trim());
      params.set('limit', '50');
      return apiClient.get<{ items: AuditRecord[]; total: number }>(`/audit?${params.toString()}`);
    },
    staleTime: 60 * 1000,
  });

  const logs = data?.items || [];

  return (
    <AppLayout title="HIPAA Compliance Audit Trail">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Immutable HIPAA & PHI Surveillance Log
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comprehensive audit trail tracking patient record access, transitions, downloads, and administrative actions
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh Audit Log</span>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Filter by Action (e.g. REFERRAL_STAGE_CHANGE, PHI_ACCESS)..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />
          <Input
            placeholder="Filter by Entity Type (e.g. Referral, Patient, Document)..."
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {isLoading ? 'Querying ledger...' : `${logs.length} audit records retrieved`}
          </span>
        </div>

        {/* Audit Log Table */}
        <Card className="border border-border/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-4 font-semibold">Action</th>
                    <th className="py-2.5 px-4 font-semibold">Entity</th>
                    <th className="py-2.5 px-4 font-semibold">User ID</th>
                    <th className="py-2.5 px-4 font-semibold">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground font-sans">
                        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                        Querying cryptographic audit trail...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground font-sans">
                        No audit events matching criteria.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors text-[11px]">
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-foreground font-sans">
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

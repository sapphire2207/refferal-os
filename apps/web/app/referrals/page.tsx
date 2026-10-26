'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Kanban,
  List,
  Search,
  PlusCircle,
  Filter,
  ArrowRight,
  MoreVertical,
  Clock,
  AlertTriangle,
  UserCheck,
  Calendar,
  Stethoscope,
  FileCheck2,
  Receipt,
  Inbox,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority } from '@heals/types';
import { toast } from 'sonner';

interface ReferralRecord {
  id: string;
  trackingNumber: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    mrn: string;
    dateOfBirth: string;
  };
  pipelineStage: PipelineStage;
  workStatus: WorkStatus;
  priority: Priority;
  site: string;
  version: number;
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
  updatedAt: string;
}

const STAGES: { stage: PipelineStage; label: string; icon: React.ElementType }[] = [
  { stage: PipelineStage.INTAKE, label: '1. Intake', icon: Inbox },
  { stage: PipelineStage.CLINICAL_REVIEW, label: '2. Clinical Review', icon: Stethoscope },
  { stage: PipelineStage.SCHEDULING, label: '3. Scheduling', icon: Calendar },
  { stage: PipelineStage.NP_VISIT, label: '4. NP Visit', icon: UserCheck },
  { stage: PipelineStage.NOTES_QA, label: '5. Notes QA', icon: FileCheck2 },
  { stage: PipelineStage.BILLING, label: '6. Billing', icon: Receipt },
];

export default function ReferralsPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Fetch referrals from real backend API
  const { data, isLoading, refetch, isFetching } = useQuery<{
    items: ReferralRecord[];
    total: number;
  }>({
    queryKey: ['referrals', { stage: stageFilter, priority: priorityFilter, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stageFilter !== 'ALL') params.set('stage', stageFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', '100');
      return apiClient.get<{ items: ReferralRecord[]; total: number }>(`/referrals?${params.toString()}`);
    },
    staleTime: 45 * 1000,
  });

  const referrals = data?.items || [];

  // Transition Mutation with gate check error handling & rollback
  const transitionMutation = useMutation({
    mutationFn: async ({
      id,
      targetStage,
      version,
    }: {
      id: string;
      targetStage: PipelineStage;
      version: number;
    }) => {
      return apiClient.post(
        `/referrals/${id}/transitions`,
        {
          targetStage,
          reason: 'Manual pipeline progression',
          version,
        },
        { idempotencyKey: `trans-${id}-${Date.now()}` },
      );
    },
    onMutate: async ({ id, targetStage }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['referrals'] });
      const previousData = queryClient.getQueryData(['referrals']);

      queryClient.setQueriesData({ queryKey: ['referrals'] }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((item: ReferralRecord) =>
            item.id === id ? { ...item, pipelineStage: targetStage, version: item.version + 1 } : item,
          ),
        };
      });

      return { previousData };
    },
    onError: (err: any, variables, context) => {
      // Rollback on failure
      if (context?.previousData) {
        queryClient.setQueriesData({ queryKey: ['referrals'] }, context.previousData);
      }
      toast.error('Stage Gate Rejected Transition', {
        description: err.message || 'Workflow gate check failed. Please ensure prerequisite steps are completed.',
      });
    },
    onSuccess: (result, variables) => {
      toast.success(`Referral moved to ${variables.targetStage.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
  });

  // Calculate next stage in the authoritative linear path
  const getNextStage = (current: PipelineStage): PipelineStage | null => {
    switch (current) {
      case PipelineStage.INTAKE:
        return PipelineStage.CLINICAL_REVIEW;
      case PipelineStage.CLINICAL_REVIEW:
        return PipelineStage.SCHEDULING;
      case PipelineStage.SCHEDULING:
        return PipelineStage.NP_VISIT;
      case PipelineStage.NP_VISIT:
        return PipelineStage.NOTES_QA;
      case PipelineStage.NOTES_QA:
        return PipelineStage.BILLING;
      default:
        return null;
    }
  };

  return (
    <AppLayout title="Referrals Pipeline">
      <div className="space-y-5">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Clinical Referral Pipeline
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authoritative 6-stage workflow engine with optimistic concurrency and gate enforcement
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
            <div className="border border-border rounded-md p-0.5 flex bg-muted/40">
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`p-1.5 rounded-sm text-xs font-medium transition-colors ${
                  viewMode === 'board' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground'
                }`}
                title="Kanban Board View"
              >
                <Kanban className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-sm text-xs font-medium transition-colors ${
                  viewMode === 'list' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground'
                }`}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
            <Link href="/referrals/new">
              <Button size="sm" className="h-8 gap-1.5 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 text-xs font-medium">
                <PlusCircle className="h-3.5 w-3.5" />
                <span>New Referral</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by patient name, MRN, tracking #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">All Stages (Funnel)</option>
            {STAGES.map((s) => (
              <option key={s.stage} value={s.stage}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">All Priorities</option>
            <option value={Priority.ROUTINE}>Routine</option>
            <option value={Priority.URGENT}>Urgent</option>
            <option value={Priority.STAT}>STAT</option>
          </select>

          <div className="ml-auto text-xs text-muted-foreground font-mono">
            {isLoading ? 'Counting records...' : `${referrals.length} referrals found`}
          </div>
        </div>

        {/* Kanban Board View */}
        {viewMode === 'board' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-start overflow-x-auto pb-4">
            {STAGES.map((col) => {
              const ColIcon = col.icon;
              const columnReferrals = referrals.filter((r) => r.pipelineStage === col.stage);

              return (
                <div
                  key={col.stage}
                  className="flex flex-col rounded-lg border border-border/80 bg-muted/20 min-w-[220px]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between p-3 border-b border-border/60 bg-muted/30">
                    <div className="flex items-center gap-1.5">
                      <ColIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground truncate">
                        {col.label}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
                      {columnReferrals.length}
                    </Badge>
                  </div>

                  {/* Cards Container */}
                  <div className="p-2 space-y-2.5 min-h-[400px] max-h-[calc(100vh-280px)] overflow-y-auto">
                    {columnReferrals.length === 0 ? (
                      <div className="py-8 text-center text-[11px] text-muted-foreground/70 italic">
                        No referrals in this stage
                      </div>
                    ) : (
                      columnReferrals.map((ref) => {
                        const nextStage = getNextStage(ref.pipelineStage);

                        return (
                          <div
                            key={ref.id}
                            className="group relative rounded-md border border-border/80 bg-card p-3 shadow-2xs hover:border-foreground/30 transition-all"
                          >
                            <div className="flex items-start justify-between gap-1 mb-1.5">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {ref.trackingNumber}
                              </span>
                              {ref.priority === Priority.STAT && (
                                <Badge variant="destructive" className="text-[9px] h-3.5 px-1 uppercase font-bold">
                                  STAT
                                </Badge>
                              )}
                              {ref.priority === Priority.URGENT && (
                                <Badge variant="secondary" className="text-[9px] h-3.5 px-1 uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                  URGENT
                                </Badge>
                              )}
                            </div>

                            <Link
                              href={`/referrals/${ref.id}`}
                              className="font-semibold text-xs text-foreground hover:underline line-clamp-1"
                            >
                              {ref.patient?.firstName} {ref.patient?.lastName}
                            </Link>

                            <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between">
                              <span>MRN: {ref.patient?.mrn || 'N/A'}</span>
                              <span>Site: {ref.site}</span>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between">
                              <Badge
                                variant="outline"
                                className={`text-[9px] h-4 px-1 ${
                                  ref.workStatus === WorkStatus.BLOCKED_NEEDS_INFO
                                    ? 'border-amber-500/40 text-amber-600 bg-amber-500/10'
                                    : ref.workStatus === WorkStatus.IN_PROGRESS
                                    ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
                                    : 'border-border text-muted-foreground'
                                }`}
                              >
                                {ref.workStatus.replace('_', ' ')}
                              </Badge>

                              <div className="flex items-center gap-1">
                                {nextStage && (
                                  <button
                                    onClick={() =>
                                      transitionMutation.mutate({
                                        id: ref.id,
                                        targetStage: nextStage,
                                        version: ref.version,
                                      })
                                    }
                                    disabled={transitionMutation.isPending}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title={`Advance to ${nextStage.replace('_', ' ')}`}
                                  >
                                    <ArrowRight className="h-3 w-3" />
                                  </button>
                                )}
                                <Link
                                  href={`/referrals/${ref.id}`}
                                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                                >
                                  View
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table List View */
          <Card className="border border-border/80">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Tracking #</th>
                      <th className="py-2.5 px-4 font-semibold">Patient</th>
                      <th className="py-2.5 px-4 font-semibold">Stage</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                      <th className="py-2.5 px-4 font-semibold">Priority</th>
                      <th className="py-2.5 px-4 font-semibold">Site</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {referrals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                          No referrals matching query.
                        </td>
                      </tr>
                    ) : (
                      referrals.map((ref) => {
                        const nextStage = getNextStage(ref.pipelineStage);

                        return (
                          <tr key={ref.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4 font-mono font-medium">{ref.trackingNumber}</td>
                            <td className="py-3 px-4">
                              <Link
                                href={`/referrals/${ref.id}`}
                                className="font-semibold text-foreground hover:underline"
                              >
                                {ref.patient?.firstName} {ref.patient?.lastName}
                              </Link>
                              <div className="text-[10px] text-muted-foreground">
                                MRN: {ref.patient?.mrn || 'N/A'}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-medium">{ref.pipelineStage.replace('_', ' ')}</td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  ref.workStatus === WorkStatus.BLOCKED_NEEDS_INFO
                                    ? 'border-amber-500/40 text-amber-600 bg-amber-500/10'
                                    : ref.workStatus === WorkStatus.IN_PROGRESS
                                    ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
                                    : 'border-border text-muted-foreground'
                                }`}
                              >
                                {ref.workStatus.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              {ref.priority === Priority.STAT ? (
                                <Badge variant="destructive" className="text-[9px] uppercase font-bold">
                                  STAT
                                </Badge>
                              ) : ref.priority === Priority.URGENT ? (
                                <Badge variant="secondary" className="text-[9px] uppercase bg-amber-500/15 text-amber-600">
                                  URGENT
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">Routine</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">{ref.site}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {nextStage && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      transitionMutation.mutate({
                                        id: ref.id,
                                        targetStage: nextStage,
                                        version: ref.version,
                                      })
                                    }
                                    disabled={transitionMutation.isPending}
                                    className="h-6 text-[10px] px-2"
                                  >
                                    Advance
                                    <ArrowRight className="h-2.5 w-2.5 ml-1" />
                                  </Button>
                                )}
                                <Link href={`/referrals/${ref.id}`}>
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                                    Details
                                  </Button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useWorkspace } from '@/providers/workspace-context';
import { useAuth } from '@/providers/auth-context';
import { AppLayout } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  PlusCircle,
  Inbox,
  Stethoscope,
  Calendar,
  UserCheck,
  FileCheck2,
  Receipt,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  Activity,
  Loader2,
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority } from '@heals/types';

interface DashboardMetricsResponse {
  totalActive: number;
  byStage: Record<PipelineStage, number>;
  byStatus: Record<WorkStatus, number>;
}

interface ReferralSummary {
  id: string;
  trackingNumber: string;
  patient: {
    firstName: string;
    lastName: string;
    mrn: string;
    dateOfBirth: string;
  };
  pipelineStage: PipelineStage;
  workStatus: WorkStatus;
  priority: Priority;
  site: string;
  assignedTo?: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();

  // Fetch real aggregated metrics from NestJS backend
  const { data: metrics, isLoading: isMetricsLoading } = useQuery<DashboardMetricsResponse>({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      return apiClient.get<DashboardMetricsResponse>('/referrals/dashboard/metrics');
    },
    staleTime: 60 * 1000,
  });

  // Fetch role-specific operational queue
  const currentStage = activeWorkspace?.primaryStage as PipelineStage | undefined;

  const { data: queueData, isLoading: isQueueLoading } = useQuery<{
    items: ReferralSummary[];
    total: number;
  }>({
    queryKey: ['referrals', { stage: currentStage, limit: 6 }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentStage) params.set('stage', currentStage);
      params.set('limit', '6');
      return apiClient.get<{ items: ReferralSummary[]; total: number }>(`/referrals?${params.toString()}`);
    },
    staleTime: 45 * 1000,
  });

  const stageCounts = metrics?.byStage || {
    [PipelineStage.INTAKE]: 0,
    [PipelineStage.CLINICAL_REVIEW]: 0,
    [PipelineStage.SCHEDULING]: 0,
    [PipelineStage.NP_VISIT]: 0,
    [PipelineStage.NOTES_QA]: 0,
    [PipelineStage.BILLING]: 0,
  };

  const statusCounts = metrics?.byStatus || {
    [WorkStatus.PENDING]: 0,
    [WorkStatus.IN_PROGRESS]: 0,
    [WorkStatus.BLOCKED_NEEDS_INFO]: 0,
    [WorkStatus.ON_HOLD]: 0,
    [WorkStatus.COMPLETED]: 0,
  };

  return (
    <AppLayout title={`${activeWorkspace?.name || 'Operations'} Dashboard`}>
      <div className="space-y-6">
        {/* Welcome & Role Context Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Hello, {user?.firstName || 'Staff'}
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {activeWorkspace?.badge || 'Intake'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              {activeWorkspace?.description || 'Operational referral overview and patient management queue.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/referrals/new">
              <Button size="sm" className="h-8 gap-1.5 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 text-xs">
                <PlusCircle className="h-3.5 w-3.5" />
                <span>New Referral</span>
              </Button>
            </Link>
            <Link href="/referrals">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <span>View Full Pipeline</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Dynamic Metric Cards based on real backend metrics */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="border border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Active Referrals
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tracking-tight">
                {isMetricsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  metrics?.totalActive ?? 0
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Across your authorized site scopes
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {activeWorkspace?.id === 'clinical_review'
                  ? 'Awaiting Triage'
                  : activeWorkspace?.id === 'scheduling'
                  ? 'Ready to Schedule'
                  : activeWorkspace?.id === 'np_visit'
                  ? 'Visits Pending'
                  : activeWorkspace?.id === 'clinical_qa'
                  ? 'Notes QA Queue'
                  : activeWorkspace?.id === 'billing'
                  ? 'Billing Queue'
                  : 'Intake Queue'}
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tracking-tight">
                {isMetricsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : currentStage ? (
                  stageCounts[currentStage] || 0
                ) : (
                  stageCounts[PipelineStage.INTAKE] || 0
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Current active items in stage
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Blocked / Needs Info
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
                {isMetricsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  statusCounts[WorkStatus.BLOCKED_NEEDS_INFO] || 0
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Requires missing clinical document
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                In Progress
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tracking-tight">
                {isMetricsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  statusCounts[WorkStatus.IN_PROGRESS] || 0
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Actively being worked by clinicians
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 6-Stage Pipeline Funnel Overview */}
        <Card className="border border-border/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold tracking-tight">
                  Referral Pipeline Stage Distribution
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time caseload counts progressing through authoritative gates
                </CardDescription>
              </div>
              <Link href="/referrals">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                  View Kanban Board
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { stage: PipelineStage.INTAKE, label: '1. Intake', count: stageCounts.INTAKE, icon: Inbox },
                { stage: PipelineStage.CLINICAL_REVIEW, label: '2. Review', count: stageCounts.CLINICAL_REVIEW, icon: Stethoscope },
                { stage: PipelineStage.SCHEDULING, label: '3. Schedule', count: stageCounts.SCHEDULING, icon: Calendar },
                { stage: PipelineStage.NP_VISIT, label: '4. NP Visit', count: stageCounts.NP_VISIT, icon: UserCheck },
                { stage: PipelineStage.NOTES_QA, label: '5. Notes QA', count: stageCounts.NOTES_QA, icon: FileCheck2 },
                { stage: PipelineStage.BILLING, label: '6. Billing', count: stageCounts.BILLING, icon: Receipt },
              ].map((item) => {
                const isCurrent = activeWorkspace?.primaryStage === item.stage;
                const ItemIcon = item.icon;

                return (
                  <Link
                    key={item.stage}
                    href={`/referrals?stage=${item.stage}`}
                    className={`flex flex-col p-3 rounded-lg border transition-all hover:bg-accent/50 ${
                      isCurrent
                        ? 'border-primary bg-muted/30 shadow-2xs'
                        : 'border-border/60 bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between text-muted-foreground mb-2">
                      <ItemIcon className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-mono">Stage</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">
                      {isMetricsLoading ? '-' : item.count}
                    </span>
                    <span className="text-xs text-muted-foreground truncate font-medium">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Priority Operational Work Queue for the Active Workspace */}
        <Card className="border border-border/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold tracking-tight">
                  {activeWorkspace?.name} Priority Queue
                </CardTitle>
                <CardDescription className="text-xs">
                  Highest priority referrals requiring staff action
                </CardDescription>
              </div>
              <Link href={activeWorkspace?.defaultRoute || '/referrals'}>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  <span>View All Queue</span>
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isQueueLoading ? (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading operational queue...
              </div>
            ) : !queueData?.items || queueData.items.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                No pending referrals in this workspace queue. All caught up!
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {queueData.items.map((ref) => (
                  <div
                    key={ref.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 px-5 hover:bg-muted/30 transition-colors gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs font-semibold">
                        {ref.trackingNumber?.slice(-3) || 'REF'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/referrals/${ref.id}`}
                            className="font-semibold text-xs text-foreground hover:underline truncate"
                          >
                            {ref.patient?.firstName} {ref.patient?.lastName}
                          </Link>
                          {ref.priority === Priority.STAT && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1 uppercase font-bold">
                              STAT
                            </Badge>
                          )}
                          {ref.priority === Priority.URGENT && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                              URGENT
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span>MRN: {ref.patient?.mrn || 'N/A'}</span>
                          <span>•</span>
                          <span>Site: {ref.site}</span>
                          <span>•</span>
                          <span>Stage: {ref.pipelineStage.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                      <Link href={`/referrals/${ref.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                          Details
                        </Button>
                      </Link>
                    </div>
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

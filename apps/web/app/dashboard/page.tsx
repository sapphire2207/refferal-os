'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { DashboardDataTable } from './dashboard-data-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Plus,
  Calendar,
  Stethoscope,
  Inbox,
  Layers,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { PipelineStage, WorkStatus, Priority } from '@heals/types';

interface DashboardMetricsResponse {
  totalActive: number;
  byStage: Record<PipelineStage, number>;
  byStatus: Record<WorkStatus, number>;
}

interface ReferralRecord {
  id: string;
  trackingNumber: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    medicalRecordNumber?: string;
    dateOfBirth?: string;
  };
  pipelineStage: PipelineStage;
  workStatus: WorkStatus;
  priority: Priority;
  site: string;
  insurancePayer?: string;
  insuranceMemberId?: string;
  assignedRole?: string;
  assignedTo?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Chart dataset with realistic trend curve matching modern clinical operations
const CHART_DATA_30_DAYS = [
  { date: 'Apr 7', referrals: 4, completed: 2 },
  { date: 'Apr 13', referrals: 7, completed: 3 },
  { date: 'Apr 19', referrals: 5, completed: 4 },
  { date: 'Apr 26', referrals: 9, completed: 5 },
  { date: 'May 2', referrals: 6, completed: 4 },
  { date: 'May 8', referrals: 12, completed: 7 },
  { date: 'May 14', referrals: 8, completed: 6 },
  { date: 'May 21', referrals: 14, completed: 9 },
  { date: 'May 28', referrals: 11, completed: 8 },
  { date: 'Jun 3', referrals: 16, completed: 11 },
  { date: 'Jun 9', referrals: 13, completed: 10 },
  { date: 'Jun 15', referrals: 18, completed: 13 },
  { date: 'Jun 22', referrals: 15, completed: 12 },
  { date: 'Jun 30', referrals: 20, completed: 15 },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'INTAKE' | 'CLINICAL_REVIEW' | 'SCHEDULING' | 'URGENT'>('ALL');
  const [timeRange, setTimeRange] = useState<'3m' | '30d' | '7d'>('30d');

  // 1. Fetch real dashboard metrics
  const {
    data: metrics,
    isLoading: isMetricsLoading,
    isFetching: isFetchingMetrics,
    refetch: refetchMetrics,
  } = useQuery<DashboardMetricsResponse>({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      return apiClient.get<DashboardMetricsResponse>('/referrals/dashboard/metrics');
    },
    staleTime: 30 * 1000,
  });

  // 2. Fetch referrals from real backend API
  const {
    data: referralsRes,
    isLoading: isReferralsLoading,
    isFetching: isFetchingReferrals,
    refetch: refetchReferrals,
  } = useQuery<{
    data: ReferralRecord[];
    total: number;
  }>({
    queryKey: ['referrals-all-dashboard'],
    queryFn: async () => {
      return apiClient.get<{ data: ReferralRecord[]; total: number }>('/referrals?limit=100');
    },
    staleTime: 30 * 1000,
  });

  const isRefreshing = isFetchingMetrics || isFetchingReferrals;
  const handleRefresh = () => {
    refetchMetrics();
    refetchReferrals();
  };

  const chartData = useMemo(() => {
    if (timeRange === '7d') return CHART_DATA_30_DAYS.slice(-4);
    if (timeRange === '30d') return CHART_DATA_30_DAYS.slice(-8);
    return CHART_DATA_30_DAYS;
  }, [timeRange]);

  const allReferrals = useMemo(() => extractApiList<ReferralRecord>(referralsRes), [referralsRes]);

  // Stage counts
  const stageCounts = useMemo(() => {
    return (
      metrics?.byStage || {
        [PipelineStage.INTAKE]: allReferrals.filter((r) => r.pipelineStage === PipelineStage.INTAKE).length,
        [PipelineStage.CLINICAL_REVIEW]: allReferrals.filter((r) => r.pipelineStage === PipelineStage.CLINICAL_REVIEW).length,
        [PipelineStage.SCHEDULING]: allReferrals.filter((r) => r.pipelineStage === PipelineStage.SCHEDULING).length,
        [PipelineStage.NP_VISIT]: allReferrals.filter((r) => r.pipelineStage === PipelineStage.NP_VISIT).length,
        [PipelineStage.NOTES_QA]: allReferrals.filter((r) => r.pipelineStage === PipelineStage.NOTES_QA).length,
        [PipelineStage.BILLING]: allReferrals.filter((r) => r.pipelineStage === PipelineStage.BILLING).length,
      }
    );
  }, [metrics, allReferrals]);

  // Filtered referrals for the bottom table based on tab
  const filteredReferrals = useMemo(() => {
    return allReferrals.filter((r) => {
      if (activeTab === 'INTAKE' && r.pipelineStage !== PipelineStage.INTAKE) return false;
      if (activeTab === 'CLINICAL_REVIEW' && r.pipelineStage !== PipelineStage.CLINICAL_REVIEW) return false;
      if (activeTab === 'SCHEDULING' && r.pipelineStage !== PipelineStage.SCHEDULING) return false;
      if (activeTab === 'URGENT' && r.priority !== Priority.URGENT && r.priority !== Priority.STAT) return false;
      return true;
    });
  }, [allReferrals, activeTab]);

  const totalCount = allReferrals.length;
  const intakeCount = stageCounts[PipelineStage.INTAKE] || 0;
  const reviewCount = stageCounts[PipelineStage.CLINICAL_REVIEW] || 0;
  const schedCount = stageCounts[PipelineStage.SCHEDULING] || 0;
  const urgentCount = allReferrals.filter((r) => r.priority === Priority.URGENT || r.priority === Priority.STAT).length;

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6 pb-8">
        {/* Operations Command Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 border-b border-border/60">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Referral Operations Command</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-subtle" />
                Live Feed
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authoritative clinical triage, gate validations, and mobile NP encounter pipeline.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 gap-1.5 text-xs font-medium border-border/80 bg-background hover:bg-muted/60 shadow-2xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Link
              href="/referrals/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all focus-visible:ring-2 focus-visible:ring-primary/40 select-none"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Create Referral</span>
            </Link>
          </div>
        </div>

        {/* Priority Alert Banner: High-urgency triage prompt */}
        {urgentCount > 0 && (
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-foreground">
                  Action Required: {urgentCount} Urgent / STAT Patient Case{urgentCount === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  High-priority clinical intakes require review and provider assignment within 2-hour clinical turnaround SLAs.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('URGENT')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-2xs shrink-0"
            >
              <span>View Urgent Queue</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* ROW 1: 4 Key Metric Cards (Top-Tier SaaS Visual Hierarchy) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Active Pipeline"
            value={metrics?.totalActive ?? totalCount}
            delta="+12.5%"
            isPositive={true}
            icon={Layers}
            accentColor="blue"
            isLoading={isMetricsLoading && !metrics}
            subtext="Active across authorized scope"
          />

          <MetricCard
            title="Intake Triage Queue"
            value={intakeCount}
            delta="-20.0%"
            isPositive={false}
            icon={Inbox}
            accentColor="amber"
            isLoading={isMetricsLoading && !metrics}
            subtext="Awaiting insurance & eligibility triage"
          />

          <MetricCard
            title="Clinical MD/NP Review"
            value={reviewCount}
            delta="+12.5%"
            isPositive={true}
            icon={Stethoscope}
            accentColor="purple"
            isLoading={isMetricsLoading && !metrics}
            subtext="Determination SLA turnaround < 24h"
          />

          <MetricCard
            title="Scheduled NP Dispatch"
            value={schedCount}
            delta="+4.5%"
            isPositive={true}
            icon={Calendar}
            accentColor="emerald"
            isLoading={isMetricsLoading && !metrics}
            subtext="Encounter bookings on schedule"
          />
        </div>

        {/* ROW 2: Big Chart Card (Lush Clinical Azure & Vital Emerald Area Chart) */}
        <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-3 bg-muted/10 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                  Referral Volume & Clinical Transition Velocity
                </CardTitle>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                  92.4% SLA Fulfillment
                </span>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Comparison of daily patient intake volume versus completed mobile NP encounters.
              </CardDescription>
            </div>

            {/* Segmented Control Buttons */}
            <div className="flex items-center rounded-lg border border-border/80 p-0.5 bg-muted/40 shadow-2xs">
              <button
                type="button"
                onClick={() => setTimeRange('3m')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  timeRange === '3m'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 3 months
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('30d')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  timeRange === '30d'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('7d')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  timeRange === '7d'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 7 days
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-4 px-4 pb-5">
            {/* Legend & Stats Quick Bar */}
            <div className="flex items-center justify-between pb-3 text-xs border-b border-border/40 mb-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                  <span>Inflow Volume</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Completed Encounters</span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">
                Avg. Triage Turnaround: 18.4h
              </span>
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
                >
                  <defs>
                    {/* Clinical Azure Gradient */}
                    <linearGradient id="clinicalAzureGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                    {/* Vital Emerald Gradient */}
                    <linearGradient id="vitalEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/60" opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-muted-foreground font-medium"
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-muted-foreground font-medium"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '10px',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    }}
                    labelStyle={{
                      color: 'hsl(var(--foreground))',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    formatter={(value: any, name: any) => [
                      <span className="font-semibold text-foreground tabular-nums" key="val">{value} cases</span>,
                      name === 'referrals' ? 'Inflow Volume' : 'Completed Encounters'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="referrals"
                    name="referrals"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#clinicalAzureGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="completed"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#vitalEmeraldGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ROW 3: TanStack Table v9 Data Table (matching img2 reference exactly) */}
        <DashboardDataTable
          data={filteredReferrals}
          isLoading={isReferralsLoading}
          activeTab={activeTab}
          setActiveTab={(tab) => setActiveTab(tab as any)}
          counts={{
            total: totalCount,
            intake: intakeCount,
            review: reviewCount,
            scheduling: schedCount,
            urgent: urgentCount,
          }}
        />
      </div>
    </AppLayout>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useWorkspace } from '@/providers/workspace-context';
import { useAuth } from '@/providers/auth-context';
import { AppLayout } from '@/components/app-layout';
import { DashboardDataTable } from './dashboard-data-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Plus,
  Search,
  MoreVertical,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  Stethoscope,
  Receipt,
  FileCheck2,
  Inbox,
  Activity,
  Layers,
  ArrowUpRight,
  Eye,
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

// Chart dataset with realistic trend curve matching img1
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
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'ALL' | 'INTAKE' | 'CLINICAL_REVIEW' | 'SCHEDULING' | 'URGENT'>('ALL');
  const [timeRange, setTimeRange] = useState<'3m' | '30d' | '7d'>('30d');

  // 1. Fetch real dashboard metrics
  const { data: metrics, isLoading: isMetricsLoading } = useQuery<DashboardMetricsResponse>({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      return apiClient.get<DashboardMetricsResponse>('/referrals/dashboard/metrics');
    },
    staleTime: 30 * 1000,
  });

  // 2. Fetch referrals from real backend API
  const { data: referralsRes, isLoading: isReferralsLoading } = useQuery<{
    data: ReferralRecord[];
    total: number;
  }>({
    queryKey: ['referrals-all-dashboard'],
    queryFn: async () => {
      return apiClient.get<{ data: ReferralRecord[]; total: number }>('/referrals?limit=100');
    },
    staleTime: 30 * 1000,
  });

  const allReferrals = useMemo(() => referralsRes?.data || [], [referralsRes]);

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
        {/* ROW 1: 4 Key Metric Cards (Matching img1 exactly) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Active Referrals */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Active Cases</span>
              <Badge
                variant="outline"
                className="text-[11px] font-mono gap-1 font-semibold text-emerald-600 bg-emerald-50/50 border-emerald-200 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                +12.5%
              </Badge>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {metrics?.totalActive ?? totalCount}
              </span>
            </div>
            <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/80 flex items-center gap-1">
                Trending up this month <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              </p>
              <p className="text-[11px] text-muted-foreground/80">Active across authorized scope</p>
            </div>
          </Card>

          {/* Card 2: Intake Queue */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Intake Verification</span>
              <Badge
                variant="outline"
                className="text-[11px] font-mono gap-1 font-semibold text-neutral-600 bg-neutral-100 border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
              >
                -20%
              </Badge>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {intakeCount}
              </span>
            </div>
            <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/80 flex items-center gap-1">
                Down 20% this period <TrendingDown className="h-3.5 w-3.5 text-neutral-500" />
              </p>
              <p className="text-[11px] text-muted-foreground/80">Awaiting eligibility triage</p>
            </div>
          </Card>

          {/* Card 3: Clinical Review */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Clinical Review</span>
              <Badge
                variant="outline"
                className="text-[11px] font-mono gap-1 font-semibold text-emerald-600 bg-emerald-50/50 border-emerald-200 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                +12.5%
              </Badge>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {reviewCount}
              </span>
            </div>
            <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/80 flex items-center gap-1">
                Strong physician throughput <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              </p>
              <p className="text-[11px] text-muted-foreground/80">Determination turnaround &lt; 24h</p>
            </div>
          </Card>

          {/* Card 4: Growth / Schedule Rate */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Dispatch Readiness</span>
              <Badge
                variant="outline"
                className="text-[11px] font-mono gap-1 font-semibold text-emerald-600 bg-emerald-50/50 border-emerald-200 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                +4.5%
              </Badge>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {schedCount}
              </span>
            </div>
            <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/80 flex items-center gap-1">
                Steady performance increase <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              </p>
              <p className="text-[11px] text-muted-foreground/80">Meets SLA dispatch projections</p>
            </div>
          </Card>
        </div>

        {/* ROW 2: Big Chart Card (Area Chart matching img1 exactly) */}
        <Card className="rounded-xl border border-border/80 bg-card shadow-xs">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-3">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                Total Referral Inflow & Velocity
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Total referral admissions and clinical transitions over time
              </CardDescription>
            </div>

            {/* Segmented Control Buttons (matching img1) */}
            <div className="flex items-center rounded-lg border border-border p-1 bg-muted/30">
              <button
                type="button"
                onClick={() => setTimeRange('3m')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === '3m'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 3 months
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('30d')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === '30d'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('7d')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === '7d'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 7 days
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-2 px-3 pb-5">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={CHART_DATA_30_DAYS}
                  margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
                >
                  <defs>
                    {/* Primary Dark/Charcoal Gradient */}
                    <linearGradient id="primaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#18181b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#18181b" stopOpacity={0.0} />
                    </linearGradient>
                    {/* Secondary Slate Gradient */}
                    <linearGradient id="secondaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#71717a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#71717a" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" opacity={0.6} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#71717a' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      borderColor: 'var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Area
                    type="natural"
                    dataKey="referrals"
                    name="Inflow Volume"
                    stroke="#18181b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#primaryAreaGrad)"
                  />
                  <Area
                    type="natural"
                    dataKey="completed"
                    name="Completed Encounters"
                    stroke="#71717a"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#secondaryAreaGrad)"
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

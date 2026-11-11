'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Plus,
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
  RefreshCw,
  Eye,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Kanban,
  X,
  Copy,
  Layers,
  Filter,
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority, UserRole } from '@heals/types';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/providers/auth-context';
import { canCreateReferrals } from '@/lib/permissions';
import { WorkStatusBadge, PriorityBadge, PipelineStageBadge } from '@/components/ui/status-badge';

interface ReferralRecord {
  id: string;
  trackingNumber: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    medicalRecordNumber?: string;
    dateOfBirth?: string;
    phone?: string;
  };
  pipelineStage: PipelineStage;
  workStatus: WorkStatus;
  priority: Priority;
  site: string;
  referralSource?: string;
  referringProvider?: string;
  referringFacility?: string;
  insurancePayer?: string;
  insuranceMemberId?: string;
  coverageVerified?: boolean;
  version: number;
  assignedTo?: string;
  assignedRole?: string;
  createdAt: string;
  updatedAt: string;
  clinicalReviews?: {
    id: string;
    decision: string;
    reason?: string;
    notes?: string;
  }[];
}

const STAGES: { stage: PipelineStage; label: string }[] = [
  { stage: PipelineStage.INTAKE, label: '1. Intake' },
  { stage: PipelineStage.CLINICAL_REVIEW, label: '2. Clinical Review' },
  { stage: PipelineStage.SCHEDULING, label: '3. Scheduling' },
  { stage: PipelineStage.NP_VISIT, label: '4. NP Visit' },
  { stage: PipelineStage.NOTES_QA, label: '5. Notes QA' },
  { stage: PipelineStage.BILLING, label: '6. Billing' },
];

export default function ReferralsDirectoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isIntakeSpecialistOnly =
    user?.roles?.includes(UserRole.INTAKE_SPECIALIST) &&
    !user?.roles?.includes(UserRole.ADMIN) &&
    !user?.roles?.includes(UserRole.CLINICAL_REVIEWER);

  const isClinicalReviewerOnly =
    user?.roles?.includes(UserRole.CLINICAL_REVIEWER) &&
    !user?.roles?.includes(UserRole.ADMIN) &&
    !user?.roles?.includes(UserRole.INTAKE_SPECIALIST);

  // High-power filters
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [quickTab, setQuickTab] = useState<'all' | 'intake' | 'clinical' | 'needs_info' | 'urgent'>('all');

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch referrals from backend
  const { data, isLoading, refetch, isFetching } = useQuery<{
    data: ReferralRecord[];
    total: number;
  }>({
    queryKey: [
      'referrals-pipeline',
      {
        pipelineStage: stageFilter,
        workStatus: statusFilter,
        priority: priorityFilter,
        site: siteFilter,
        search: debouncedSearch,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stageFilter !== 'ALL') params.set('pipelineStage', stageFilter);
      if (statusFilter !== 'ALL') params.set('workStatus', statusFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (siteFilter !== 'ALL') params.set('site', siteFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      params.set('limit', '100');
      return apiClient.get<{ data: ReferralRecord[]; total: number }>(`/referrals?${params.toString()}`);
    },
    staleTime: 30 * 1000,
  });

  const referrals = useMemo(() => data?.data || [], [data]);

  const handleQuickTabSelect = (tab: typeof quickTab) => {
    setQuickTab(tab);
    if (tab === 'all') {
      setStageFilter('ALL');
      setStatusFilter('ALL');
      setPriorityFilter('ALL');
    } else if (tab === 'intake') {
      setStageFilter(PipelineStage.INTAKE);
      setStatusFilter('ALL');
      setPriorityFilter('ALL');
    } else if (tab === 'clinical') {
      setStageFilter(PipelineStage.CLINICAL_REVIEW);
      setStatusFilter('ALL');
      setPriorityFilter('ALL');
    } else if (tab === 'needs_info') {
      setStageFilter('ALL');
      setStatusFilter(WorkStatus.RETURNED_TO_INTAKE);
      setPriorityFilter('ALL');
    } else if (tab === 'urgent') {
      setStageFilter('ALL');
      setStatusFilter('ALL');
      setPriorityFilter(Priority.URGENT);
    }
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    stageFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    siteFilter !== 'ALL';

  const resetAllFilters = () => {
    setSearchQuery('');
    setStageFilter('ALL');
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setSiteFilter('ALL');
    setQuickTab('all');
  };

  const copyTracking = (trackingNumber: string) => {
    navigator.clipboard.writeText(trackingNumber);
    toast.success('Tracking ID Copied', { description: trackingNumber });
  };

  return (
    <AppLayout title="Referrals Directory">
      <div className="space-y-4 pb-10 max-w-7xl mx-auto">
        {/* Header with Quick Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Clinical Referrals Directory
              </h1>
              <Badge variant="secondary" className="text-[11px] font-mono px-2 py-0.5 font-semibold">
                {isLoading ? '...' : `${referrals.length} Cases`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Central operational queue for all patient referrals across the 6-stage clinical lifecycle
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs bg-background shadow-2xs hover:bg-muted"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            {/* Dedicated Role & Visualizer Links */}
            <Link href="/referrals/intake">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-background">
                <Layers className="h-3.5 w-3.5 text-blue-500" />
                <span>Intake Queue</span>
              </Button>
            </Link>

            <Link href="/referrals/review">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-background">
                <FileCheck2 className="h-3.5 w-3.5 text-purple-500" />
                <span>Review Queue</span>
              </Button>
            </Link>

            <Link href="/referrals/kanban">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-background" title="Open Global Kanban Pipeline Visualizer">
                <Kanban className="h-3.5 w-3.5 text-foreground" />
                <span>Kanban Visualizer</span>
              </Button>
            </Link>

            {canCreateReferrals(user?.roles) && (
              <Link href="/referrals/new">
                <Button size="sm" className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Referral</span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/40 scrollbar-none">
          <button
            type="button"
            onClick={() => handleQuickTabSelect('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              quickTab === 'all'
                ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            All Referrals
          </button>
          <button
            type="button"
            onClick={() => handleQuickTabSelect('intake')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              quickTab === 'intake'
                ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Inbox className="h-3.5 w-3.5 text-blue-500" />
            <span>1. Intake Queue</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickTabSelect('clinical')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              quickTab === 'clinical'
                ? 'bg-purple-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Stethoscope className="h-3.5 w-3.5 text-purple-500" />
            <span>2. Clinical Review</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickTabSelect('needs_info')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              quickTab === 'needs_info'
                ? 'bg-amber-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span>Returned to Intake</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickTabSelect('urgent')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              quickTab === 'urgent'
                ? 'bg-rose-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            <span>STAT & Urgent</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-3 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search patient, MRN, tracking #, provider, or payer…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8.5 pl-8 pr-8 text-xs bg-background border-border/80"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="w-[170px]">
              <Select
                value={stageFilter}
                onValueChange={(val) => {
                  setStageFilter(val || 'ALL');
                  setQuickTab('all');
                }}
              >
                <SelectTrigger className="h-8.5 text-xs bg-background border-border/80">
                  <SelectValue placeholder="All Stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Pipeline Stages</SelectItem>
                  {STAGES.map((s) => (
                    <SelectItem key={s.stage} value={s.stage}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[170px]">
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val || 'ALL');
                  setQuickTab('all');
                }}
              >
                <SelectTrigger className="h-8.5 text-xs bg-background border-border/80">
                  <SelectValue placeholder="All Work Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Work Statuses</SelectItem>
                  <SelectItem value={WorkStatus.PENDING}>Pending</SelectItem>
                  <SelectItem value={WorkStatus.PENDING_REVIEW}>Pending Review</SelectItem>
                  <SelectItem value={WorkStatus.RETURNED_TO_INTAKE}>Returned to Intake</SelectItem>
                  <SelectItem value={WorkStatus.APPROVED_FOR_SCHEDULING}>Approved for Scheduling</SelectItem>
                  <SelectItem value={WorkStatus.IN_PROGRESS}>In Progress</SelectItem>
                  <SelectItem value={WorkStatus.ON_HOLD}>On Hold</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value={WorkStatus.REJECTED}>Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[145px]">
              <Select
                value={priorityFilter}
                onValueChange={(val) => {
                  setPriorityFilter(val || 'ALL');
                  setQuickTab('all');
                }}
              >
                <SelectTrigger className="h-8.5 text-xs bg-background border-border/80">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Priorities</SelectItem>
                  <SelectItem value={Priority.ROUTINE}>Routine</SelectItem>
                  <SelectItem value={Priority.URGENT}>Urgent</SelectItem>
                  <SelectItem value={Priority.STAT}>STAT Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[130px]">
              <Select value={siteFilter} onValueChange={(val) => setSiteFilter(val || 'ALL')}>
                <SelectTrigger className="h-8.5 text-xs bg-background border-border/80">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sites</SelectItem>
                  <SelectItem value="main">main</SelectItem>
                  <SelectItem value="Site-A">Site-A</SelectItem>
                  <SelectItem value="Site-B">Site-B</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAllFilters}
                className="h-8.5 text-xs text-muted-foreground hover:text-foreground gap-1 px-2.5"
              >
                <X className="h-3 w-3" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </div>

        {/* Clean Data Table */}
        <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border/80 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3.5 w-8">
                    <Checkbox aria-label="Select all referrals" />
                  </th>
                  <th className="py-3 px-3 font-semibold min-w-[210px]">Patient & Tracking ID</th>
                  <th className="py-3 px-3 font-semibold">Workflow Stage</th>
                  <th className="py-3 px-3 font-semibold">Work Status</th>
                  <th className="py-3 px-3 font-semibold">Urgency</th>
                  <th className="py-3 px-3 font-semibold min-w-[150px]">Referring Provider / Facility</th>
                  <th className="py-3 px-3 font-semibold min-w-[150px]">Insurance Payer</th>
                  <th className="py-3 px-3 font-semibold">Site</th>
                  <th className="py-3 px-3 text-right font-semibold min-w-[110px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-muted-foreground">
                      <Clock className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                      <span className="font-medium text-xs">Loading clinical referrals…</span>
                    </td>
                  </tr>
                ) : referrals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="max-w-xs mx-auto space-y-3">
                        <div className="h-10 w-10 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                          <Filter className="h-5 w-5 opacity-70" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-foreground">No referrals found</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {hasActiveFilters
                              ? 'No referrals match your current search and filter criteria.'
                              : 'There are currently no inbound referrals in your operational scope.'}
                          </p>
                        </div>
                        {hasActiveFilters ? (
                          <Button size="sm" variant="outline" onClick={resetAllFilters} className="text-xs h-7">
                            Clear all filters
                          </Button>
                        ) : canCreateReferrals(user?.roles) ? (
                          <Link href="/referrals/new">
                            <Button size="sm" className="text-xs h-7">
                              Create first referral
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  referrals.map((r) => {
                    const mrn = r.patient?.medicalRecordNumber || 'MRN-Pending';
                    const initials = `${r.patient?.firstName?.[0] || ''}${r.patient?.lastName?.[0] || ''}`.toUpperCase() || 'PT';
                    const latestReview = r.clinicalReviews?.[0];

                    return (
                      <tr key={r.id} className="hover:bg-muted/40 transition-colors group">
                        <td className="py-3 px-3.5">
                          <Checkbox aria-label={`Select referral ${r.trackingNumber}`} />
                        </td>

                        {/* Patient & Tracking */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8 rounded-lg shrink-0 border border-border bg-primary/5 text-primary text-[10px] font-bold">
                              <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <Link
                                href={`/referrals/${r.id}`}
                                className="font-bold text-xs text-foreground hover:text-primary hover:underline truncate block"
                              >
                                {r.patient?.firstName} {r.patient?.lastName}
                              </Link>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                <span className="font-mono">{mrn}</span>
                                <span>•</span>
                                <button
                                  type="button"
                                  onClick={() => copyTracking(r.trackingNumber)}
                                  className="hover:text-foreground flex items-center gap-0.5 font-mono"
                                  title="Click to copy tracking ID"
                                >
                                  <span>{r.trackingNumber}</span>
                                  <Copy className="h-2.5 w-2.5 opacity-60 hover:opacity-100" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Pipeline Stage */}
                        <td className="py-3 px-3">
                          <PipelineStageBadge stage={r.pipelineStage} />
                        </td>

                        {/* Work Status */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <WorkStatusBadge status={r.workStatus} />
                            {r.workStatus === WorkStatus.RETURNED_TO_INTAKE && latestReview?.reason && (
                              <p className="text-[10px] text-amber-700 dark:text-amber-300 truncate max-w-[180px]" title={latestReview.reason}>
                                Reason: {latestReview.reason}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Urgency */}
                        <td className="py-3 px-3">
                          <PriorityBadge priority={r.priority} />
                        </td>

                        {/* Facility & Provider */}
                        <td className="py-3 px-3">
                          <div className="space-y-0.5 text-xs truncate max-w-[170px]">
                            <div className="font-medium text-foreground truncate flex items-center gap-1">
                              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                              <span className="truncate">{r.referringFacility || r.referralSource || 'Inbound Clinic'}</span>
                            </div>
                            {r.referringProvider && (
                              <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                <Stethoscope className="h-2.5 w-2.5 shrink-0 text-muted-foreground/70" />
                                <span className="truncate">{r.referringProvider}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Payer */}
                        <td className="py-3 px-3">
                          <div className="space-y-0.5 text-xs truncate max-w-[170px]">
                            <div className="font-medium text-foreground truncate flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" />
                              <span className="truncate">{r.insurancePayer || 'Self-Pay / Pending'}</span>
                            </div>
                            {r.insuranceMemberId && (
                              <div className="text-[10px] text-muted-foreground font-mono truncate">
                                ID: {r.insuranceMemberId}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Site */}
                        <td className="py-3 px-3">
                          <span className="text-[10px] font-semibold uppercase text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border">
                            {r.site || 'Site-A'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/referrals/${r.id}`}>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2.5 font-medium border-border/80 hover:bg-muted"
                              >
                                View Record
                              </Button>
                            </Link>

                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  />
                                }
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44 text-xs">
                                <DropdownMenuItem render={<Link href={`/referrals/${r.id}`} />}>
                                  <Eye className="mr-2 h-3.5 w-3.5" />
                                  Open Detail
                                </DropdownMenuItem>
                                {r.patient?.id && (
                                  <DropdownMenuItem render={<Link href={`/patients/${r.patient.id}`} />}>
                                    <UserCheck className="mr-2 h-3.5 w-3.5" />
                                    Patient Profile
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => copyTracking(r.trackingNumber)}>
                                  <Copy className="mr-2 h-3.5 w-3.5" />
                                  Copy Tracking ID
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing <strong>{referrals.length}</strong> of <strong>{data?.total || referrals.length}</strong> clinical referrals
            </span>
            <span className="text-[11px]">
              Click any patient name to open the authoritative workflow record
            </span>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}


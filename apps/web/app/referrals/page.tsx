'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
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
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Kanban,
  List,
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
  GripVertical,
  Layers,
  ArrowUpRight,
  MessageSquare,
  Filter,
  X,
  Copy,
  Check,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority } from '@heals/types';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/providers/auth-context';
import { canTransitionStage, canCreateReferrals } from '@/lib/permissions';
import { WorkStatusBadge, PriorityBadge, PipelineStageBadge } from '@/components/ui/status-badge';
import { ReferralDrawer } from '@/components/referrals/referral-drawer';
import { RollbackDialog } from '@/components/referrals/rollback-dialog';

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
  version: number;
  assignedTo?: string;
  assignedRole?: string;
  createdAt: string;
  updatedAt: string;
}

const STAGES: { stage: PipelineStage; label: string; icon: React.ElementType; color: string }[] = [
  { stage: PipelineStage.INTAKE, label: '1. Intake', icon: Inbox, color: 'text-blue-600 bg-blue-500/10' },
  { stage: PipelineStage.CLINICAL_REVIEW, label: '2. Clinical Review', icon: Stethoscope, color: 'text-purple-600 bg-purple-500/10' },
  { stage: PipelineStage.SCHEDULING, label: '3. Scheduling', icon: Calendar, color: 'text-amber-600 bg-amber-500/10' },
  { stage: PipelineStage.NP_VISIT, label: '4. NP Visit', icon: UserCheck, color: 'text-emerald-600 bg-emerald-500/10' },
  { stage: PipelineStage.NOTES_QA, label: '5. Notes QA', icon: FileCheck2, color: 'text-teal-600 bg-teal-500/10' },
  { stage: PipelineStage.BILLING, label: '6. Billing', icon: Receipt, color: 'text-neutral-600 bg-neutral-500/10' },
];

export default function ReferralsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Default to 'table' (Data Table) as primary view
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');

  // High-power multi-field filters
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [quickTab, setQuickTab] = useState<'all' | 'intake' | 'clinical' | 'scheduling' | 'needs_info' | 'urgent'>('all');

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedReferralForDrawer, setSelectedReferralForDrawer] = useState<ReferralRecord | null>(null);
  const [pendingRollback, setPendingRollback] = useState<{
    referral: ReferralRecord;
    targetStage: PipelineStage;
  } | null>(null);

  // Configure pointer sensor with 5px distance constraint to allow click vs drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch referrals from backend with high-power filters
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

  // Quick preset tab handler
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
    } else if (tab === 'scheduling') {
      setStageFilter(PipelineStage.SCHEDULING);
      setStatusFilter('ALL');
      setPriorityFilter('ALL');
    } else if (tab === 'needs_info') {
      setStageFilter('ALL');
      setStatusFilter(WorkStatus.BLOCKED_NEEDS_INFO);
      setPriorityFilter('ALL');
    } else if (tab === 'urgent') {
      setStageFilter('ALL');
      setStatusFilter('ALL');
      setPriorityFilter(Priority.URGENT);
    }
  };

  // Check if any filter is active
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

  // Transition Mutation with gate check error handling & rollback
  const transitionMutation = useMutation({
    mutationFn: async ({
      id,
      targetStage,
      version,
      reason,
    }: {
      id: string;
      targetStage: PipelineStage;
      version: number;
      reason?: string;
    }) => {
      return apiClient.post(
        `/referrals/${id}/transitions`,
        {
          targetStage,
          reason: reason || 'Kanban stage progression',
          version,
        },
        { idempotencyKey: `trans-${id}-${Date.now()}` },
      );
    },
    onMutate: async ({ id, targetStage }) => {
      await queryClient.cancelQueries({ queryKey: ['referrals-pipeline'] });
      const previousData = queryClient.getQueryData(['referrals-pipeline']);

      queryClient.setQueriesData({ queryKey: ['referrals-pipeline'] }, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((item: ReferralRecord) =>
            item.id === id ? { ...item, pipelineStage: targetStage, version: item.version + 1 } : item,
          ),
        };
      });

      return { previousData };
    },
    onError: (err: any, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueriesData({ queryKey: ['referrals-pipeline'] }, context.previousData);
      }

      if (err?.status === 409) {
        toast.warning('Concurrent Modification Detected', {
          description:
            'Another clinician recently modified this referral. The board has been updated with fresh data.',
        });
        queryClient.invalidateQueries({ queryKey: ['referrals-pipeline'] });
        return;
      }

      toast.error('Stage Gate Rejected Transition', {
        description: err.message || 'Workflow gate check failed. Please ensure prerequisite clinical documents are completed.',
      });
    },
    onSuccess: (result, variables) => {
      toast.success(`Referral moved to ${variables.targetStage.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['referrals-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
  });

  // Calculate next stage in linear path
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const referralId = active.id as string;
    const targetStage = over.id as PipelineStage;
    const currentRef = referrals.find((r) => r.id === referralId);

    if (!currentRef || currentRef.pipelineStage === targetStage) {
      return;
    }

    const fromIndex = STAGES.findIndex((s) => s.stage === currentRef.pipelineStage);
    const toIndex = STAGES.findIndex((s) => s.stage === targetStage);

    if (!canTransitionStage(currentRef.pipelineStage, targetStage, user?.roles)) {
      toast.error('Permission Denied', {
        description: `Your role does not have authorization to transition referrals from ${currentRef.pipelineStage.replace('_', ' ')} to ${targetStage.replace('_', ' ')}.`,
      });
      return;
    }

    if (toIndex < fromIndex) {
      // Backward transition requires a mandatory reason
      setPendingRollback({
        referral: currentRef,
        targetStage,
      });
      return;
    }

    transitionMutation.mutate({
      id: referralId,
      targetStage,
      version: currentRef.version,
      reason: 'Kanban drag-and-drop progression',
    });
  };

  const activeReferral = useMemo(
    () => referrals.find((r) => r.id === activeDragId),
    [referrals, activeDragId],
  );

  const copyTracking = (trackingNumber: string) => {
    navigator.clipboard.writeText(trackingNumber);
    toast.success('Tracking ID Copied', { description: trackingNumber });
  };

  return (
    <AppLayout title="Referrals Management">
      <div className="space-y-4 pb-10 max-w-7xl mx-auto">
        {/* Top Header & View Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Clinical Referrals Directory
              </h1>
              <Badge variant="secondary" className="text-[11px] font-mono px-2 py-0.5 font-semibold">
                {isLoading ? '...' : `${referrals.length} Total`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comprehensive operational queue for inbound referrals, patient records, and multi-stage workflow determinations
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

            {/* View Mode Toggle: Table View (Default) vs Kanban Board */}
            <div className="border border-border rounded-lg p-0.5 flex bg-muted/40 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'table'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Data Table View"
              >
                <List className="h-3.5 w-3.5" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'board'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Interactive Kanban Pipeline"
              >
                <Kanban className="h-3.5 w-3.5" />
                <span>Board</span>
              </button>
            </div>

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

        {/* 1. High-Level Quick Filter Tabs (Linear / Stripe style) */}
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
            onClick={() => handleQuickTabSelect('scheduling')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              quickTab === 'scheduling'
                ? 'bg-amber-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 text-amber-500" />
            <span>3. Scheduling</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickTabSelect('needs_info')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              quickTab === 'needs_info'
                ? 'bg-rose-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
            <span>Action Required</span>
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

        {/* 2. High-Power Filter Bar with Dropdowns and Search */}
        <div className="p-3 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search referrals by patient name, MRN, tracking number, or provider"
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
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter: Pipeline Stage */}
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

            {/* Filter: Work Status */}
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
                  <SelectItem value={WorkStatus.IN_PROGRESS}>In Progress</SelectItem>
                  <SelectItem value={WorkStatus.BLOCKED_NEEDS_INFO}>Blocked / Needs Info</SelectItem>
                  <SelectItem value={WorkStatus.ON_HOLD}>On Hold</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter: Priority */}
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

            {/* Filter: Site */}
            <div className="w-[130px]">
              <Select value={siteFilter} onValueChange={(val) => setSiteFilter(val || 'ALL')}>
                <SelectTrigger className="h-8.5 text-xs bg-background border-border/80">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sites</SelectItem>
                  <SelectItem value="Site-A">Site-A</SelectItem>
                  <SelectItem value="Site-B">Site-B</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reset Filters CTA */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAllFilters}
                className="h-8.5 text-xs text-muted-foreground hover:text-foreground gap-1 px-2.5"
              >
                <X className="h-3 w-3" />
                <span>Reset Filters</span>
              </Button>
            )}
          </div>

          {/* Active Filter Chips Strip */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground mr-1">Active Filters:</span>
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border">
                  Search: &ldquo;{searchQuery}&rdquo;
                  <button type="button" onClick={() => setSearchQuery('')} className="hover:text-foreground">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {stageFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Stage: {stageFilter.replace(/_/g, ' ')}
                  <button type="button" onClick={() => setStageFilter('ALL')} className="hover:text-primary-foreground">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {statusFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border">
                  Status: {statusFilter.replace(/_/g, ' ')}
                  <button type="button" onClick={() => setStatusFilter('ALL')}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {priorityFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border">
                  Priority: {priorityFilter}
                  <button type="button" onClick={() => setPriorityFilter('ALL')}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {siteFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border">
                  Site: {siteFilter}
                  <button type="button" onClick={() => setSiteFilter('ALL')}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              <span className="ml-auto font-medium tabular-nums">
                {referrals.length} matching {referrals.length === 1 ? 'case' : 'cases'}
              </span>
            </div>
          )}
        </div>

        {/* VIEW 1: Full High-Density SaaS Data Table (DEFAULT VIEW) */}
        {viewMode === 'table' ? (
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
                    <th className="py-3 px-3 font-semibold min-w-[150px]">Referring Facility / Provider</th>
                    <th className="py-3 px-3 font-semibold min-w-[150px]">Insurance Payer & ID</th>
                    <th className="py-3 px-3 font-semibold">Site</th>
                    <th className="py-3 px-3 font-semibold">Stage Age</th>
                    <th className="py-3 px-3 text-right font-semibold min-w-[110px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 bg-card">
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-muted-foreground">
                        <Clock className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" aria-hidden="true" />
                        <span className="font-medium text-xs">Loading clinical referrals…</span>
                      </td>
                    </tr>
                  ) : referrals.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center">
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
                      const nextStage = getNextStage(r.pipelineStage);
                      const mrn = r.patient?.medicalRecordNumber || 'MRN-Pending';
                      const initials = `${r.patient?.firstName?.[0] || ''}${r.patient?.lastName?.[0] || ''}`.toUpperCase() || 'PT';
                      const stageAge = formatStageAge(r.updatedAt || r.createdAt);

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
                            <WorkStatusBadge status={r.workStatus} />
                          </td>

                          {/* Urgency */}
                          <td className="py-3 px-3">
                            <PriorityBadge priority={r.priority} />
                          </td>

                          {/* Referring Facility & Provider */}
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

                          {/* Insurance Payer */}
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

                          {/* Age & Last Updated */}
                          <td className="py-3 px-3">
                            <span className="text-[11px] text-muted-foreground font-medium tabular-nums flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5 opacity-60" />
                              <span>{stageAge}</span>
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
                                  {r.pipelineStage === PipelineStage.CLINICAL_REVIEW ? 'Review' : 'View'}
                                </Button>
                              </Link>

                              {nextStage && canTransitionStage(r.pipelineStage, nextStage, user?.roles) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    transitionMutation.mutate({
                                      id: r.id,
                                      targetStage: nextStage,
                                      version: r.version,
                                      reason: 'Table quick advance',
                                    })
                                  }
                                  disabled={transitionMutation.isPending}
                                  className="h-7 text-[11px] px-2 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                                  title={`Advance to ${nextStage.replace('_', ' ')}`}
                                >
                                  <span>Advance</span>
                                  <ArrowRight className="h-2.5 w-2.5" />
                                </Button>
                              )}

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
                                    View Full Record
                                  </DropdownMenuItem>
                                  {r.patient?.id && (
                                    <DropdownMenuItem render={<Link href={`/patients/${r.patient.id}`} />}>
                                      <UserCheck className="mr-2 h-3.5 w-3.5" />
                                      Patient Profile
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => setSelectedReferralForDrawer(r)}>
                                    <MessageSquare className="mr-2 h-3.5 w-3.5" />
                                    Quick Action Drawer
                                  </DropdownMenuItem>
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

            {/* Table Footer Summary */}
            <div className="p-3 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Showing <strong>{referrals.length}</strong> of <strong>{data?.total || referrals.length}</strong> clinical referrals
              </span>
              <span className="text-[11px]">
                Click any patient or tracking ID to open the authoritative workflow record
              </span>
            </div>
          </Card>
        ) : (
          /* VIEW 2: Interactive Drag-and-Drop Kanban Board (Accessible via Toggle) */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-6 w-full min-w-0">
              {STAGES.map((col) => {
                const columnReferrals = referrals.filter((r) => r.pipelineStage === col.stage);

                return (
                  <KanbanDroppableColumn
                    key={col.stage}
                    stageConfig={col}
                    referrals={columnReferrals}
                    onAdvance={(ref) => {
                      const next = getNextStage(ref.pipelineStage);
                      if (next) {
                        if (!canTransitionStage(ref.pipelineStage, next, user?.roles)) {
                          toast.error('Permission Denied', {
                            description: `Your role cannot advance referrals from ${ref.pipelineStage.replace('_', ' ')}.`,
                          });
                          return;
                        }
                        transitionMutation.mutate({
                          id: ref.id,
                          targetStage: next,
                          version: ref.version,
                          reason: 'Stage advance button progression',
                        });
                      }
                    }}
                    onOpenDrawer={(ref) => setSelectedReferralForDrawer(ref)}
                    isAdvancing={transitionMutation.isPending}
                  />
                );
              })}
            </div>

            {/* Drag Overlay: Shows floating realistic preview while dragging */}
            <DragOverlay>
              {activeReferral ? (
                <div className="w-[300px] rounded-lg border border-border bg-card p-3 shadow-xl opacity-95">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold tracking-tight text-[11px] text-muted-foreground">
                      {activeReferral.trackingNumber}
                    </span>
                    <Badge variant="outline" className="text-[9px] uppercase font-bold">
                      {activeReferral.priority}
                    </Badge>
                  </div>
                  <div className="font-semibold text-xs text-foreground">
                    {activeReferral.patient?.firstName} {activeReferral.patient?.lastName}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    MRN: {activeReferral.patient?.medicalRecordNumber || 'MRN-Pending'}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Interactive Referral Detail & Actions Drawer */}
        <ReferralDrawer
          referral={selectedReferralForDrawer}
          isOpen={!!selectedReferralForDrawer}
          onClose={() => setSelectedReferralForDrawer(null)}
          onAdvance={(ref) => {
            const next = getNextStage(ref.pipelineStage);
            if (next) {
              if (!canTransitionStage(ref.pipelineStage, next, user?.roles)) {
                toast.error('Permission Denied', {
                  description: `Your role cannot advance referrals from ${ref.pipelineStage.replace('_', ' ')}.`,
                });
                return;
              }
              transitionMutation.mutate({
                id: ref.id,
                targetStage: next,
                version: ref.version,
                reason: 'Drawer stage advance progression',
              });
              setSelectedReferralForDrawer(null);
            }
          }}
          onReturn={(ref) => {
            const fromIdx = STAGES.findIndex((s) => s.stage === ref.pipelineStage);
            if (fromIdx > 0) {
              const prev = STAGES[fromIdx - 1].stage;
              if (!canTransitionStage(ref.pipelineStage, prev, user?.roles)) {
                toast.error('Permission Denied', {
                  description: `Your role cannot return referrals from ${ref.pipelineStage.replace('_', ' ')}.`,
                });
                return;
              }
              setSelectedReferralForDrawer(null);
              setPendingRollback({
                referral: ref,
                targetStage: prev,
              });
            }
          }}
          isAdvancing={transitionMutation.isPending}
        />

        {/* Mandatory Return / Rollback Reason Dialog */}
        <RollbackDialog
          isOpen={!!pendingRollback}
          onClose={() => setPendingRollback(null)}
          referral={pendingRollback?.referral || null}
          targetStage={pendingRollback?.targetStage || null}
          onConfirm={(reason) => {
            if (pendingRollback) {
              transitionMutation.mutate({
                id: pendingRollback.referral.id,
                targetStage: pendingRollback.targetStage,
                version: pendingRollback.referral.version,
                reason,
              });
              setPendingRollback(null);
            }
          }}
          isLoading={transitionMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}

// ----------------------------------------------------------------------------
// Droppable Column Component
// ----------------------------------------------------------------------------
function KanbanDroppableColumn({
  stageConfig,
  referrals,
  onAdvance,
  onOpenDrawer,
  isAdvancing,
}: {
  stageConfig: (typeof STAGES)[0];
  referrals: ReferralRecord[];
  onAdvance: (ref: ReferralRecord) => void;
  onOpenDrawer: (ref: ReferralRecord) => void;
  isAdvancing: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stageConfig.stage,
  });

  const ColIcon = stageConfig.icon;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[290px] w-[310px] shrink-0 rounded-lg border transition-all duration-150 ${
        isOver
          ? 'border-foreground/40 ring-1 ring-foreground/20 bg-muted/40'
          : 'border-border/80 bg-muted/20 shadow-2xs'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/70 bg-card rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded-md ${stageConfig.color}`}>
            <ColIcon className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-foreground tracking-tight">
            {stageConfig.label}
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-semibold">
          {referrals.length}
        </Badge>
      </div>

      {/* Cards Scroll Container */}
      <div className="p-2.5 space-y-2.5 min-h-[480px] max-h-[calc(100vh-270px)] overflow-y-auto">
        {referrals.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted-foreground/60 italic flex flex-col items-center gap-2">
            <CheckCircle2 className="h-6 w-6 opacity-30 text-muted-foreground" />
            <span>Drop referrals here</span>
          </div>
        ) : (
          referrals.map((ref) => (
            <KanbanDraggableCard
              key={ref.id}
              referral={ref}
              onAdvance={() => onAdvance(ref)}
              onOpenDrawer={() => onOpenDrawer(ref)}
              isAdvancing={isAdvancing}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helper: Calculate stage elapsed age
// ----------------------------------------------------------------------------
function formatStageAge(dateStr?: string): string {
  if (!dateStr) return '< 1h';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return '< 1h';
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  return `${diffDays}d ${remHours}h`;
}

// ----------------------------------------------------------------------------
// Draggable Rich Clinical Card Component
// ----------------------------------------------------------------------------
function KanbanDraggableCard({
  referral,
  onAdvance,
  onOpenDrawer,
  isAdvancing,
}: {
  referral: ReferralRecord;
  onAdvance: () => void;
  onOpenDrawer: () => void;
  isAdvancing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: referral.id,
    data: referral,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  const mrn = referral.patient?.medicalRecordNumber || 'MRN-Pending';
  const initials = `${referral.patient?.firstName?.[0] || ''}${referral.patient?.lastName?.[0] || ''}`.toUpperCase() || 'PT';
  const stageAge = formatStageAge(referral.updatedAt || referral.createdAt);
  const assignedRoleLabel = referral.assignedRole
    ? referral.assignedRole.replace(/_/g, ' ')
    : 'INTAKE QUEUE';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-xl border border-border/80 bg-card p-4 shadow-xs hover:border-foreground/30 hover:shadow-sm transition-all space-y-3 cursor-pointer"
      onClick={(e) => {
        // Prevent opening drawer if user is dragging or clicking buttons
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('a')) return;
        onOpenDrawer();
      }}
    >
      {/* Top Header: Drag Handle, Tracking ID, Priority Badge & Stage Aging */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            title="Drag across stages"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="font-semibold tracking-tight text-[11px] text-muted-foreground truncate">
            {referral.trackingNumber}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium tabular-nums" title="Time in current stage">
            <Clock className="h-2.5 w-2.5 opacity-60" />
            <span>{stageAge}</span>
          </span>

          {referral.priority === Priority.STAT ? (
            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 uppercase font-bold tracking-wider">
              STAT
            </Badge>
          ) : referral.priority === Priority.URGENT ? (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 uppercase font-semibold border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            >
              URGENT
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground font-medium">Routine</span>
          )}
        </div>
      </div>

      {/* Patient Demographic Summary */}
      <div className="flex items-start gap-2.5">
        <Avatar className="h-8 w-8 rounded-lg shrink-0 border border-border bg-muted">
          <AvatarFallback className="rounded-lg text-[10px] font-bold text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-xs text-foreground truncate block">
            {referral.patient?.firstName} {referral.patient?.lastName}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
            <span className="font-medium text-muted-foreground">{mrn}</span>
            <span>•</span>
            <span className="font-semibold uppercase text-muted-foreground">{referral.site || 'Site-A'}</span>
          </div>
        </div>
      </div>

      {/* Clinical & Insurance Details */}
      <div className="space-y-1.5 text-[11px] bg-muted/30 p-2.5 rounded-lg border border-border/50">
        <div className="flex items-center justify-between text-[10px] pb-1 border-b border-border/40 text-muted-foreground">
          <span className="font-medium">Assigned Queue:</span>
          <Badge variant="secondary" className="text-[9px] h-3.5 px-1.5 font-medium uppercase">
            {assignedRoleLabel}
          </Badge>
        </div>

        {referral.referringFacility && (
          <div className="flex items-center gap-1.5 text-muted-foreground truncate">
            <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/80" />
            <span className="truncate">{referral.referringFacility}</span>
          </div>
        )}
        {referral.referringProvider && (
          <div className="flex items-center gap-1.5 text-muted-foreground truncate">
            <Stethoscope className="h-3 w-3 shrink-0 text-muted-foreground/80" />
            <span className="truncate">{referral.referringProvider}</span>
          </div>
        )}
        {referral.insurancePayer && (
          <div className="flex items-center gap-1.5 text-foreground/80 font-medium truncate pt-0.5">
            <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" />
            <span className="truncate">{referral.insurancePayer}</span>
            {referral.insuranceMemberId && (
              <span className="font-medium text-[10px] text-muted-foreground ml-auto tabular-nums">
                {referral.insuranceMemberId}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card Footer: Work Status & Actions */}
      <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
        <WorkStatusBadge status={referral.workStatus} />

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onAdvance();
            }}
            disabled={isAdvancing}
            className="h-6 text-[10px] px-2 gap-1 bg-background text-foreground hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors"
            title="Advance to next workflow stage"
          >
            <span>Advance</span>
            <ArrowRight className="h-2.5 w-2.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDrawer();
            }}
            className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
            title="Open Details & Comments Drawer"
          >
            <MessageSquare className="h-3 w-3" />
            <span className="hidden sm:inline">Details</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

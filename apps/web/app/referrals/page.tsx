'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority } from '@heals/types';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/use-debounce';

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
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

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

  // Fetch referrals from backend
  const { data, isLoading, refetch, isFetching } = useQuery<{
    data: ReferralRecord[];
    total: number;
  }>({
    queryKey: ['referrals-pipeline', { pipelineStage: stageFilter, priority: priorityFilter, search: debouncedSearch }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stageFilter !== 'ALL') params.set('pipelineStage', stageFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      params.set('limit', '100');
      return apiClient.get<{ data: ReferralRecord[]; total: number }>(`/referrals?${params.toString()}`);
    },
    staleTime: 30 * 1000,
  });

  const referrals = useMemo(() => data?.data || [], [data]);

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
          reason: 'Kanban drag-and-drop progression',
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

    transitionMutation.mutate({
      id: referralId,
      targetStage,
      version: currentRef.version,
    });
  };

  const activeReferral = useMemo(
    () => referrals.find((r) => r.id === activeDragId),
    [referrals, activeDragId],
  );

  return (
    <AppLayout title="Referrals Pipeline">
      <div className="space-y-5 pb-8">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Clinical Referral Pipeline
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drag and drop patient referrals across the 6 authoritative workflow gates
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs bg-background"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            {/* View Mode Toggle */}
            <div className="border border-border rounded-lg p-0.5 flex bg-muted/40 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'board' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Interactive Kanban Board"
              >
                <Kanban className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'list' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Data Table View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            <Link href="/referrals/new">
              <Button size="sm" className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium shadow-xs">
                <Plus className="h-3.5 w-3.5" />
                <span>New Referral</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter and Search Bar using newly styled Shadcn Selects */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search patient, MRN, tracking #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          {/* Shadcn Select: Stage */}
          <div className="w-[180px]">
            <Select value={stageFilter} onValueChange={(val) => setStageFilter(val || 'ALL')}>
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="All Stages (Funnel)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Stages (Funnel)</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s.stage} value={s.stage}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Shadcn Select: Priority */}
          <div className="w-[150px]">
            <Select value={priorityFilter} onValueChange={(val) => setPriorityFilter(val || 'ALL')}>
              <SelectTrigger className="h-8 text-xs bg-background">
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

          <div className="ml-auto text-xs text-muted-foreground font-mono">
            {isLoading ? 'Loading cases...' : `${referrals.length} active referrals`}
          </div>
        </div>

        {/* VIEW 1: Drag-and-Drop Kanban Board */}
        {viewMode === 'board' ? (
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
                        transitionMutation.mutate({
                          id: ref.id,
                          targetStage: next,
                          version: ref.version,
                        });
                      }
                    }}
                    isAdvancing={transitionMutation.isPending}
                  />
                );
              })}
            </div>

            {/* Drag Overlay: Shows floating realistic preview while dragging */}
            <DragOverlay>
              {activeReferral ? (
                <div className="w-[310px] rounded-xl border-2 border-black dark:border-white bg-card p-4 shadow-2xl scale-102 rotate-1 opacity-95">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                      {activeReferral.trackingNumber}
                    </span>
                    <Badge variant="outline" className="text-[9px] uppercase font-bold">
                      {activeReferral.priority}
                    </Badge>
                  </div>
                  <div className="font-bold text-sm text-foreground">
                    {activeReferral.patient?.firstName} {activeReferral.patient?.lastName}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-1">
                    MRN: {activeReferral.patient?.medicalRecordNumber || 'MRN-Pending'}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          /* VIEW 2: Full Data Table (matching img1) */
          <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <input type="checkbox" className="rounded border-border accent-black h-3.5 w-3.5" />
                    </th>
                    <th className="py-3 px-4 font-semibold">Patient & Tracking #</th>
                    <th className="py-3 px-4 font-semibold">Stage</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Priority</th>
                    <th className="py-3 px-4 font-semibold">Referring Source</th>
                    <th className="py-3 px-4 font-semibold">Insurance Payer</th>
                    <th className="py-3 px-4 font-semibold">Site</th>
                    <th className="py-3 px-4 font-semibold">Version</th>
                    <th className="py-3 px-4 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 bg-card">
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-muted-foreground">
                        <Clock className="h-4 w-4 animate-spin mx-auto mb-1" />
                        <span>Loading referrals...</span>
                      </td>
                    </tr>
                  ) : referrals.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-muted-foreground">
                        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1 opacity-80" />
                        <p className="font-semibold text-foreground">No referrals found</p>
                        <p className="text-[11px]">Try adjusting your search or stage filters.</p>
                      </td>
                    </tr>
                  ) : (
                    referrals.map((r) => {
                      const nextStage = getNextStage(r.pipelineStage);
                      const mrn = r.patient?.medicalRecordNumber || 'MRN-Pending';

                      return (
                        <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <input type="checkbox" className="rounded border-border accent-black h-3.5 w-3.5" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <Link
                                href={`/referrals/${r.id}`}
                                className="font-semibold text-foreground hover:underline"
                              >
                                {r.patient?.firstName} {r.patient?.lastName}
                              </Link>
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {mrn} • {r.trackingNumber}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-[10px] font-medium">
                              {r.pipelineStage.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  r.workStatus === WorkStatus.IN_PROGRESS
                                    ? 'bg-emerald-500'
                                    : r.workStatus === WorkStatus.BLOCKED_NEEDS_INFO
                                    ? 'bg-amber-500'
                                    : 'bg-neutral-400'
                                }`}
                              />
                              {r.workStatus.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {r.priority === Priority.STAT ? (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold uppercase">
                                STAT
                              </Badge>
                            ) : r.priority === Priority.URGENT ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 font-semibold uppercase border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              >
                                URGENT
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs font-mono">Routine</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-foreground/80 truncate block max-w-[140px]">
                              {r.referringFacility || r.referralSource || 'Clinic'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-foreground/80 truncate block max-w-[140px]">
                              {r.insurancePayer || 'Self-Pay / Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-mono text-muted-foreground uppercase">
                              {r.site}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-mono text-muted-foreground">
                              v{r.version}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {nextStage && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    transitionMutation.mutate({
                                      id: r.id,
                                      targetStage: nextStage,
                                      version: r.version,
                                    })
                                  }
                                  disabled={transitionMutation.isPending}
                                  className="h-6 text-[10px] px-2 gap-1"
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
                                <DropdownMenuContent align="end" className="w-40 text-xs">
                                  <DropdownMenuItem render={<Link href={`/referrals/${r.id}`} />}>
                                    <Eye className="mr-2 h-3.5 w-3.5" />
                                    View Record
                                  </DropdownMenuItem>
                                  {r.patient?.id && (
                                    <DropdownMenuItem render={<Link href={`/patients/${r.patient.id}`} />}>
                                      Patient Profile
                                    </DropdownMenuItem>
                                  )}
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
          </Card>
        )}
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
  isAdvancing,
}: {
  stageConfig: (typeof STAGES)[0];
  referrals: ReferralRecord[];
  onAdvance: (ref: ReferralRecord) => void;
  isAdvancing: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stageConfig.stage,
  });

  const ColIcon = stageConfig.icon;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[300px] w-[325px] shrink-0 rounded-xl border transition-all duration-150 ${
        isOver
          ? 'border-black ring-2 ring-black/10 bg-muted/40 dark:border-white dark:ring-white/10'
          : 'border-border/80 bg-muted/20 shadow-2xs'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-border/70 bg-card rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${stageConfig.color}`}>
            <ColIcon className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold text-foreground tracking-tight">
            {stageConfig.label}
          </span>
        </div>
        <Badge variant="secondary" className="text-[11px] h-5 px-2 font-mono font-semibold">
          {referrals.length}
        </Badge>
      </div>

      {/* Cards Scroll Container */}
      <div className="p-3 space-y-3 min-h-[480px] max-h-[calc(100vh-270px)] overflow-y-auto">
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
              isAdvancing={isAdvancing}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Draggable Rich Clinical Card Component
// ----------------------------------------------------------------------------
function KanbanDraggableCard({
  referral,
  onAdvance,
  isAdvancing,
}: {
  referral: ReferralRecord;
  onAdvance: () => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-xl border border-border/80 bg-card p-4 shadow-xs hover:border-foreground/30 hover:shadow-sm transition-all space-y-3"
    >
      {/* Top Header: Drag Handle, Tracking ID, Priority Badge */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            title="Drag across stages"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-[10px] text-muted-foreground font-semibold truncate">
            {referral.trackingNumber}
          </span>
        </div>

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
          <span className="text-[10px] text-muted-foreground font-mono">Routine</span>
        )}
      </div>

      {/* Patient Demographic Summary */}
      <div className="flex items-start gap-2.5">
        <Avatar className="h-8 w-8 rounded-lg shrink-0 border border-border bg-muted">
          <AvatarFallback className="rounded-lg text-[10px] font-bold text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Link
            href={`/referrals/${referral.id}`}
            className="font-semibold text-xs text-foreground hover:underline truncate block"
          >
            {referral.patient?.firstName} {referral.patient?.lastName}
          </Link>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
            <span className="font-mono">{mrn}</span>
            <span>•</span>
            <span className="font-mono uppercase">{referral.site}</span>
          </div>
        </div>
      </div>

      {/* Clinical & Insurance Details */}
      <div className="space-y-1.5 text-[11px] bg-muted/30 p-2.5 rounded-lg border border-border/50">
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
              <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                {referral.insuranceMemberId}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card Footer: Work Status & Actions */}
      <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={`text-[9px] h-4 px-1.5 font-medium ${
            referral.workStatus === WorkStatus.BLOCKED_NEEDS_INFO
              ? 'border-amber-500/40 text-amber-600 bg-amber-500/10'
              : referral.workStatus === WorkStatus.IN_PROGRESS
              ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
              : 'border-border text-muted-foreground'
          }`}
        >
          {referral.workStatus.replace('_', ' ')}
        </Badge>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAdvance}
            disabled={isAdvancing}
            className="h-6 text-[10px] px-2 gap-1 bg-background text-foreground hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors"
            title="Advance to next workflow stage"
          >
            <span>Advance</span>
            <ArrowRight className="h-2.5 w-2.5" />
          </Button>

          <Link href={`/referrals/${referral.id}`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="View full referral"
            >
              <Eye className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

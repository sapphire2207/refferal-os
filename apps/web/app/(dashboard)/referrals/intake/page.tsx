'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-context';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Plus,
  Send,
  FileText,
  AlertCircle,
  AlertTriangle,
  Lock,
  Kanban,
  Search,
  X,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/app-layout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { WorkStatusBadge, PriorityBadge } from '@/components/ui/status-badge';
import { formatDistanceToNow } from 'date-fns';

interface ReferralItem {
  id: string;
  trackingNumber: string;
  patient: {
    id?: string;
    firstName: string;
    lastName: string;
    medicalRecordNumber?: string;
    mrn?: string;
  };
  pipelineStage: string;
  workStatus: string;
  priority: string;
  site: string;
  insurancePayer: string | null;
  referralSource: string | null;
  coverageVerified?: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  clinicalReviews?: {
    id: string;
    decision: string;
    reason?: string;
    notes?: string;
    createdAt: string;
  }[];
}

export default function IntakeQueuePage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  // Fetch referrals within scope to separate active intake vs pending review
  const { data, isLoading, refetch, isFetching } = useQuery<{ data: ReferralItem[]; total: number }>({
    queryKey: ['referrals-intake'],
    queryFn: async () => {
      return apiClient.get<{ data: ReferralItem[]; total: number }>(`/referrals?limit=100`);
    },
    staleTime: 30000,
  });

  const referrals = useMemo(() => data?.data || [], [data]);

  // Active work: in INTAKE stage and editable (Pending or Returned to Intake)
  const editableReferrals = useMemo(
    () =>
      referrals.filter(
        (r) =>
          r.pipelineStage === 'INTAKE' &&
          (r.workStatus === 'PENDING' ||
            r.workStatus === 'IN_PROGRESS' ||
            r.workStatus === 'RETURNED_TO_INTAKE')
      ),
    [referrals]
  );

  // Returned from clinical review needing action
  const returnedReferrals = useMemo(
    () =>
      referrals.filter(
        (r) => r.pipelineStage === 'INTAKE' && r.workStatus === 'RETURNED_TO_INTAKE'
      ),
    [referrals]
  );

  // Pending Clinical Review: forwarded by intake and locked for editing
  const pendingReviewReferrals = useMemo(
    () => referrals.filter((r) => r.workStatus === 'PENDING_REVIEW'),
    [referrals]
  );

  // Search filter
  const filteredEditable = useMemo(() => {
    if (!search.trim()) return editableReferrals;
    const query = search.toLowerCase();
    return editableReferrals.filter((r) => {
      const mrn = r.patient?.medicalRecordNumber || r.patient?.mrn || '';
      return (
        r.trackingNumber.toLowerCase().includes(query) ||
        r.patient.firstName.toLowerCase().includes(query) ||
        r.patient.lastName.toLowerCase().includes(query) ||
        mrn.toLowerCase().includes(query)
      );
    });
  }, [editableReferrals, search]);

  // Forward to review mutation
  const forwardMutation = useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      return apiClient.post(`/referrals/${id}/forward-to-review`, {
        version,
        notes: 'Intake demographic and payer verification complete',
      });
    },
    onSuccess: () => {
      toast.success('Referral forwarded to clinical review', {
        description: 'Intake data is now locked while clinical review determination is recorded.',
      });
      queryClient.invalidateQueries({ queryKey: ['referrals-intake'] });
      queryClient.invalidateQueries({ queryKey: ['referrals-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
    onError: (err: any) => {
      if (err?.status === 409) {
        toast.warning('Concurrent modification detected', {
          description: 'The referral was recently modified. Please refresh and try again.',
        });
        refetch();
      } else {
        toast.error('Failed to forward referral', {
          description: err.message || 'Please verify required fields before forwarding.',
        });
      }
    },
  });

  const canEdit = (referral: ReferralItem) => {
    return (
      referral.pipelineStage === 'INTAKE' &&
      (referral.workStatus === 'PENDING' ||
        referral.workStatus === 'IN_PROGRESS' ||
        referral.workStatus === 'RETURNED_TO_INTAKE')
    );
  };

  const canForward = (referral: ReferralItem) => {
    return canEdit(referral) && Boolean(referral.referralSource) && Boolean(referral.insurancePayer);
  };

  return (
    <AppLayout title="Intake Specialist Queue">
      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Intake Specialist Operations
              </h1>
              <Badge variant="secondary" className="text-[11px] font-mono px-2 py-0.5 font-semibold">
                {editableReferrals.length} To Process
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enroll inbound referrals, review returned cases, and forward verified records to Clinical Review
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

            <Link href="/referrals/kanban">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-background">
                <Kanban className="h-3.5 w-3.5" />
                <span>Kanban Visualizer</span>
              </Button>
            </Link>

            <Link href="/referrals/new">
              <Button size="sm" className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs">
                <Plus className="h-3.5 w-3.5" />
                <span>New Referral</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Action Required Banner if cases are returned from Clinical Review */}
        {returnedReferrals.length > 0 && (
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3 animate-in fade-in-50">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-sm block">
                {returnedReferrals.length} {returnedReferrals.length === 1 ? 'Referral' : 'Referrals'} Returned for Additional Information
              </span>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                The clinical review team sent back cases that require missing clinical documentation or updated demographics. These records are unlocked for you to edit and re-forward.
              </p>
            </div>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by tracking #, patient name, or MRN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8.5 pl-8 text-xs bg-background border-border/80"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Badge variant="outline" className="text-xs font-medium text-muted-foreground">
            {filteredEditable.length} Active in Queue • {pendingReviewReferrals.length} Pending Review
          </Badge>
        </div>

        {/* SECTION 1: Active Work in Intake (Editable) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                Active Intake Queue (Editable)
              </h2>
              <Badge variant="default" className="text-[10px] font-mono h-4.5 px-1.5 font-bold">
                {filteredEditable.length}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Verify demographics and payer coverage before forwarding
            </span>
          </div>

          <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
            <Table className="text-xs">
              <TableHeader className="bg-muted/50 text-[10px] uppercase font-semibold text-muted-foreground">
                <TableRow>
                  <TableHead className="py-2.5 px-3">Tracking #</TableHead>
                  <TableHead className="py-2.5 px-3">Patient</TableHead>
                  <TableHead className="py-2.5 px-3">MRN</TableHead>
                  <TableHead className="py-2.5 px-3">Priority</TableHead>
                  <TableHead className="py-2.5 px-3">Status</TableHead>
                  <TableHead className="py-2.5 px-3">Payer / Source</TableHead>
                  <TableHead className="py-2.5 px-3">Updated</TableHead>
                  <TableHead className="py-2.5 px-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {filteredEditable.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1 opacity-70" />
                      <p className="font-semibold text-foreground text-xs">No active referrals awaiting intake</p>
                      <p className="text-[11px] mt-0.5">All received cases have been processed or forwarded to Clinical Review.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEditable.map((ref) => {
                    const mrn = ref.patient?.medicalRecordNumber || ref.patient?.mrn || 'Pending';
                    const isReturned = ref.workStatus === 'RETURNED_TO_INTAKE';
                    const returnReason = ref.clinicalReviews?.[0]?.reason;

                    return (
                      <TableRow key={ref.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="py-3 px-3 font-mono font-medium text-foreground">
                          {ref.trackingNumber}
                        </TableCell>
                        <TableCell className="py-3 px-3">
                          <Link href={`/referrals/${ref.id}`} className="font-bold text-foreground hover:underline">
                            {ref.patient.firstName} {ref.patient.lastName}
                          </Link>
                        </TableCell>
                        <TableCell className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                          {mrn}
                        </TableCell>
                        <TableCell className="py-3 px-3">
                          <PriorityBadge priority={ref.priority} />
                        </TableCell>
                        <TableCell className="py-3 px-3">
                          <div className="space-y-1">
                            <WorkStatusBadge status={ref.workStatus} />
                            {isReturned && returnReason && (
                              <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium max-w-[200px] truncate" title={returnReason}>
                                Reason: {returnReason}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-3">
                          <div className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                            {ref.insurancePayer || 'Self-Pay / Pending'}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-3 text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(ref.updatedAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/referrals/${ref.id}`}>
                              <Button variant="outline" size="sm" className="h-7 text-[11px] px-2.5">
                                <FileText className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            </Link>

                            {canForward(ref) ? (
                              <Button
                                size="sm"
                                onClick={() => forwardMutation.mutate({ id: ref.id, version: ref.version })}
                                disabled={forwardMutation.isPending}
                                className="h-7 text-[11px] px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 gap-1 shadow-2xs"
                              >
                                <Send className="h-3 w-3" />
                                <span>Forward to Review</span>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled
                                title="Ensure Referral Source and Insurance Payer are entered before forwarding"
                                className="h-7 text-[11px] px-2 text-muted-foreground"
                              >
                                <AlertCircle className="h-3 w-3 mr-1 text-amber-500" />
                                Incomplete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* SECTION 2: Pending Clinical Review (Locked / Confidential) */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary shrink-0" />
              <h2 className="text-sm font-bold text-foreground">
                Pending Clinical Review (Locked for Intake)
              </h2>
              <Badge variant="outline" className="text-[10px] font-mono h-4.5 px-1.5 font-semibold">
                {pendingReviewReferrals.length}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Intake data is read-only while under clinical review to guarantee confidentiality
            </span>
          </div>

          <Card className="rounded-xl border border-border/80 bg-muted/20 shadow-xs overflow-hidden">
            <Table className="text-xs">
              <TableHeader className="bg-muted/60 text-[10px] uppercase font-semibold text-muted-foreground">
                <TableRow>
                  <TableHead className="py-2.5 px-3">Tracking #</TableHead>
                  <TableHead className="py-2.5 px-3">Patient</TableHead>
                  <TableHead className="py-2.5 px-3">Priority</TableHead>
                  <TableHead className="py-2.5 px-3">Assigned Role</TableHead>
                  <TableHead className="py-2.5 px-3">Site</TableHead>
                  <TableHead className="py-2.5 px-3">Forwarded</TableHead>
                  <TableHead className="py-2.5 px-3 text-right">Lock Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {pendingReviewReferrals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No referrals currently waiting in Clinical Review
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingReviewReferrals.map((ref) => (
                    <TableRow key={ref.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="py-3 px-3 font-mono font-medium text-foreground">
                        {ref.trackingNumber}
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <Link href={`/referrals/${ref.id}`} className="font-bold text-foreground hover:underline">
                          {ref.patient.firstName} {ref.patient.lastName}
                        </Link>
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <PriorityBadge priority={ref.priority} />
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <Badge variant="outline" className="text-[10px] uppercase border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold">
                          Clinical Reviewer Queue
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-3 uppercase text-[10px] font-semibold text-muted-foreground">
                        {ref.site}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(ref.updatedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right">
                        <Link href={`/referrals/${ref.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-[11px] px-2.5 gap-1 border-border/80">
                            <Lock className="h-3 w-3 text-muted-foreground" />
                            <span>View (Locked)</span>
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

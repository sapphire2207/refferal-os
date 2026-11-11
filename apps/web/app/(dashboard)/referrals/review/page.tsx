'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-context';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Kanban,
  Search,
  X,
  Eye,
  FileCheck2,
  Stethoscope,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/app-layout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { PriorityBadge, WorkStatusBadge } from '@/components/ui/status-badge';
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
    dateOfBirth?: string;
  };
  pipelineStage: string;
  workStatus: string;
  priority: string;
  site: string;
  insurancePayer: string | null;
  referralSource: string | null;
  referringProvider: string | null;
  referringFacility?: string | null;
  coverageVerified?: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface ReviewDialogData {
  referral: ReferralItem;
  decision: 'ACCEPT' | 'SEND_BACK' | 'REJECT';
}

export default function ClinicalReviewQueuePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [reviewDialog, setReviewDialog] = useState<ReviewDialogData | null>(null);
  const [reason, setReason] = useState('');

  // Fetch referrals in CLINICAL_REVIEW with PENDING_REVIEW status
  const { data, isLoading, refetch, isFetching } = useQuery<{ data: ReferralItem[]; total: number }>({
    queryKey: ['referrals-review'],
    queryFn: async () => {
      return apiClient.get<{ data: ReferralItem[]; total: number }>(
        `/referrals?pipelineStage=CLINICAL_REVIEW&workStatus=PENDING_REVIEW&limit=100`
      );
    },
    staleTime: 30000,
  });

  const referrals = useMemo(() => data?.data || [], [data]);

  // Filter by search
  const filteredReferrals = useMemo(() => {
    if (!search.trim()) return referrals;
    const query = search.toLowerCase();
    return referrals.filter((r) => {
      const mrn = r.patient?.medicalRecordNumber || r.patient?.mrn || '';
      return (
        r.trackingNumber.toLowerCase().includes(query) ||
        r.patient.firstName.toLowerCase().includes(query) ||
        r.patient.lastName.toLowerCase().includes(query) ||
        mrn.toLowerCase().includes(query)
      );
    });
  }, [referrals, search]);

  // Review decision mutation
  const reviewMutation = useMutation({
    mutationFn: async ({
      id,
      version,
      decision,
      reason,
    }: {
      id: string;
      version: number;
      decision: string;
      reason?: string;
    }) => {
      return apiClient.post(`/referrals/${id}/review-decision`, {
        version,
        decision,
        reason,
      });
    },
    onSuccess: (_, variables) => {
      const decisionText =
        variables.decision === 'ACCEPT'
          ? 'accepted and advanced to scheduling coordination'
          : variables.decision === 'SEND_BACK'
            ? 'returned to intake specialist with your notes'
            : 'rejected as ineligible';
      toast.success(`Referral ${decisionText}`);
      queryClient.invalidateQueries({ queryKey: ['referrals-review'] });
      queryClient.invalidateQueries({ queryKey: ['referrals-intake'] });
      queryClient.invalidateQueries({ queryKey: ['referrals-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      setReviewDialog(null);
      setReason('');
    },
    onError: (err: any) => {
      if (err?.status === 409) {
        toast.warning('Concurrent modification detected', {
          description: 'This referral was recently modified by another clinician. Please refresh.',
        });
        refetch();
      } else {
        toast.error('Review decision failed', {
          description: err.message || 'Please check the required clinical reason.',
        });
      }
    },
  });

  const openReviewDialog = (referral: ReferralItem, decision: 'ACCEPT' | 'SEND_BACK' | 'REJECT') => {
    setReviewDialog({ referral, decision });
    setReason('');
  };

  const handleConfirmDecision = () => {
    if (!reviewDialog) return;

    // Validate reason for SEND_BACK and REJECT
    if ((reviewDialog.decision === 'SEND_BACK' || reviewDialog.decision === 'REJECT') && !reason.trim()) {
      toast.error('Clinical justification required', {
        description: `Please document what information is needed when ${reviewDialog.decision === 'SEND_BACK' ? 'returning to Intake' : 'rejecting'}.`,
      });
      return;
    }

    reviewMutation.mutate({
      id: reviewDialog.referral.id,
      version: reviewDialog.referral.version,
      decision: reviewDialog.decision,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <AppLayout title="Clinical Review Queue">
      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Clinical Review Queue
              </h1>
              <Badge variant="outline" className="text-[11px] font-mono px-2 py-0.5 border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold">
                {referrals.length} Pending Clinical Action
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authoritative clinical triage: assess medical necessity, face-to-face orders, and forward to NP scheduling or return to intake
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
          </div>
        </div>

        {/* Search */}
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
          <Badge variant="secondary" className="text-xs font-medium">
            {filteredReferrals.length} referrals waiting for determination
          </Badge>
        </div>

        {/* Referrals Table */}
        <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 text-[10px] uppercase font-semibold text-muted-foreground">
              <TableRow>
                <TableHead className="py-2.5 px-3">Tracking #</TableHead>
                <TableHead className="py-2.5 px-3">Patient</TableHead>
                <TableHead className="py-2.5 px-3">MRN</TableHead>
                <TableHead className="py-2.5 px-3">Priority</TableHead>
                <TableHead className="py-2.5 px-3">Referring Provider / Facility</TableHead>
                <TableHead className="py-2.5 px-3">Insurance Payer</TableHead>
                <TableHead className="py-2.5 px-3">Forwarded</TableHead>
                <TableHead className="py-2.5 px-3 text-right">3 Determination Choices</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/60">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                    <span>Loading clinical review queue…</span>
                  </TableCell>
                </TableRow>
              ) : filteredReferrals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    <FileCheck2 className="h-6 w-6 text-emerald-500 mx-auto mb-1 opacity-70" />
                    <p className="font-semibold text-foreground text-xs">No referrals pending clinical review</p>
                    <p className="text-[11px] mt-0.5">All forwarded cases have received an authoritative determination.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredReferrals.map((ref) => {
                  const mrn = ref.patient?.medicalRecordNumber || ref.patient?.mrn || 'Pending';

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
                        <div className="space-y-0.5 text-xs truncate max-w-[170px]">
                          <div className="font-medium text-foreground truncate">
                            {ref.referringFacility || ref.referralSource || 'Clinic'}
                          </div>
                          {ref.referringProvider && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {ref.referringProvider}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <div className="text-[11px] text-foreground font-medium truncate max-w-[140px]">
                          {ref.insurancePayer || 'Self-Pay / Pending'}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(ref.updatedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/referrals/${ref.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground">
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </Link>

                          {/* 3 Authoritative Options */}
                          <Button
                            size="sm"
                            onClick={() => openReviewDialog(ref, 'ACCEPT')}
                            className="h-7 text-[11px] px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1 shadow-2xs"
                            title="Accept criteria and forward to scheduling coordination"
                          >
                            <CheckCircle className="h-3 w-3" />
                            <span>Accept</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReviewDialog(ref, 'SEND_BACK')}
                            className="h-7 text-[11px] px-2.5 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-medium gap-1"
                            title="Return referral back to intake for corrections or missing orders"
                          >
                            <ArrowLeft className="h-3 w-3" />
                            <span>Send Back</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReviewDialog(ref, 'REJECT')}
                            className="h-7 text-[11px] px-2 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                            title="Reject referral permanently (ineligible)"
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Review Decision Dialog */}
        {reviewDialog && (
          <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
            <DialogContent className="sm:max-w-md p-5 space-y-4">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold">
                  {reviewDialog.decision === 'ACCEPT'
                    ? '🟢 Confirm Clinical Acceptance'
                    : reviewDialog.decision === 'SEND_BACK'
                      ? '🟡 Return Referral to Intake Specialist'
                      : '🔴 Reject Referral (Terminal Decline)'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {reviewDialog.decision === 'ACCEPT' &&
                    'Approves medical necessity and forwards this case to Scheduling Coordination (Office Manager / Scheduler) for NP home visit dispatch.'}
                  {reviewDialog.decision === 'SEND_BACK' &&
                    'Returns this case back to the Intake Specialist and unlocks the fields so they can attach missing clinical documentation or correct demographics.'}
                  {reviewDialog.decision === 'REJECT' &&
                    'Permanently closes this referral as medically ineligible or out of operating territory. This cannot be undone.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-1 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] space-y-1">
                  <div className="font-semibold text-foreground">
                    {reviewDialog.referral.patient.firstName} {reviewDialog.referral.patient.lastName}
                  </div>
                  <div className="text-muted-foreground">
                    Tracking #: {reviewDialog.referral.trackingNumber} • MRN: {reviewDialog.referral.patient.medicalRecordNumber || reviewDialog.referral.patient.mrn || 'N/A'} • Source: {reviewDialog.referral.referralSource || 'Inbound'}
                  </div>
                </div>

                {(reviewDialog.decision === 'SEND_BACK' || reviewDialog.decision === 'REJECT') && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground block">
                      Clinical Justification / Reason <span className="text-rose-500">*</span>
                    </label>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={
                        reviewDialog.decision === 'SEND_BACK'
                          ? 'Specify exactly what document or clarification is required (e.g. Missing signed face-to-face physician order, HMO prior authorization needed)…'
                          : 'Document clinical criteria failure, out-of-territory reason, or non-covered status…'
                      }
                      rows={3}
                      className="text-xs bg-background"
                      required
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/60">
                <Button variant="ghost" size="sm" onClick={() => setReviewDialog(null)} className="text-xs h-8">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmDecision}
                  disabled={reviewMutation.isPending}
                  className={
                    reviewDialog.decision === 'ACCEPT'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 font-semibold'
                      : reviewDialog.decision === 'SEND_BACK'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white text-xs h-8 font-semibold'
                        : 'bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 font-semibold'
                  }
                >
                  {reviewMutation.isPending
                    ? 'Recording Determination…'
                    : reviewDialog.decision === 'ACCEPT'
                      ? 'Confirm & Forward to Scheduling'
                      : reviewDialog.decision === 'SEND_BACK'
                        ? 'Return to Intake Queue'
                        : 'Confirm Rejection'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AppLayout>
  );
}

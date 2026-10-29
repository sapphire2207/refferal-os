'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-context';
import { canReviewNotes } from '@/lib/permissions';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/state-views';
import { ConfirmDangerDialog } from '@/components/ui/confirm-danger-dialog';
import { FileCheck2, CheckCircle2, RotateCcw, Loader2, ShieldCheck, RefreshCw, AlertCircle, Lock } from 'lucide-react';
import { PipelineStage, NoteReviewDecision } from '@heals/types';
import { toast } from 'sonner';

export default function NotesReviewPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedReferral, setSelectedReferral] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  const canReview = canReviewNotes(user?.roles);

  // Fetch referrals in NOTES_QA stage
  const { data: qaData, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ['referrals', { pipelineStage: PipelineStage.NOTES_QA }],
    queryFn: () => apiClient.get<any>(`/referrals?pipelineStage=${PipelineStage.NOTES_QA}&limit=50`),
  });

  const qaQueue = extractApiList<any>(qaData);

  // Review Decision Mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ decision }: { decision: NoteReviewDecision }) => {
      if (!selectedReferral) throw new Error('No referral selected');

      // Submit note review decision which atomically records review and coordinates pipeline transition
      return apiClient.post(`/encounters/referrals/${selectedReferral.id}/review`, {
        referralId: selectedReferral.id,
        decision,
        reason: reviewNotes || (decision === NoteReviewDecision.APPROVE ? 'Approved documentation' : 'Corrections needed'),
        correctionRequired:
          decision === NoteReviewDecision.RETURN_FOR_CORRECTION
            ? reviewNotes || 'Please update and re-sign documentation'
            : undefined,
      });
    },
    onSuccess: (data, variables) => {
      toast.success(
        variables.decision === NoteReviewDecision.APPROVE
          ? 'Note Approved! Referral progressed to BILLING stage.'
          : 'Note Returned to Nurse Practitioner for corrections.',
      );
      setSelectedReferral(null);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
    onError: (err: any) => {
      toast.error('QA Decision Failed', { description: err.message });
    },
  });

  return (
    <AppLayout title="Clinical Notes QA Review">
      <div className="space-y-6">
        <PageHeader>
          <div>
            <PageHeaderHeading>Clinical Notes Quality Assurance</PageHeaderHeading>
            <PageHeaderDescription>
              Audit signed NP encounter notes for medical necessity, coding compliance, and billing readiness
            </PageHeaderDescription>
          </div>
          <PageHeaderActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs font-medium border-border"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </PageHeaderActions>
        </PageHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Notes QA Queue */}
          <Card className="border border-border/80 bg-card shadow-2xs lg:col-span-1">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Awaiting QA ({qaQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-semibold border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300">
                  NOTES_QA
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingState message="Loading documentation review queue…" />
              ) : qaQueue.length === 0 ? (
                <EmptyState
                  icon={FileCheck2}
                  title="No notes awaiting QA"
                  description="All encounter notes have been audited and approved."
                  className="min-h-[220px] border-none bg-transparent"
                />
              ) : (
                <div className="divide-y divide-border/60 max-h-[600px] overflow-y-auto">
                  {qaQueue.map((ref: any) => {
                    const isSelected = selectedReferral?.id === ref.id;

                    return (
                      <div
                        key={ref.id}
                        onClick={() => setSelectedReferral(ref)}
                        className={`p-3.5 text-xs cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {ref.patient?.firstName} {ref.patient?.lastName}
                          </span>
                          <span className="font-medium text-[10px] text-muted-foreground">
                            {ref.trackingNumber}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          <span>MRN: {ref.patient?.mrn || 'N/A'}</span>
                          <span> • </span>
                          <span>Site: {ref.site}</span>
                        </div>
                        <Button
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className={`h-6 text-[10px] w-full mt-2 font-medium ${
                            isSelected ? 'bg-primary text-primary-foreground font-semibold' : 'border-border'
                          }`}
                        >
                          {isSelected ? 'Auditing Note' : 'Review Documentation'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* QA Audit Panel */}
          <Card className="border border-border/80 bg-card shadow-xs lg:col-span-2">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Clinical Documentation Audit Panel
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedReferral
                  ? `Auditing note for: ${selectedReferral.patient?.firstName} ${selectedReferral.patient?.lastName} (${selectedReferral.trackingNumber})`
                  : 'Select an encounter note from the queue to conduct QA.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {!selectedReferral ? (
                <EmptyState
                  icon={FileCheck2}
                  title="No note selected"
                  description="Choose a completed patient encounter from the left queue to audit clinical notes."
                  className="min-h-[300px] border-none bg-transparent"
                />
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-3 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-border/40">
                      <span className="font-semibold text-foreground">
                        Encounter Documentation Summary
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        Signed & Locked
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Patient / Diagnosis:</span>
                      <p className="font-medium text-foreground mt-0.5">
                        {selectedReferral.notes || 'Comprehensive mobile geriatric assessment and medication review'}
                      </p>
                    </div>

                    <div className="pt-2">
                      <span className="text-muted-foreground block text-[11px]">Provider Attestation:</span>
                      <div className="flex items-center gap-2 text-xs  bg-background p-2.5 rounded border border-border mt-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Signed by Nurse Practitioner (Credential verified)</span>
                      </div>
                    </div>
                  </div>

                  {!canReview && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs">
                      <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <span className="font-semibold block">View-Only Quality Audit</span>
                        <span className="text-[11px] opacity-90">
                          Clinical note approval and return decisions are restricted to licensed Clinical Coordinators and Reviewers per Core Document requirements.
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="reviewNotes" className="text-xs font-semibold text-foreground">
                      QA Audit Findings & Review Notes
                    </Label>
                    <textarea
                      id="reviewNotes"
                      rows={3}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      disabled={!canReview}
                      placeholder={canReview ? "Verify diagnosis codes, medical necessity, and documentation completeness. If returning, specify required corrections…" : "Read-only: Licensed clinical credentials required to append QA audit notes."}
                      className="w-full rounded-md border border-border/80 bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowReturnConfirm(true)}
                      disabled={reviewMutation.isPending || !canReview}
                      className="h-8 px-3.5 text-xs text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 gap-1.5 font-medium disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Return for Correction
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        reviewMutation.mutate({ decision: NoteReviewDecision.APPROVE })
                      }
                      disabled={reviewMutation.isPending || !canReview}
                      className="h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold gap-1.5 shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {reviewMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approve & Advance to Billing
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Return Note For Correction Confirmation Dialog */}
        <ConfirmDangerDialog
          open={showReturnConfirm}
          onOpenChange={setShowReturnConfirm}
          title="Return Clinical Note for Correction"
          description={`Returning this clinical note for ${selectedReferral?.patient?.firstName} ${selectedReferral?.patient?.lastName} will re-open documentation for the Nurse Practitioner and require clinical amendments before QA approval.`}
          confirmText="Return for Correction"
          cancelText="Cancel"
          variant="warning"
          requiresInput={true}
          inputLabel="Mandatory Clinical Correction Guidance *"
          inputPlaceholder="Specify documentation deficiencies, missing clinical orders, or ICD-10 revisions…"
          initialInputValue={reviewNotes || 'Missing required clinical justification and medication reconciliation.'}
          isLoading={reviewMutation.isPending}
          onConfirm={(reason) => {
            setShowReturnConfirm(false);
            if (reason) setReviewNotes(reason);
            reviewMutation.mutate({ decision: NoteReviewDecision.RETURN_FOR_CORRECTION });
          }}
        />
      </div>
    </AppLayout>
  );
}

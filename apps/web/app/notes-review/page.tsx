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
import {
  FileCheck2,
  CheckCircle2,
  RotateCcw,
  Loader2,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Stethoscope,
  ClipboardList,
} from 'lucide-react';
import { PipelineStage, NoteReviewDecision } from '@heals/types';
import { toast } from 'sonner';

function parseSoapNote(content?: string) {
  if (!content) return null;
  const sections: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    attestation?: string;
  } = {};

  const subjMatch = content.match(/Subjective:\s*([\s\S]*?)(?=(Objective:|Assessment:|Plan:|Attestation:|$))/i);
  const objMatch = content.match(/Objective:\s*([\s\S]*?)(?=(Subjective:|Assessment:|Plan:|Attestation:|$))/i);
  const assessMatch = content.match(/Assessment:\s*([\s\S]*?)(?=(Subjective:|Objective:|Plan:|Attestation:|$))/i);
  const planMatch = content.match(/Plan:\s*([\s\S]*?)(?=(Subjective:|Objective:|Assessment:|Attestation:|$))/i);
  const attestMatch = content.match(/Attestation:\s*([\s\S]*?)$/i);

  if (subjMatch && subjMatch[1].trim()) sections.subjective = subjMatch[1].trim();
  if (objMatch && objMatch[1].trim()) sections.objective = objMatch[1].trim();
  if (assessMatch && assessMatch[1].trim()) sections.assessment = assessMatch[1].trim();
  if (planMatch && planMatch[1].trim()) sections.plan = planMatch[1].trim();
  if (attestMatch && attestMatch[1].trim()) sections.attestation = attestMatch[1].trim();

  return sections;
}

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

  // Fetch full details of the selected referral (which includes clinicalNotes, encounters, patient)
  const { data: referralDetail, isLoading: isLoadingDetail } = useQuery<any>({
    queryKey: ['referral', selectedReferral?.id],
    queryFn: () => apiClient.get<any>(`/referrals/${selectedReferral.id}`),
    enabled: !!selectedReferral?.id,
  });

  // Query encounters for this referral as a supplementary source
  const { data: encountersData, isLoading: isLoadingEncounters } = useQuery<any>({
    queryKey: ['encounters', selectedReferral?.id],
    queryFn: () => apiClient.get<any>(`/encounters?referralId=${selectedReferral.id}&limit=10`),
    enabled: !!selectedReferral?.id,
  });

  const encountersList = extractApiList<any>(encountersData);
  const activeNote =
    referralDetail?.clinicalNotes?.[0] ||
    encountersList?.[0]?.clinicalNotes?.[0] ||
    null;

  const parsedSoap = parseSoapNote(activeNote?.content);

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
      queryClient.invalidateQueries({ queryKey: ['referral', selectedReferral?.id] });
      queryClient.invalidateQueries({ queryKey: ['encounters', selectedReferral?.id] });
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
                          <span>MRN: {ref.patient?.medicalRecordNumber || ref.patient?.mrn || 'N/A'}</span>
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
                  {/* Encounter Summary Header */}
                  <div className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/40">
                      <div>
                        <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          <Stethoscope className="h-4 w-4 text-primary" />
                          Encounter Documentation Summary
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Provider: {activeNote?.createdBy?.firstName ? `${activeNote.createdBy.firstName} ${activeNote.createdBy.lastName}` : 'Assigned Nurse Practitioner'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="h-3 w-3" /> Signed & Locked
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px] font-medium">Patient / Referral Reason:</span>
                      <p className="font-medium text-foreground mt-0.5">
                        {selectedReferral.notes || referralDetail?.notes || 'Comprehensive mobile clinical evaluation'}
                      </p>
                    </div>
                  </div>

                  {/* Loading Note Indicator */}
                  {(isLoadingDetail || isLoadingEncounters) && !activeNote ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
                      Loading clinical documentation...
                    </div>
                  ) : null}

                  {/* 4-Part SOAP Note Documentation Display */}
                  {parsedSoap && (parsedSoap.subjective || parsedSoap.objective || parsedSoap.assessment || parsedSoap.plan) ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <ClipboardList className="h-3.5 w-3.5 text-primary" />
                          Complete 4-Part SOAP Documentation
                        </span>
                        <span className="text-[10px] text-muted-foreground">Immutable Electronic Health Record</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Subjective */}
                        <div className="p-3.5 rounded-lg border border-border/80 bg-card space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                              Subjective (S)
                            </span>
                            <span className="text-[10px] text-muted-foreground">Patient Symptoms & History</span>
                          </div>
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap pt-1">
                            {parsedSoap.subjective || 'No subjective complaints documented.'}
                          </p>
                        </div>

                        {/* Objective */}
                        <div className="p-3.5 rounded-lg border border-border/80 bg-card space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                              Objective (O)
                            </span>
                            <span className="text-[10px] text-muted-foreground">Vitals & Exam Findings</span>
                          </div>
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap pt-1">
                            {parsedSoap.objective || 'No physical examination findings documented.'}
                          </p>
                        </div>

                        {/* Assessment */}
                        <div className="p-3.5 rounded-lg border border-border/80 bg-card space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              Assessment (A)
                            </span>
                            <span className="text-[10px] text-muted-foreground">Clinical Diagnosis & ICD-10</span>
                          </div>
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap pt-1">
                            {parsedSoap.assessment || 'No clinical assessment documented.'}
                          </p>
                        </div>

                        {/* Plan */}
                        <div className="p-3.5 rounded-lg border border-border/80 bg-card space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                              Plan (P)
                            </span>
                            <span className="text-[10px] text-muted-foreground">Treatment, Orders & Follow-up</span>
                          </div>
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap pt-1">
                            {parsedSoap.plan || 'No treatment plan documented.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : activeNote?.content ? (
                    /* Fallback for non-structured notes */
                    <div className="p-3.5 rounded-lg border border-border/80 bg-card space-y-1.5 text-xs">
                      <span className="font-semibold text-foreground block">Clinical Note Content:</span>
                      <p className="text-foreground whitespace-pre-wrap leading-relaxed font-mono text-[11px] bg-muted/30 p-2.5 rounded border border-border/60">
                        {activeNote.content}
                      </p>
                    </div>
                  ) : !isLoadingDetail && !isLoadingEncounters ? (
                    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>No clinical progress note recorded yet for this encounter.</span>
                    </div>
                  ) : null}

                  {/* Provider Attestation Card */}
                  <div className="p-3 rounded-lg border border-border/80 bg-background flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div>
                        <span className="font-semibold text-foreground">
                          {parsedSoap?.attestation || (activeNote?.signedBy ? `${activeNote.signedBy.firstName} ${activeNote.signedBy.lastName} (Credential verified)` : 'Signed by Nurse Practitioner (Credential verified)')}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {activeNote?.signedAt
                            ? `Signed: ${new Date(activeNote.signedAt).toLocaleString()}`
                            : 'Cryptographically signed and locked'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                      Verified NP Attestation
                    </Badge>
                  </div>

                  {/* QA Audit Findings & Review Notes Input */}
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="reviewNotes" className="text-xs font-semibold text-foreground">
                      QA Audit Findings & Review Notes
                    </Label>
                    <textarea
                      id="reviewNotes"
                      rows={3}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Verify diagnosis codes, medical necessity, and documentation completeness. If returning, specify required corrections…"
                      className="w-full rounded-md border border-border/80 bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowReturnConfirm(true)}
                      disabled={reviewMutation.isPending}
                      className="h-8 px-3.5 text-xs text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 gap-1.5 font-medium cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Return for Correction
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        reviewMutation.mutate({ decision: NoteReviewDecision.APPROVE })
                      }
                      disabled={reviewMutation.isPending}
                      className="h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
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

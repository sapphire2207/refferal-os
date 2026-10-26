'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileCheck2, CheckCircle2, RotateCcw, AlertTriangle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { PipelineStage, NoteReviewDecision } from '@heals/types';
import { toast } from 'sonner';

export default function NotesReviewPage() {
  const queryClient = useQueryClient();
  const [selectedReferral, setSelectedReferral] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Fetch referrals in NOTES_QA stage
  const { data: qaData, isLoading } = useQuery<any>({
    queryKey: ['referrals', { stage: PipelineStage.NOTES_QA }],
    queryFn: () => apiClient.get<any>(`/referrals?stage=${PipelineStage.NOTES_QA}&limit=50`),
  });

  const qaQueue = qaData?.items || [];

  // Review Decision Mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ decision }: { decision: NoteReviewDecision }) => {
      if (!selectedReferral) throw new Error('No referral selected');

      // 1. Submit note review decision
      await apiClient.post('/encounters/notes/review', {
        referralId: selectedReferral.id,
        decision,
        reviewNotes,
      });

      // 2. Advance or return pipeline stage based on decision
      const targetStage =
        decision === NoteReviewDecision.APPROVE
          ? PipelineStage.BILLING
          : PipelineStage.NP_VISIT;

      return apiClient.post(
        `/referrals/${selectedReferral.id}/transitions`,
        {
          targetStage,
          reason: `Notes QA: ${decision} - ${reviewNotes || 'Quality review completed'}`,
          version: selectedReferral.version,
        },
        { idempotencyKey: `qa-${selectedReferral.id}-${Date.now()}` },
      );
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
        <div className="border-b border-border/60 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Clinical Documentation QA & Integrity Review
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit signed NP encounter notes for medical necessity, coding compliance, and billing readiness
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Notes QA Queue */}
          <Card className="border border-border/80 lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Awaiting QA ({qaQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  NOTES_QA
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                  Loading QA queue...
                </div>
              ) : qaQueue.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No encounter notes currently awaiting QA review.
                </div>
              ) : (
                <div className="divide-y divide-border/60 max-h-[600px] overflow-y-auto">
                  {qaQueue.map((ref: any) => {
                    const isSelected = selectedReferral?.id === ref.id;

                    return (
                      <div
                        key={ref.id}
                        onClick={() => setSelectedReferral(ref)}
                        className={`p-3.5 text-xs cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {ref.patient?.firstName} {ref.patient?.lastName}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
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
                          className="h-6 text-[10px] w-full mt-2"
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
          <Card className="border border-border/80 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileCheck2 className="h-4 w-4" />
                Clinical Documentation Audit Panel
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedReferral
                  ? `Auditing note for: ${selectedReferral.patient?.firstName} ${selectedReferral.patient?.lastName}`
                  : 'Select an encounter note from the queue to conduct QA.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedReferral ? (
                <div className="py-16 text-center text-xs text-muted-foreground">
                  <FileCheck2 className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                  Select an encounter note awaiting QA review from the queue.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-border/60 bg-muted/20 space-y-3 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-border/40">
                      <span className="font-semibold text-foreground">
                        Encounter Documentation Summary
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        Signed & Locked
                      </Badge>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Patient / Diagnosis:</span>
                      <p className="font-medium text-foreground">
                        {selectedReferral.notes || 'Comprehensive mobile geriatric assessment'}
                      </p>
                    </div>

                    <div className="pt-2">
                      <span className="text-muted-foreground block text-[11px]">Provider Attestation:</span>
                      <div className="flex items-center gap-2 text-xs font-mono bg-background p-2 rounded border border-border/50">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Signed by NP Provider on file</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reviewNotes" className="text-xs font-semibold">
                      QA Audit Findings & Review Notes
                    </Label>
                    <textarea
                      id="reviewNotes"
                      rows={3}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Verify diagnosis codes, medical necessity, and documentation completeness. If returning, specify required corrections..."
                      className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        reviewMutation.mutate({ decision: NoteReviewDecision.RETURN_FOR_CORRECTION })
                      }
                      disabled={reviewMutation.isPending}
                      className="h-9 px-4 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 border-amber-500/30 gap-1.5"
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
                      className="h-9 px-5 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black text-xs font-semibold gap-1.5"
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
      </div>
    </AppLayout>
  );
}

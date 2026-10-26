'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Calendar,
  FileText,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  XCircle,
  FileCheck2,
  Clock,
  Loader2,
  Receipt,
  User,
  Shield,
  Stethoscope,
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority, ClinicalReviewDecision, NoteReviewDecision, DocumentType } from '@heals/types';
import { toast } from 'sonner';

export default function ReferralDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>(DocumentType.REFERRAL_FORM);
  const [reviewDecision, setReviewDecision] = useState<ClinicalReviewDecision>(ClinicalReviewDecision.ACCEPT);
  const [reviewNotes, setReviewNotes] = useState('');
  const [statusReason, setStatusReason] = useState('');

  // Fetch Referral details from backend
  const { data: referral, isLoading, error } = useQuery<any>({
    queryKey: ['referral', id],
    queryFn: () => apiClient.get<any>(`/referrals/${id}`),
    enabled: !!id,
  });

  // Stage Transition Mutation
  const transitionMutation = useMutation({
    mutationFn: ({ targetStage, reason }: { targetStage: PipelineStage; reason: string }) =>
      apiClient.post(
        `/referrals/${id}/transitions`,
        { targetStage, reason, version: referral.version },
        { idempotencyKey: `trans-${id}-${Date.now()}` },
      ),
    onSuccess: (data, variables) => {
      toast.success(`Referral moved to ${variables.targetStage.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['referral', id] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
    onError: (err: any) => {
      toast.error('Gate Validation Failed', {
        description: err.message || 'Prerequisite conditions not met for this stage transition.',
      });
    },
  });

  // Work Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ workStatus, blockedReason }: { workStatus: WorkStatus; blockedReason?: string }) =>
      apiClient.patch(`/referrals/${id}/work-status`, { workStatus, blockedReason, version: referral.version }),
    onSuccess: () => {
      toast.success('Work status updated');
      queryClient.invalidateQueries({ queryKey: ['referral', id] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
    onError: (err: any) => {
      toast.error('Status Update Failed', { description: err.message });
    },
  });

  // Clinical Review Decision Mutation
  const reviewMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/clinical-review', {
        referralId: id,
        decision: reviewDecision,
        notes: reviewNotes,
      }),
    onSuccess: () => {
      toast.success(`Clinical Review recorded: ${reviewDecision}`);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['referral', id] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
    onError: (err: any) => {
      toast.error('Review Decision Failed', { description: err.message });
    },
  });

  // Document Upload Mutation
  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error('No file selected');
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('referralId', id);
      formData.append('patientId', referral.patientId);
      formData.append('documentType', docType);
      return apiClient.upload('/documents/upload', formData);
    },
    onSuccess: () => {
      toast.success('Document uploaded and queued for AI extraction');
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['referral', id] });
    },
    onError: (err: any) => {
      toast.error('Upload Failed', { description: err.message });
    },
  });

  if (isLoading) {
    return (
      <AppLayout title="Referral Details">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (error || !referral) {
    return (
      <AppLayout title="Referral Not Found">
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-destructive">Referral not found or out of authorized scope.</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/referrals')}>
            Return to Referrals
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Referral: ${referral.trackingNumber}`}>
      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/referrals')}
              className="h-8 px-2 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Referrals
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {referral.patient?.firstName} {referral.patient?.lastName}
                </h1>
                <Badge variant="outline" className="font-mono text-xs">
                  {referral.trackingNumber}
                </Badge>
                {referral.priority === Priority.STAT && (
                  <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                    STAT
                  </Badge>
                )}
                {referral.priority === Priority.URGENT && (
                  <Badge variant="secondary" className="text-[10px] uppercase bg-amber-500/15 text-amber-600">
                    URGENT
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>DOB: {referral.patient?.dateOfBirth}</span>
                <span>•</span>
                <span>MRN: {referral.patient?.mrn || 'N/A'}</span>
                <span>•</span>
                <span>Site: {referral.site} ({referral.state})</span>
                <span>•</span>
                <span className="font-mono">OCC Version: v{referral.version}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Current Pipeline Stage
              </span>
              <Badge className="bg-black text-white dark:bg-white dark:text-black font-semibold text-xs mt-0.5">
                {referral.pipelineStage.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex flex-col items-end ml-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Work Status
              </span>
              <Badge
                variant="outline"
                className={`text-xs mt-0.5 ${
                  referral.workStatus === WorkStatus.BLOCKED_NEEDS_INFO
                    ? 'border-amber-500/50 text-amber-600 bg-amber-500/10'
                    : referral.workStatus === WorkStatus.IN_PROGRESS
                    ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/10'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {referral.workStatus.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </div>

        {/* Action Panel for Clinical Triage & Transitions */}
        <Card className="border border-border/80 bg-muted/20">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Operational Gate Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Quick Status Modifiers */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Set Status:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatusMutation.mutate({ workStatus: WorkStatus.IN_PROGRESS })}
                  className="h-7 text-[11px]"
                >
                  In Progress
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateStatusMutation.mutate({
                      workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
                      blockedReason: 'Missing signed clinical order',
                    })
                  }
                  className="h-7 text-[11px] text-amber-600"
                >
                  Blocked / Needs Info
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatusMutation.mutate({ workStatus: WorkStatus.COMPLETED })}
                  className="h-7 text-[11px] text-emerald-600"
                >
                  Complete Status
                </Button>
              </div>

              {/* Stage Transition Actions */}
              <div className="ml-auto flex items-center gap-2">
                {referral.pipelineStage === PipelineStage.INTAKE && (
                  <Button
                    size="sm"
                    onClick={() =>
                      transitionMutation.mutate({
                        targetStage: PipelineStage.CLINICAL_REVIEW,
                        reason: 'Intake verification complete',
                      })
                    }
                    disabled={transitionMutation.isPending}
                    className="h-8 text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black gap-1.5"
                  >
                    <span>Advance to Clinical Review</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}

                {referral.pipelineStage === PipelineStage.CLINICAL_REVIEW && (
                  <Button
                    size="sm"
                    onClick={() =>
                      transitionMutation.mutate({
                        targetStage: PipelineStage.SCHEDULING,
                        reason: 'Clinical acceptance criteria met',
                      })
                    }
                    disabled={transitionMutation.isPending}
                    className="h-8 text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black gap-1.5"
                  >
                    <span>Accept & Move to Scheduling</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}

                {referral.pipelineStage === PipelineStage.SCHEDULING && (
                  <Button
                    size="sm"
                    onClick={() =>
                      transitionMutation.mutate({
                        targetStage: PipelineStage.NP_VISIT,
                        reason: 'Provider dispatched and confirmed',
                      })
                    }
                    disabled={transitionMutation.isPending}
                    className="h-8 text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black gap-1.5"
                  >
                    <span>Confirm & Dispatch NP Visit</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}

                {referral.pipelineStage === PipelineStage.NP_VISIT && (
                  <Button
                    size="sm"
                    onClick={() =>
                      transitionMutation.mutate({
                        targetStage: PipelineStage.NOTES_QA,
                        reason: 'Encounter note submitted for QA',
                      })
                    }
                    disabled={transitionMutation.isPending}
                    className="h-8 text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black gap-1.5"
                  >
                    <span>Submit to Notes QA</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}

                {referral.pipelineStage === PipelineStage.NOTES_QA && (
                  <Button
                    size="sm"
                    onClick={() =>
                      transitionMutation.mutate({
                        targetStage: PipelineStage.BILLING,
                        reason: 'Clinical notes QA approved',
                      })
                    }
                    disabled={transitionMutation.isPending}
                    className="h-8 text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black gap-1.5"
                  >
                    <span>Approve & Move to Billing</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* Clinical Review Decision Block if in CLINICAL_REVIEW */}
            {referral.pipelineStage === PipelineStage.CLINICAL_REVIEW && (
              <div className="pt-3 border-t border-border/50">
                <span className="text-xs font-semibold text-foreground block mb-2">
                  Record Formal Clinical Review Decision
                </span>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <select
                    value={reviewDecision}
                    onChange={(e) => setReviewDecision(e.target.value as ClinicalReviewDecision)}
                    className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value={ClinicalReviewDecision.ACCEPT}>ACCEPT (Criteria Satisfied)</option>
                    <option value={ClinicalReviewDecision.RETURN}>RETURN (Missing Clinical Order)</option>
                    <option value={ClinicalReviewDecision.REJECT}>REJECT (Ineligible / Out of Service)</option>
                  </select>
                  <Input
                    placeholder="Enter clinical rationale or notes..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (
                        reviewDecision === ClinicalReviewDecision.REJECT &&
                        !window.confirm(
                          'Rejecting a referral permanently closes the clinical case with outcome REJECTED. Are you sure you wish to proceed?',
                        )
                      ) {
                        return;
                      }
                      reviewMutation.mutate();
                    }}
                    disabled={reviewMutation.isPending}
                    className="h-8 text-xs px-3"
                  >
                    Submit Decision
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabbed Detail Sections */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="h-9 p-1 bg-muted/60">
            <TabsTrigger value="overview" className="text-xs">
              Overview & Clinical Notes
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs">
              Documents ({referral.documents?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="appointments" className="text-xs">
              Appointments
            </TabsTrigger>
            <TabsTrigger value="encounters" className="text-xs">
              Encounters & Notes
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs">
              Audit Timeline
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border border-border/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Patient Demographics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Full Name:</span>
                    <span className="font-semibold">{referral.patient?.firstName} {referral.patient?.lastName}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Date of Birth:</span>
                    <span>{referral.patient?.dateOfBirth}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Phone:</span>
                    <span>{referral.patient?.phone || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">MRN:</span>
                    <span className="font-mono">{referral.patient?.mrn || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Address / State:</span>
                    <span>{referral.patient?.city || 'New York'}, {referral.state}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    Referral Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Referral Source:</span>
                    <span className="font-medium">{referral.referralSource || 'Standard Care Coordination'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Created Date:</span>
                    <span>{new Date(referral.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Assigned Clinician:</span>
                    <span>{referral.assignedTo ? `${referral.assignedTo.firstName} ${referral.assignedTo.lastName}` : 'Unassigned'}</span>
                  </div>
                  <div className="pt-2">
                    <span className="text-muted-foreground block mb-1">Clinical Notes / Reason:</span>
                    <p className="bg-muted/40 p-2.5 rounded-md text-foreground whitespace-pre-wrap leading-relaxed">
                      {referral.notes || 'No initial notes provided.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4 pt-4">
            <Card className="border border-border/80">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Attached Clinical Documents</CardTitle>
                  <CardDescription className="text-xs">
                    Protected storage with magic-bytes verification and AI extraction coordination
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload Form */}
                <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
                  <Input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="h-8 text-xs file:h-6 file:text-xs"
                  />
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                    className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value={DocumentType.REFERRAL_FORM}>Referral Form</option>
                    <option value={DocumentType.CLINICAL_ORDER}>Clinical Order</option>
                    <option value={DocumentType.INSURANCE_CARD}>Insurance Card</option>
                    <option value={DocumentType.MEDICAL_RECORD}>Medical Record</option>
                  </select>
                  <Button
                    size="sm"
                    onClick={() => uploadDocMutation.mutate()}
                    disabled={!uploadFile || uploadDocMutation.isPending}
                    className="h-8 text-xs px-3 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black gap-1.5 shrink-0"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload & Extract</span>
                  </Button>
                </div>

                {/* Documents List */}
                {!referral.documents || referral.documents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No documents attached yet. Upload a referral order or insurance card above.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 border border-border/60 rounded-md">
                    {referral.documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 text-xs">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="font-semibold text-foreground">{doc.originalName}</span>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span>Type: {doc.documentType}</span>
                              <span>•</span>
                              <span>Uploaded: {new Date(doc.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {doc.verified ? 'Verified' : 'Pending Verification'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-4 pt-4">
            <Card className="border border-border/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Scheduled Clinical Appointments</CardTitle>
                <CardDescription className="text-xs">Mobile visit provider bookings</CardDescription>
              </CardHeader>
              <CardContent>
                {!referral.appointments || referral.appointments.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No appointments scheduled. When moved to SCHEDULING, dispatch provider from the Schedule tab.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {referral.appointments.map((apt: any) => (
                      <div key={apt.id} className="py-3 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold">Visit on {new Date(apt.appointmentDate).toLocaleString()}</span>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Status: {apt.status}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{apt.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Encounters Tab */}
          <TabsContent value="encounters" className="space-y-4 pt-4">
            <Card className="border border-border/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Nurse Practitioner Encounter & SOAP Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {!referral.encounter ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No clinical encounter recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-muted/30 rounded-md border border-border/60">
                      <span className="font-semibold block mb-1">Date of Service: {referral.encounter.dateOfService}</span>
                      <p className="text-muted-foreground">Outcome: {referral.encounter.outcome}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Timeline Tab */}
          <TabsContent value="audit" className="space-y-4 pt-4">
            <Card className="border border-border/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Immutable Transition Audit Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 text-xs border-l-2 border-primary pl-3 py-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">Current Stage: {referral.pipelineStage}</span>
                      <p className="text-[11px] text-muted-foreground">Last modified: {new Date(referral.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs border-l-2 border-border pl-3 py-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">Created in INTAKE</span>
                      <p className="text-[11px] text-muted-foreground">{new Date(referral.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

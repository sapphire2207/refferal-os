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
  Download,
  Trash2,
} from 'lucide-react';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { WorkStatusBadge, PriorityBadge, PipelineStageBadge } from '@/components/ui/status-badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/state-views';
import { ConfirmDangerDialog } from '@/components/ui/confirm-danger-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PipelineStage, WorkStatus, Priority, ClinicalReviewDecision, NoteReviewDecision, DocumentType } from '@heals/types';
import { useAuth } from '@/providers/auth-context';
import { canTransitionStage, canReviewNotes } from '@/lib/permissions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ReferralDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>(DocumentType.REFERRAL_FORM);
  const [reviewDecision, setReviewDecision] = useState<ClinicalReviewDecision>(ClinicalReviewDecision.ACCEPT);
  const [reviewNotes, setReviewNotes] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<any | null>(null);

  const canManageDocs = user?.roles?.some(
    (r) => r === 'ADMIN' || r === 'CLINICAL_COORDINATOR' || r === 'INTAKE_SPECIALIST',
  );

  const handleDownloadDoc = async (doc: any) => {
    try {
      toast.info('Starting document download…');
      await apiClient.downloadBlob(
        `/documents/${doc.id}/download`,
        doc.originalFilename || doc.originalName || 'document',
      );
      toast.success('Document downloaded');
    } catch (err: any) {
      toast.error('Download failed', { description: err.message });
    }
  };

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

  // Document Deletion Mutation
  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => apiClient.delete(`/documents/${docId}`),
    onSuccess: () => {
      toast.success('Document deleted');
      setDocumentToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['referral', id] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
    onError: (err: any) => {
      toast.error('Deletion failed', { description: err.message });
    },
  });

  if (isLoading) {
    return (
      <AppLayout title="Referral Details">
        <div className="space-y-6 max-w-6xl mx-auto py-8">
          <LoadingState message="Loading clinical referral details and gate history…" />
        </div>
      </AppLayout>
    );
  }

  if (error || !referral) {
    return (
      <AppLayout title="Referral Not Found">
        <div className="space-y-6 max-w-6xl mx-auto py-8">
          <ErrorState
            title="Referral Not Found"
            message="The requested referral could not be located or falls outside your authorized territory."
            onRetry={() => router.push('/referrals')}
          />
        </div>
      </AppLayout>
    );
  }

  // 6-Gate Sequence for Visual Stepper
  const workflowGates = [
    { key: PipelineStage.INTAKE, label: 'Intake Triage', order: 1 },
    { key: PipelineStage.CLINICAL_REVIEW, label: 'Clinical Review', order: 2 },
    { key: PipelineStage.SCHEDULING, label: 'NP Scheduling', order: 3 },
    { key: PipelineStage.NP_VISIT, label: 'Mobile Visit', order: 4 },
    { key: PipelineStage.NOTES_QA, label: 'Notes QA', order: 5 },
    { key: PipelineStage.BILLING, label: 'Billing Ready', order: 6 },
  ];

  const currentGateIndex = workflowGates.findIndex((g) => g.key === referral.pipelineStage);

  return (
    <AppLayout title={`Referral: ${referral.trackingNumber}`}>
      <div className="space-y-6 max-w-6xl mx-auto pb-10">
        {/* Top Standardized Page Header */}
        <PageHeader backHref="/referrals" backLabel="Referrals">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <PageHeaderHeading>
                {referral.patient?.firstName} {referral.patient?.lastName}
              </PageHeaderHeading>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(referral.trackingNumber);
                  toast.success(`Copied Tracking # ${referral.trackingNumber}`);
                }}
                className=" text-xs border border-border/80 bg-muted/50 px-2 py-0.5 rounded-md font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Click to copy tracking number"
              >
                {referral.trackingNumber}
              </button>
              <PriorityBadge priority={referral.priority} />
            </div>
            <PageHeaderDescription className="tabular-nums">
              DOB: {referral.patient?.dateOfBirth || 'N/A'} • MRN: {referral.patient?.mrn || 'N/A'} • Site: {referral.site} ({referral.state}) • Ledger Version: v{referral.version}
            </PageHeaderDescription>
          </div>

          <PageHeaderActions>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                  Stage
                </span>
                <PipelineStageBadge stage={referral.pipelineStage} />
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                  Status
                </span>
                <WorkStatusBadge status={referral.workStatus} />
              </div>
            </div>
          </PageHeaderActions>
        </PageHeader>

        {/* 6-Gate Visual Workflow Progress Stepper (Dribbble SaaS Benchmark) */}
        <Card className="border border-border/80 bg-card p-4 rounded-lg shadow-xs overflow-hidden">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 flex items-center justify-between">
            <span>Authoritative Workflow Lifecycle</span>
            <span className="text-[11px]  text-primary font-medium">Gate {currentGateIndex + 1} of 6</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {workflowGates.map((gate, idx) => {
              const isPast = idx < currentGateIndex;
              const isCurrent = idx === currentGateIndex;
              const isFuture = idx > currentGateIndex;

              return (
                <div
                  key={gate.key}
                  className={cn(
                    'flex flex-col p-2.5 rounded-lg border text-xs transition-all',
                    isCurrent
                      ? 'border-primary/50 bg-primary/10 shadow-xs'
                      : isPast
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-muted-foreground'
                      : 'border-border/60 bg-muted/20 text-muted-foreground/60'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px]  font-bold text-muted-foreground tabular-nums">0{gate.order}</span>
                    {isPast && <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                    {isCurrent && <span className="h-2 w-2 rounded-full bg-primary animate-pulse-subtle" />}
                  </div>
                  <span className={cn('font-semibold truncate', isCurrent ? 'text-primary' : isPast ? 'text-foreground' : 'text-muted-foreground')}>
                    {gate.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

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
                  className="h-7 text-[11px] text-amber-600 dark:text-amber-400"
                >
                  Blocked / Needs Info
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatusMutation.mutate({ workStatus: WorkStatus.COMPLETED })}
                  className="h-7 text-[11px] text-emerald-600 dark:text-emerald-400"
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
                    disabled={transitionMutation.isPending || !canTransitionStage(PipelineStage.INTAKE, PipelineStage.CLINICAL_REVIEW, user?.roles)}
                    title={canTransitionStage(PipelineStage.INTAKE, PipelineStage.CLINICAL_REVIEW, user?.roles) ? 'Advance referral' : 'Your role cannot transition referrals out of Intake'}
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-xs disabled:opacity-40"
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
                    disabled={transitionMutation.isPending || !canTransitionStage(PipelineStage.CLINICAL_REVIEW, PipelineStage.SCHEDULING, user?.roles)}
                    title={canTransitionStage(PipelineStage.CLINICAL_REVIEW, PipelineStage.SCHEDULING, user?.roles) ? 'Accept and move to scheduling' : 'Requires Clinical Reviewer credentials'}
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-xs disabled:opacity-40"
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
                    disabled={transitionMutation.isPending || !canTransitionStage(PipelineStage.SCHEDULING, PipelineStage.NP_VISIT, user?.roles)}
                    title={canTransitionStage(PipelineStage.SCHEDULING, PipelineStage.NP_VISIT, user?.roles) ? 'Confirm dispatch' : 'Requires Scheduler credentials'}
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-xs disabled:opacity-40"
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
                    disabled={transitionMutation.isPending || !canTransitionStage(PipelineStage.NP_VISIT, PipelineStage.NOTES_QA, user?.roles)}
                    title={canTransitionStage(PipelineStage.NP_VISIT, PipelineStage.NOTES_QA, user?.roles) ? 'Submit to QA' : 'Requires Nurse Practitioner credentials'}
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-xs disabled:opacity-40"
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
                    disabled={transitionMutation.isPending || !canReviewNotes(user?.roles)}
                    title={canReviewNotes(user?.roles) ? 'Approve notes and advance' : 'Requires licensed Clinical Reviewer credentials'}
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-xs disabled:opacity-40"
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
                  <Select
                    value={reviewDecision}
                    onValueChange={(val) => val && setReviewDecision(val as ClinicalReviewDecision)}
                  >
                    <SelectTrigger className="h-8 w-full sm:w-[260px] text-xs bg-background">
                      <SelectValue placeholder="Select determination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ClinicalReviewDecision.ACCEPT}>ACCEPT (Criteria Satisfied)</SelectItem>
                      <SelectItem value={ClinicalReviewDecision.RETURN}>RETURN (Missing Clinical Order)</SelectItem>
                      <SelectItem value={ClinicalReviewDecision.REJECT}>REJECT (Ineligible / Out of Service)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Enter clinical rationale or notes…"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (reviewDecision === ClinicalReviewDecision.REJECT) {
                        setShowRejectConfirm(true);
                        return;
                      }
                      reviewMutation.mutate();
                    }}
                    disabled={reviewMutation.isPending || !user?.roles?.some((r) => r === 'CLINICAL_REVIEWER' || r === 'CLINICAL_COORDINATOR' || r === 'ADMIN')}
                    title={user?.roles?.some((r) => r === 'CLINICAL_REVIEWER' || r === 'CLINICAL_COORDINATOR' || r === 'ADMIN') ? 'Submit clinical determination' : 'Requires Clinical Reviewer credentials'}
                    className="h-8 text-xs px-3 disabled:opacity-40"
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
                    <span className="">{referral.patient?.mrn || 'N/A'}</span>
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
                  <Select
                    value={docType}
                    onValueChange={(val) => val && setDocType(val as DocumentType)}
                  >
                    <SelectTrigger className="h-8 w-full sm:w-[200px] text-xs bg-background">
                      <SelectValue placeholder="Document Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DocumentType.REFERRAL_FORM}>Referral Form</SelectItem>
                      <SelectItem value={DocumentType.CLINICAL_ORDER}>Clinical Order</SelectItem>
                      <SelectItem value={DocumentType.INSURANCE_CARD}>Insurance Card</SelectItem>
                      <SelectItem value={DocumentType.MEDICAL_RECORD}>Medical Record</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => uploadDocMutation.mutate()}
                    disabled={!uploadFile || uploadDocMutation.isPending}
                    className="h-8 text-xs px-3 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shrink-0 shadow-xs"
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
                            <span className="font-semibold text-foreground">{doc.originalName || doc.originalFilename || 'Document'}</span>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span>Type: {doc.documentType}</span>
                              <span>•</span>
                              <span>Uploaded: {new Date(doc.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {doc.verified ? 'Verified' : 'Pending Verification'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadDoc(doc)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="Download document"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {canManageDocs && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDocumentToDelete(doc)}
                              className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title="Delete document"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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

        {/* Clinical Rejection Danger Dialog */}
        <ConfirmDangerDialog
          open={showRejectConfirm}
          onOpenChange={setShowRejectConfirm}
          title="Reject Clinical Referral"
          description={`Rejecting referral #${referral.referralNumber || referral.id.slice(0, 8)} permanently closes the case with status REJECTED. This decision is immutably recorded in the compliance audit log and cannot be undone.`}
          confirmText="Reject Referral"
          cancelText="Cancel"
          variant="danger"
          isLoading={reviewMutation.isPending}
          onConfirm={() => {
            setShowRejectConfirm(false);
            reviewMutation.mutate();
          }}
        />

        {/* Document Deletion Confirmation Dialog */}
        <ConfirmDangerDialog
          open={!!documentToDelete}
          onOpenChange={(open) => !open && setDocumentToDelete(null)}
          title="Delete Clinical Document"
          description={`Are you sure you want to permanently delete "${documentToDelete?.originalFilename || documentToDelete?.originalName || 'this file'}"? This action cannot be undone and will be logged in the immutable compliance audit log.`}
          confirmText="Delete Document"
          cancelText="Cancel"
          variant="danger"
          isLoading={deleteDocMutation.isPending}
          onConfirm={() => {
            if (documentToDelete) {
              deleteDocMutation.mutate(documentToDelete.id);
            }
          }}
        />
      </div>
    </AppLayout>
  );
}

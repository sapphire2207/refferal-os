'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  MessageSquare,
  ShieldAlert,
  Send,
  Building2,
  Stethoscope,
  ShieldCheck,
  Calendar,
  UserCheck,
  Download,
  ExternalLink,
  ArrowRight,
  RotateCcw,
  Tag,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority, UserRole } from '@heals/types';
import { WorkStatusBadge, PriorityBadge } from '@/components/ui/status-badge';
import { ConfirmDangerDialog } from '@/components/ui/confirm-danger-dialog';
import { useAuth } from '@/providers/auth-context';
import { canTransitionStage } from '@/lib/permissions';
import { toast } from 'sonner';

const PIPELINE_ORDER = [
  PipelineStage.INTAKE,
  PipelineStage.CLINICAL_REVIEW,
  PipelineStage.SCHEDULING,
  PipelineStage.NP_VISIT,
  PipelineStage.NOTES_QA,
  PipelineStage.BILLING,
];

function getNextStage(stage: PipelineStage): PipelineStage | null {
  const idx = PIPELINE_ORDER.indexOf(stage);
  return idx >= 0 && idx < PIPELINE_ORDER.length - 1 ? PIPELINE_ORDER[idx + 1] : null;
}

function getPrevStage(stage: PipelineStage): PipelineStage | null {
  const idx = PIPELINE_ORDER.indexOf(stage);
  return idx > 0 ? PIPELINE_ORDER[idx - 1] : null;
}

interface ReferralDrawerProps {
  referral: any | null;
  isOpen: boolean;
  onClose: () => void;
  onAdvance?: (ref: any) => void;
  onReturn?: (ref: any) => void;
  isAdvancing?: boolean;
}

export function ReferralDrawer({
  referral,
  isOpen,
  onClose,
  onAdvance,
  onReturn,
  isAdvancing,
}: ReferralDrawerProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'comments' | 'documents' | 'workflow'>('overview');
  const [commentText, setCommentText] = useState('');
  const [documentToDelete, setDocumentToDelete] = useState<any | null>(null);

  // 1. Fetch live comments for referral
  const { data: commentsRes, isLoading: isCommentsLoading, refetch: refetchComments } = useQuery<any>({
    queryKey: ['referral-comments', referral?.id],
    queryFn: () => apiClient.get<any>(`/referrals/${referral.id}/comments`),
    enabled: !!referral?.id && isOpen,
  });

  // 2. Fetch live documents for referral
  const { data: docsRes, isLoading: isDocsLoading, refetch: refetchDocs } = useQuery<any>({
    queryKey: ['referral-docs', referral?.id],
    queryFn: () => apiClient.get<any>(`/documents?referralId=${referral.id}`),
    enabled: !!referral?.id && isOpen,
  });

  // 3. Post comment mutation
  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiClient.post(`/referrals/${referral.id}/comments`, { content });
    },
    onSuccess: () => {
      toast.success('Internal comment posted');
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['referral-comments', referral?.id] });
    },
    onError: (err: any) => {
      toast.error('Failed to post comment', { description: err.message });
    },
  });

  // 4. Delete document mutation
  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => apiClient.delete(`/documents/${docId}`),
    onSuccess: () => {
      toast.success('Document deleted');
      setDocumentToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['referral-docs', referral?.id] });
    },
    onError: (err: any) => {
      toast.error('Failed to delete document', { description: err.message });
    },
  });

  if (!referral) return null;

  const { user } = useAuth();
  const nextStage = referral.pipelineStage ? getNextStage(referral.pipelineStage) : null;
  const prevStage = referral.pipelineStage ? getPrevStage(referral.pipelineStage) : null;

  const canAdvanceStage = nextStage ? canTransitionStage(referral.pipelineStage, nextStage, user?.roles) : false;
  const canReturnStage = prevStage ? canTransitionStage(referral.pipelineStage, prevStage, user?.roles) : false;

  const comments = Array.isArray(commentsRes) ? commentsRes : commentsRes?.data || [];
  const documents = Array.isArray(docsRes) ? docsRes : docsRes?.data || [];
  const initials = `${referral.patient?.firstName?.[0] || ''}${referral.patient?.lastName?.[0] || ''}`.toUpperCase() || 'PT';
  const mrn = referral.patient?.medicalRecordNumber || 'MRN-Pending';

  // Checklist items based on current pipeline stage
  const getStageGates = (stage: PipelineStage) => {
    switch (stage) {
      case PipelineStage.INTAKE:
        return [
          { label: 'Patient Demographics & Residence Verified', met: !!referral.patient?.firstName && !!referral.state },
          { label: 'Primary Insurance Payer & Member ID Present', met: !!referral.insurancePayer && !!referral.insuranceMemberId },
          { label: 'Coverage Eligibility Verification Completed', met: !!referral.coverageVerified },
          { label: 'Clinical Referral Document Uploaded', met: documents.length > 0 },
        ];
      case PipelineStage.CLINICAL_REVIEW:
        return [
          { label: 'Homebound Status & Medical Necessity Validated', met: true },
          { label: 'Clinical Eligibility Criteria Assessed', met: true },
          { label: 'Physician Order & Diagnosis Verified', met: true },
        ];
      case PipelineStage.SCHEDULING:
        return [
          { label: 'Nurse Practitioner Territory Assigned', met: !!referral.assignedTo || referral.assignedRole === UserRole.NURSE_PRACTITIONER },
          { label: 'Patient Appointment Slot Confirmed', met: referral.workStatus === WorkStatus.IN_PROGRESS },
          { label: 'Visit Location Route Planned', met: true },
        ];
      case PipelineStage.NP_VISIT:
        return [
          { label: 'Mobile Clinical Encounter Conducted', met: true },
          { label: 'Vitals & Assessment Documentation Completed', met: true },
          { label: 'Clinical Progress Note Digitally Signed by NP', met: referral.workStatus === WorkStatus.IN_PROGRESS },
        ];
      case PipelineStage.NOTES_QA:
        return [
          { label: 'Clinical Documentation Quality Standards Met', met: true },
          { label: 'Compliant ICD-10 & CPT Coding Verified', met: true },
          { label: 'Clinical Reviewer Sign-off & Billing Approval', met: referral.workStatus === WorkStatus.IN_PROGRESS },
        ];
      case PipelineStage.BILLING:
        return [
          { label: 'Insurance Claim Generated with Approved Codes', met: true },
          { label: 'Payer Submission EDI / CMS-1500 Ready', met: true },
        ];
      default:
        return [];
    }
  };

  const gates = getStageGates(referral.pipelineStage);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-xl border border-border shadow-2xl bg-card">
        {/* Header Banner */}
        <div className="p-6 border-b border-border/80 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-xs px-2.5 py-0.5 rounded-md bg-muted text-foreground border border-border">
                {referral.trackingNumber || `REF-${referral.id.slice(0, 8).toUpperCase()}`}
              </span>
              <Badge variant="outline" className="text-xs uppercase font-semibold">
                {referral.pipelineStage?.replace('_', ' ')}
              </Badge>
              <WorkStatusBadge status={referral.workStatus} />
              <PriorityBadge priority={referral.priority} />
            </div>

            <div className="flex items-center gap-2">
              {onReturn && prevStage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReturn(referral)}
                  disabled={!canReturnStage}
                  title={canReturnStage ? `Return referral to ${prevStage.replace('_', ' ')}` : 'Your role does not have permission to return referrals from this stage'}
                  className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-rose-600 hover:border-rose-300 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Return</span>
                </Button>
              )}
              {onAdvance && nextStage && (
                <Button
                  size="sm"
                  onClick={() => onAdvance(referral)}
                  disabled={isAdvancing || !canAdvanceStage}
                  title={canAdvanceStage ? `Advance referral to ${nextStage.replace('_', ' ')}` : 'Your role does not have permission to advance referrals out of this stage'}
                  className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold shadow-xs disabled:opacity-40"
                >
                  <span>Advance Stage</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 rounded-lg border border-border bg-muted">
              <AvatarFallback className="rounded-lg font-bold text-sm text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {referral.patient?.firstName} {referral.patient?.lastName}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>{mrn}</span>
                <span>•</span>
                <span className="font-semibold uppercase text-foreground">{referral.site || 'Site-A'}</span>
                <span>•</span>
                <span>Territory: {referral.state || 'FL'}</span>
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="p-6 space-y-4">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
            <TabsList className="grid grid-cols-4 w-full bg-muted/60 p-1 rounded-lg border border-border/40">
              <TabsTrigger value="overview" className="text-xs rounded-md py-1.5 font-medium">
                Overview & Gates
              </TabsTrigger>
              <TabsTrigger value="comments" className="text-xs rounded-md py-1.5 font-medium flex items-center gap-1.5">
                <span>Comments</span>
                {comments.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">
                    {comments.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-xs rounded-md py-1.5 font-medium flex items-center gap-1.5">
                <span>Documents</span>
                {documents.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">
                    {documents.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="workflow" className="text-xs rounded-md py-1.5 font-medium">
                Audit Trail
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Overview & Stage Gates */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Demographics & Clinical Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20 space-y-2">
                  <span className="font-semibold text-foreground/80 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Referral Demographics
                  </span>
                  <div className="space-y-1 text-muted-foreground">
                    <p><strong className="text-foreground">Source:</strong> {referral.referralSource || 'Clinic Intake'}</p>
                    <p><strong className="text-foreground">Facility:</strong> {referral.referringFacility || 'Plainsboro Medical Center'}</p>
                    <p><strong className="text-foreground">Provider:</strong> {referral.referringProvider || 'Dr. Gregory House'}</p>
                    <p><strong className="text-foreground">NPI:</strong> {referral.referringProviderNpi || '1029384756'}</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20 space-y-2">
                  <span className="font-semibold text-foreground/80 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Payer & Insurance Coverage
                  </span>
                  <div className="space-y-1 text-muted-foreground">
                    <p><strong className="text-foreground">Payer:</strong> {referral.insurancePayer || 'Blue Cross Blue Shield'}</p>
                    <p><strong className="text-foreground">Member ID:</strong> <span className="font-medium tabular-nums text-foreground">{referral.insuranceMemberId || 'MEM-8829104'}</span></p>
                    <p><strong className="text-foreground">Coverage Verified:</strong> {referral.coverageVerified ? 'Yes (Active)' : 'Pending Verification'}</p>
                    <p><strong className="text-foreground">Assigned Role:</strong> <span className="font-semibold uppercase text-foreground">{referral.assignedRole || 'INTAKE_SPECIALIST'}</span></p>
                  </div>
                </div>
              </div>

              {/* Stage Gates Checklist */}
              <div className="p-4 rounded-lg border border-border/80 bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground tracking-tight flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Stage Gate Requirements ({referral.pipelineStage?.replace('_', ' ')})
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    All criteria must pass before automated progression
                  </span>
                </div>

                <div className="space-y-2">
                  {gates.map((gate, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                        gate.met
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-foreground'
                          : 'border-amber-500/30 bg-amber-500/5 text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {gate.met ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                        )}
                        <span>{gate.label}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          gate.met
                            ? 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10'
                            : 'border-amber-500/40 text-amber-700 bg-amber-500/10'
                        }`}
                      >
                        {gate.met ? 'Met' : 'Required'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: Internal Comments */}
            <TabsContent value="comments" className="space-y-4 mt-4">
              <div className="space-y-3 min-h-[220px] max-h-[300px] overflow-y-auto p-2 border border-border/70 rounded-lg bg-muted/10">
                {isCommentsLoading ? (
                  <p className="text-center py-10 text-xs text-muted-foreground">Loading comments...</p>
                ) : comments.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground space-y-1">
                    <MessageSquare className="h-6 w-6 opacity-30 mx-auto" />
                    <p>No internal comments recorded on this referral yet.</p>
                  </div>
                ) : (
                  comments.map((comment: any) => (
                    <div key={comment.id} className="p-3 rounded-lg border border-border/80 bg-card space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5 rounded-md">
                            <AvatarFallback className="text-[9px] font-bold">
                              {comment.author?.name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-xs text-foreground">
                            {comment.author?.name || 'Staff Member'}
                          </span>
                          {comment.author?.roles?.[0] && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-medium">
                              {comment.author.roles[0].replace('_', ' ')}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap pl-7">
                        {comment.content}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Input */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Add an internal collaboration note or clinical comment..."
                  value={commentText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCommentText(e.target.value)}
                  className="min-h-[80px] text-xs resize-none"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">
                    Comments are logged in the immutable HIPAA audit trail.
                  </span>
                  <Button
                    size="sm"
                    onClick={() => commentMutation.mutate(commentText)}
                    disabled={!commentText.trim() || commentMutation.isPending}
                    className="h-8 gap-1.5 text-xs font-semibold"
                  >
                    <Send className="h-3 w-3" />
                    <span>Post Comment</span>
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Tab 3: Attached Documents */}
            <TabsContent value="documents" className="space-y-3 mt-4">
              <div className="space-y-2 min-h-[220px] max-h-[350px] overflow-y-auto">
                {isDocsLoading ? (
                  <p className="text-center py-10 text-xs text-muted-foreground">Loading documents...</p>
                ) : documents.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground space-y-1">
                    <FileText className="h-6 w-6 opacity-30 mx-auto" />
                    <p>No documents uploaded for this referral.</p>
                  </div>
                ) : (
                  documents.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-card hover:border-foreground/20 transition-all text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{doc.originalFilename}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="font-semibold uppercase">{doc.type?.replace('_', ' ')}</span>
                            <span>•</span>
                            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                            <span>•</span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] h-3.5 px-1 ${
                                doc.verifiedAt ? 'border-emerald-500/40 text-emerald-600' : 'border-neutral-300'
                              }`}
                            >
                              {doc.verifiedAt ? 'Verified' : 'Pending Review'}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              toast.info('Downloading document…');
                              await apiClient.downloadBlob(`/documents/${doc.id}/download`, doc.originalFilename);
                              toast.success('Document downloaded');
                            } catch (err: any) {
                              toast.error('Download failed', { description: err.message });
                            }
                          }}
                          className="h-7 px-2 text-xs text-primary hover:bg-primary/10 gap-1 font-medium"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </Button>
                        {(user?.roles?.includes(UserRole.ADMIN) || user?.roles?.includes(UserRole.CLINICAL_COORDINATOR)) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDocumentToDelete(doc)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                            title="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Tab 4: Workflow Audit */}
            <TabsContent value="workflow" className="space-y-3 mt-4 text-xs">
              <div className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-3">
                <h4 className="font-bold text-foreground">Optimistic Concurrency & Stage Metadata</h4>
                <div className="grid grid-cols-2 gap-3 text-muted-foreground">
                  <p><strong className="text-foreground">Record Version:</strong> v{referral.version}</p>
                  <p><strong className="text-foreground">Current Stage:</strong> {referral.pipelineStage}</p>
                  <p><strong className="text-foreground">Created:</strong> {new Date(referral.createdAt).toLocaleString()}</p>
                  <p><strong className="text-foreground">Last Modified:</strong> {new Date(referral.updatedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="text-right">
                <Link href={`/referrals/${referral.id}`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <span>Open Full Referral Workspace</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Document Deletion Confirmation Dialog */}
        <ConfirmDangerDialog
          open={!!documentToDelete}
          onOpenChange={(open) => !open && setDocumentToDelete(null)}
          title="Delete Clinical Document"
          description={`Are you sure you want to permanently delete "${documentToDelete?.originalFilename}"? This action cannot be undone and will be logged in the immutable compliance audit log.`}
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
      </DialogContent>
    </Dialog>
  );
}

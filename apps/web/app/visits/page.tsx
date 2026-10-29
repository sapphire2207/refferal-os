'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-context';
import { canSignVisits } from '@/lib/permissions';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/state-views';
import { Stethoscope, CheckCircle, Loader2, ShieldCheck, PenTool, RefreshCw, Lock } from 'lucide-react';
import { PipelineStage } from '@heals/types';
import { toast } from 'sonner';

export default function VisitsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canSign = canSignVisits(user?.roles);
  const [selectedReferral, setSelectedReferral] = useState<any | null>(null);

  // SOAP Note state
  const [dateOfService, setDateOfService] = useState(new Date().toISOString().split('T')[0]);
  const [servicesProvided, setServicesProvided] = useState('Comprehensive Mobile Clinical Assessment, Medication Reconciliation');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [signature, setSignature] = useState('Nurse Practitioner, MSN, APRN, FNP-C');

  // Fetch referrals in NP_VISIT stage
  const { data: visitsData, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ['referrals', { pipelineStage: PipelineStage.NP_VISIT }],
    queryFn: () => apiClient.get<any>(`/referrals?pipelineStage=${PipelineStage.NP_VISIT}&limit=50`),
  });

  const visitQueue = extractApiList<any>(visitsData);

  // Create Encounter & Submit Note Mutation
  const submitEncounterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReferral) throw new Error('Please select a visit');

      // 1. Create Encounter record
      const encounter = await apiClient.post<any>('/encounters', {
        referralId: selectedReferral.id,
        patientId: selectedReferral.patientId,
        dateOfService,
        servicesProvided,
        outcome: 'COMPLETED',
      });

      // 2. Create Clinical Note (SOAP)
      await apiClient.post<any>(`/encounters/${encounter.id}/notes`, {
        subjective,
        objective,
        assessment,
        plan,
      });

      // 3. Digitally sign the note with credentials
      await apiClient.patch(`/encounters/${encounter.id}/notes/sign`, {
        signatureCredentials: signature,
      });

      return encounter;
    },
    onSuccess: () => {
      toast.success('Clinical Encounter & Signed SOAP Note Submitted for Notes QA!');
      setSelectedReferral(null);
      setSubjective('');
      setObjective('');
      setAssessment('');
      setPlan('');
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
    onError: (err: any) => {
      toast.error('Submission Failed', { description: err.message });
    },
  });

  return (
    <AppLayout title="Mobile NP Visits & Encounters">
      <div className="space-y-6">
        <PageHeader>
          <div>
            <PageHeaderHeading>Nurse Practitioner Clinical Encounters</PageHeaderHeading>
            <PageHeaderDescription>
              Document in-home patient evaluations, SOAP notes, and cryptographic provider sign-offs
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
          {/* Active NP Visit Queue */}
          <Card className="border border-border/80 bg-card shadow-2xs lg:col-span-1">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Pending Visits ({visitQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-semibold border-primary/20 bg-primary/10 text-primary">
                  NP_VISIT
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingState message="Loading mobile clinical visit queue…" />
              ) : visitQueue.length === 0 ? (
                <EmptyState
                  icon={Stethoscope}
                  title="No visits pending"
                  description="All scheduled patient visits in your scope are up to date."
                  className="min-h-[220px] border-none bg-transparent"
                />
              ) : (
                <div className="divide-y divide-border/60 max-h-[600px] overflow-y-auto">
                  {visitQueue.map((ref: any) => {
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
                          <span>DOB: {ref.patient?.dateOfBirth || 'N/A'}</span>
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
                          {isSelected ? 'Currently Documenting' : 'Document Visit'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SOAP Clinical Note Documentation Workspace */}
          <Card className="border border-border/80 bg-card shadow-xs lg:col-span-2">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PenTool className="h-4 w-4 text-primary" />
                SOAP Clinical Encounter Note
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedReferral
                  ? `Documenting visit for: ${selectedReferral.patient?.firstName} ${selectedReferral.patient?.lastName} (${selectedReferral.trackingNumber})`
                  : 'Select a patient visit from the left queue to begin documenting.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {!selectedReferral ? (
                <EmptyState
                  icon={Stethoscope}
                  title="No encounter selected"
                  description="Choose a patient referral from the left queue to author and sign the clinical encounter note."
                  className="min-h-[300px] border-none bg-transparent"
                />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="dos" className="text-xs font-medium text-foreground">Date of Service *</Label>
                      <Input
                        id="dos"
                        type="date"
                        value={dateOfService}
                        onChange={(e) => setDateOfService(e.target.value)}
                        className="h-8 text-xs bg-background border-border"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="services" className="text-xs font-medium text-foreground">Services Provided</Label>
                      <Input
                        id="services"
                        value={servicesProvided}
                        onChange={(e) => setServicesProvided(e.target.value)}
                        className="h-8 text-xs bg-background border-border"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="subj" className="text-xs font-semibold text-foreground">Subjective (S)</Label>
                    <textarea
                      id="subj"
                      rows={2}
                      value={subjective}
                      onChange={(e) => setSubjective(e.target.value)}
                      placeholder="Chief complaint, patient history, reported symptoms…"
                      className="w-full rounded-md border border-border/80 bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="obj" className="text-xs font-semibold text-foreground">Objective (O)</Label>
                    <textarea
                      id="obj"
                      rows={2}
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Vital signs, physical exam observations, mobility status…"
                      className="w-full rounded-md border border-border/80 bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="assess" className="text-xs font-semibold text-foreground">Assessment (A)</Label>
                    <textarea
                      id="assess"
                      rows={2}
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                      placeholder="Primary clinical diagnoses, clinical impression…"
                      className="w-full rounded-md border border-border/80 bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plan" className="text-xs font-semibold text-foreground">Plan (P)</Label>
                    <textarea
                      id="plan"
                      rows={2}
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      placeholder="Treatment orders, prescriptions, caregiver education, follow-up cadence…"
                      className="w-full rounded-md border border-border/80 bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>

                  {!canSign && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs">
                      <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <span className="font-semibold block">View-Only Clinical Evaluation</span>
                        <span className="text-[11px] opacity-90">
                          Documenting and digitally signing in-home clinical evaluations is restricted to licensed Nurse Practitioners.
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="p-3.5 bg-muted/30 rounded-lg border border-border/80 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      Digital Signature & Attestation
                    </div>
                    <Input
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      disabled={!canSign}
                      className="h-8 text-xs  bg-background border-border/80 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Signing locks note revision immutably and immediately routes case to Notes QA Review.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      size="sm"
                      onClick={() => submitEncounterMutation.mutate()}
                      disabled={!canSign || !subjective || !objective || !assessment || !plan || submitEncounterMutation.isPending}
                      title={
                        !canSign
                          ? 'Digital signing restricted to Nurse Practitioners'
                          : !subjective || !objective || !assessment || !plan
                          ? 'All SOAP fields (Subjective, Objective, Assessment, Plan) are required to complete sign-off'
                          : 'Sign and route encounter to Notes QA'
                      }
                      className="h-8 px-4 w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold gap-1.5 shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {submitEncounterMutation.isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Submitting & Signing…
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          Sign & Route to Notes QA
                        </>
                      )}
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

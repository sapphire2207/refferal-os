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
import { Stethoscope, FileText, CheckCircle, ArrowRight, Loader2, ShieldCheck, PenTool } from 'lucide-react';
import { PipelineStage } from '@heals/types';
import { toast } from 'sonner';

export default function VisitsPage() {
  const queryClient = useQueryClient();
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
  const { data: visitsData, isLoading } = useQuery<any>({
    queryKey: ['referrals', { stage: PipelineStage.NP_VISIT }],
    queryFn: () => apiClient.get<any>(`/referrals?stage=${PipelineStage.NP_VISIT}&limit=50`),
  });

  const visitQueue = visitsData?.items || [];

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
      const note = await apiClient.post<any>(`/encounters/${encounter.id}/notes`, {
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
        <div className="border-b border-border/60 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Nurse Practitioner Mobile Clinical Documentation
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conduct home visits, document SOAP notes, and execute immutable digital signatures
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active NP Visit Queue */}
          <Card className="border border-border/80 lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Pending Visits ({visitQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  NP_VISIT
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                  Loading visit queue...
                </div>
              ) : visitQueue.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No mobile visits pending in your scope.
                </div>
              ) : (
                <div className="divide-y divide-border/60 max-h-[600px] overflow-y-auto">
                  {visitQueue.map((ref: any) => {
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
                          <span>DOB: {ref.patient?.dateOfBirth}</span>
                          <span> • </span>
                          <span>Site: {ref.site}</span>
                        </div>
                        <Button
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-[10px] w-full mt-2"
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
          <Card className="border border-border/80 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PenTool className="h-4 w-4" />
                SOAP Clinical Encounter Note
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedReferral
                  ? `Documenting visit for: ${selectedReferral.patient?.firstName} ${selectedReferral.patient?.lastName} (${selectedReferral.trackingNumber})`
                  : 'Select a patient visit from the left queue to begin documenting.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedReferral ? (
                <div className="py-16 text-center text-xs text-muted-foreground">
                  <Stethoscope className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                  Select an active referral from the pending visits queue to record clinical findings.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="dos" className="text-xs">Date of Service *</Label>
                      <Input
                        id="dos"
                        type="date"
                        value={dateOfService}
                        onChange={(e) => setDateOfService(e.target.value)}
                        className="h-8 text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="services" className="text-xs">Services Provided</Label>
                      <Input
                        id="services"
                        value={servicesProvided}
                        onChange={(e) => setServicesProvided(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="subj" className="text-xs font-semibold">Subjective (S)</Label>
                    <textarea
                      id="subj"
                      rows={2}
                      value={subjective}
                      onChange={(e) => setSubjective(e.target.value)}
                      placeholder="Chief complaint, patient history, reported symptoms..."
                      className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="obj" className="text-xs font-semibold">Objective (O)</Label>
                    <textarea
                      id="obj"
                      rows={2}
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Vital signs, physical exam observations, mobility status..."
                      className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="assess" className="text-xs font-semibold">Assessment (A)</Label>
                    <textarea
                      id="assess"
                      rows={2}
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                      placeholder="Primary clinical diagnoses, clinical impression..."
                      className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plan" className="text-xs font-semibold">Plan (P)</Label>
                    <textarea
                      id="plan"
                      rows={2}
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      placeholder="Treatment orders, prescriptions, caregiver education, follow-up cadence..."
                      className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none"
                    />
                  </div>

                  <div className="p-3 bg-muted/30 rounded-md border border-border/60 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Digital Signature & Attestation
                    </div>
                    <Input
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Signing locks note revision immutably and immediately routes case to Notes QA Review.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      size="sm"
                      onClick={() => submitEncounterMutation.mutate()}
                      disabled={!subjective || !objective || !assessment || !plan || submitEncounterMutation.isPending}
                      className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold gap-1.5 shadow-xs"
                    >
                      {submitEncounterMutation.isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Submitting & Signing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" />
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

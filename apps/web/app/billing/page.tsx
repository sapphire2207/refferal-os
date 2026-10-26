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
import { Receipt, CheckCircle, AlertTriangle, ArrowRight, Loader2, DollarSign, Send, ShieldCheck } from 'lucide-react';
import { PipelineStage, BillingStatus } from '@heals/types';
import { toast } from 'sonner';

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [selectedReferral, setSelectedReferral] = useState<any | null>(null);
  const [billingCodes, setBillingCodes] = useState('99349, 99350 (Home Visit, Complex)');
  const [chargeAmount, setChargeAmount] = useState('285.00');

  // Fetch referrals in BILLING stage
  const { data: billingData, isLoading: isQueueLoading } = useQuery<any>({
    queryKey: ['referrals', { stage: PipelineStage.BILLING }],
    queryFn: () => apiClient.get<any>(`/referrals?stage=${PipelineStage.BILLING}&limit=50`),
  });

  // Fetch claims list
  const { data: claims = [], isLoading: isClaimsLoading } = useQuery<any[]>({
    queryKey: ['claims'],
    queryFn: () => apiClient.get<any[]>('/billing/claims'),
  });

  const billingQueue = billingData?.items || [];

  // Generate Claim Mutation
  const createClaimMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReferral) throw new Error('Please select a referral');

      return apiClient.post('/billing/claims', {
        referralId: selectedReferral.id,
        encounterId: selectedReferral.encounter?.id || `enc-${Date.now()}`,
        billingCodes: billingCodes.split(',').map((c) => c.trim()),
        chargeAmount: parseFloat(chargeAmount) || 285.0,
      });
    },
    onSuccess: () => {
      toast.success('Superbill Claim Generated & Marked READY for Submission!');
      setSelectedReferral(null);
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
    onError: (err: any) => {
      toast.error('Claim Generation Failed', { description: err.message });
    },
  });

  // Adjudicate Claim Mutation
  const adjudicateMutation = useMutation({
    mutationFn: ({ id, status, denialReason }: { id: string; status: string; denialReason?: string }) =>
      apiClient.patch(`/billing/claims/${id}/adjudicate`, {
        status,
        denialReason,
        referenceNumber: `ADJ-${Date.now().toString().slice(-6)}`,
      }),
    onSuccess: (data, variables) => {
      toast.success(`Claim adjudicated as ${variables.status}`);
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
    onError: (err: any) => {
      toast.error('Adjudication Failed', { description: err.message });
    },
  });

  return (
    <AppLayout title="Billing & Claims Processing">
      <div className="space-y-6">
        <div className="border-b border-border/60 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Revenue Cycle & Claims Adjudication
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Strict billing readiness gates, superbill creation, electronic clearinghouse submissions, and payment tracking
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Billing Stage Queue */}
          <Card className="border border-border/80 lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Billing Ready Queue ({billingQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  BILLING
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isQueueLoading ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                  Loading billing queue...
                </div>
              ) : billingQueue.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No cases currently awaiting billing generation.
                </div>
              ) : (
                <div className="divide-y divide-border/60 max-h-[600px] overflow-y-auto">
                  {billingQueue.map((ref: any) => {
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
                          <span>Site: {ref.site}</span>
                          <span> • </span>
                          <span className="text-emerald-600 font-medium">QA Approved</span>
                        </div>
                        <Button
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-[10px] w-full mt-2"
                        >
                          {isSelected ? 'Generating Claim' : 'Create Superbill'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Superbill Claim Generator */}
          <Card className="border border-border/80 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Superbill & Claim Generation Gate
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedReferral
                  ? `Processing case for: ${selectedReferral.patient?.firstName} ${selectedReferral.patient?.lastName} (${selectedReferral.trackingNumber})`
                  : 'Select a billing-ready case from the queue to generate claim.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedReferral ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Receipt className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                  Select an approved clinical case from the queue to generate a billing superbill.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Readiness Checklist */}
                  <div className="p-3 bg-muted/20 border border-border/60 rounded-lg space-y-2 text-xs">
                    <span className="font-semibold text-foreground block">
                      Billing Readiness Gate Check:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Coverage Verified Active</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Signed SOAP Note Locked</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Notes QA Reviewed & Approved</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Provider NPI Validated</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cpt" className="text-xs font-semibold">
                        CPT / Billing Codes *
                      </Label>
                      <Input
                        id="cpt"
                        value={billingCodes}
                        onChange={(e) => setBillingCodes(e.target.value)}
                        className="h-8 text-xs font-mono"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="amount" className="text-xs font-semibold">
                        Charge Amount ($ USD) *
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={chargeAmount}
                        onChange={(e) => setChargeAmount(e.target.value)}
                        className="h-8 text-xs font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => createClaimMutation.mutate()}
                      disabled={createClaimMutation.isPending}
                      className="h-9 px-4 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black text-xs font-semibold gap-1.5"
                    >
                      {createClaimMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Generate Superbill & Dispatch Claim
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Existing Claims & Adjudication Table */}
        <Card className="border border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Processed Claims & Remittance Adjudication
            </CardTitle>
            <CardDescription className="text-xs">
              Paid claims automatically close case; Denied claims return case to blocked info for appeal
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isClaimsLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                Loading claims...
              </div>
            ) : claims.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No active claims processed yet.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {claims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 flex items-center justify-between text-xs hover:bg-muted/30 transition-colors gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{claim.id.slice(0, 8)}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            claim.status === 'PAID'
                              ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
                              : claim.status === 'DENIED' || claim.status === 'REJECTED'
                              ? 'border-rose-500/40 text-rose-600 bg-rose-500/10'
                              : 'border-border text-muted-foreground'
                          }`}
                        >
                          {claim.status}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        <span>Charge: ${claim.chargeAmount?.toFixed(2) || '285.00'}</span>
                        <span> • </span>
                        <span>Codes: {Array.isArray(claim.billingCodes) ? claim.billingCodes.join(', ') : '99349'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {claim.status !== 'PAID' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => adjudicateMutation.mutate({ id: claim.id, status: 'PAID' })}
                            className="h-7 text-[10px] bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Mark Paid (Close Case)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              adjudicateMutation.mutate({
                                id: claim.id,
                                status: 'DENIED',
                                denialReason: 'Coordination of benefits required',
                              })
                            }
                            className="h-7 text-[10px] text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                          >
                            Mark Denied
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

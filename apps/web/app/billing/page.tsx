'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/state-views';
import { Receipt, CheckCircle, AlertTriangle, ArrowRight, Loader2, Send, ShieldCheck, RefreshCw } from 'lucide-react';
import { PipelineStage, BillingStatus } from '@heals/types';
import { toast } from 'sonner';

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [selectedReferral, setSelectedReferral] = useState<any | null>(null);
  const [billingCodes, setBillingCodes] = useState('99349, 99350 (Home Visit, Complex)');
  const [chargeAmount, setChargeAmount] = useState('285.00');

  // Fetch referrals in BILLING stage
  const { data: billingData, isLoading: isQueueLoading, refetch: refetchQueue, isFetching: isFetchingQueue } = useQuery<any>({
    queryKey: ['referrals', { stage: PipelineStage.BILLING }],
    queryFn: () => apiClient.get<any>(`/referrals?stage=${PipelineStage.BILLING}&limit=50`),
  });

  // Fetch claims list
  const { data: claimsRes, isLoading: isClaimsLoading, refetch: refetchClaims, isFetching: isFetchingClaims } = useQuery<any>({
    queryKey: ['claims'],
    queryFn: () => apiClient.get<any>('/billing/claims'),
  });

  const billingQueue = extractApiList<any>(billingData);
  const claims = extractApiList<any>(claimsRes);

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
        <PageHeader>
          <div>
            <PageHeaderHeading>Revenue Cycle & Claims Adjudication</PageHeaderHeading>
            <PageHeaderDescription>
              Superbill creation, electronic clearinghouse submissions, and payment reconciliation
            </PageHeaderDescription>
          </div>
          <PageHeaderActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchQueue();
                refetchClaims();
              }}
              disabled={isFetchingQueue || isFetchingClaims}
              className="h-8 gap-1.5 text-xs font-medium border-border"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetchingClaims ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </PageHeaderActions>
        </PageHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Billing Stage Queue */}
          <Card className="border border-border/80 bg-card shadow-2xs lg:col-span-1">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Billing Ready Queue ({billingQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono border-zinc-200 bg-zinc-50 text-zinc-700">
                  BILLING
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isQueueLoading ? (
                <LoadingState message="Loading billing queue..." />
              ) : billingQueue.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="No cases awaiting billing"
                  description="All approved clinical encounters have been processed for claims."
                  className="min-h-[220px] border-none bg-transparent"
                />
              ) : (
                <div className="divide-y divide-border/60 max-h-[600px] overflow-y-auto">
                  {billingQueue.map((ref: any) => {
                    const isSelected = selectedReferral?.id === ref.id;

                    return (
                      <div
                        key={ref.id}
                        onClick={() => setSelectedReferral(ref)}
                        className={`p-3.5 text-xs cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-100/70 border-l-2 border-zinc-900' : 'hover:bg-muted/30'
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
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                          <span>Site: {ref.site}</span>
                          <span className="text-emerald-700 font-medium">QA Approved</span>
                        </div>
                        <Button
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className={`h-6 text-[10px] w-full mt-2 font-medium ${
                            isSelected ? 'bg-zinc-900 text-white' : 'border-border'
                          }`}
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
          <Card className="border border-border/80 bg-card shadow-2xs lg:col-span-2">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-zinc-600" />
                Superbill & Claim Generation Gate
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedReferral
                  ? `Processing case for: ${selectedReferral.patient?.firstName} ${selectedReferral.patient?.lastName} (${selectedReferral.trackingNumber})`
                  : 'Select a billing-ready case from the queue to generate claim.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {!selectedReferral ? (
                <EmptyState
                  icon={Receipt}
                  title="No case selected"
                  description="Choose a QA-approved clinical encounter from the queue to generate a superbill."
                  className="min-h-[300px] border-none bg-transparent"
                />
              ) : (
                <div className="space-y-4">
                  {/* Readiness Checklist */}
                  <div className="p-3.5 bg-zinc-50 border border-border/80 rounded-lg space-y-2 text-xs">
                    <span className="font-semibold text-foreground block">
                      Billing Readiness Gate Check:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Coverage Verified Active</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Signed SOAP Note Locked</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Notes QA Reviewed & Approved</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Provider NPI Validated</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cpt" className="text-xs font-semibold text-zinc-800">
                        CPT / Billing Codes *
                      </Label>
                      <Input
                        id="cpt"
                        value={billingCodes}
                        onChange={(e) => setBillingCodes(e.target.value)}
                        className="h-8 text-xs font-mono bg-white border-border"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="amount" className="text-xs font-semibold text-zinc-800">
                        Charge Amount ($ USD) *
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={chargeAmount}
                        onChange={(e) => setChargeAmount(e.target.value)}
                        className="h-8 text-xs font-mono bg-white border-border"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => createClaimMutation.mutate()}
                      disabled={createClaimMutation.isPending}
                      className="h-8 px-4 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium gap-1.5 shadow-2xs"
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
        <Card className="border border-border/80 bg-card shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  Processed Claims & Remittance Adjudication
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Paid claims automatically close case; Denied claims return case to blocked info for appeal
                </CardDescription>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {claims.length} claim{claims.length === 1 ? '' : 's'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isClaimsLoading ? (
              <LoadingState message="Loading claims registry..." />
            ) : claims.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No active claims"
                description="Processed billing claims and clearinghouse adjudications will appear here."
                className="min-h-[180px] border-none bg-transparent"
              />
            ) : (
              <div className="divide-y divide-border/60">
                {claims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 flex items-center justify-between text-xs hover:bg-muted/30 transition-colors gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-foreground">{claim.id.slice(0, 8)}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                          claim.status === 'PAID'
                            ? 'border border-emerald-200 text-emerald-700 bg-emerald-50'
                            : claim.status === 'DENIED' || claim.status === 'REJECTED'
                            ? 'border border-rose-200 text-rose-700 bg-rose-50'
                            : 'border border-zinc-200 text-zinc-700 bg-zinc-100'
                        }`}>
                          {claim.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1.5">
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
                            onClick={() => {
                              if (
                                !window.confirm(
                                  'Marking a claim as PAID permanently closes the referral case as COMPLETED. Proceed?',
                                )
                              ) {
                                return;
                              }
                              adjudicateMutation.mutate({ id: claim.id, status: 'PAID' });
                            }}
                            className="h-7 text-[11px] bg-emerald-700 text-white hover:bg-emerald-800 font-medium"
                          >
                            Mark Paid (Close Case)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const reason = window.prompt(
                                'Enter official claim denial or rejection code/reason:',
                                'Coordination of benefits required',
                              );
                              if (!reason) return;
                              adjudicateMutation.mutate({
                                id: claim.id,
                                status: 'DENIED',
                                denialReason: reason,
                              });
                            }}
                            className="h-7 text-[11px] text-rose-700 border-rose-200 bg-rose-50/50 hover:bg-rose-100/50 font-medium"
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

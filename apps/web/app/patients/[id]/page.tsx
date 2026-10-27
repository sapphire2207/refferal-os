'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/state-views';
import { ArrowLeft, User, MapPin, FileText, ArrowRight, PlusCircle } from 'lucide-react';

export default function PatientDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const { data: patient, isLoading, error, refetch } = useQuery<any>({
    queryKey: ['patient', id],
    queryFn: () => apiClient.get<any>(`/patients/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout title="Patient Profile">
        <div className="space-y-6 max-w-5xl mx-auto py-4">
          <LoadingState message="Retrieving patient demographic profile…" />
        </div>
      </AppLayout>
    );
  }

  if (error || !patient) {
    return (
      <AppLayout title="Patient Not Found">
        <div className="space-y-6 max-w-5xl mx-auto py-4">
          <ErrorState
            title="Patient Profile Not Found"
            message="The requested patient record could not be found or you lack territorial authorization for this site."
            onRetry={() => router.push('/patients')}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Patient: ${patient.firstName} ${patient.lastName}`}>
      <div className="space-y-6 max-w-5xl mx-auto">
        <PageHeader backHref="/patients" backLabel="Patients Directory">
          <div>
            <div className="flex items-center gap-2">
              <PageHeaderHeading>
                {patient.firstName} {patient.lastName}
              </PageHeaderHeading>
              <Badge variant="outline" className="font-mono text-xs border-border bg-muted/40 font-semibold">
                MRN: {patient.mrn || 'N/A'}
              </Badge>
            </div>
            <PageHeaderDescription>
              Verified clinical record • Scoped to site {patient.site} ({patient.state})
            </PageHeaderDescription>
          </div>
          <PageHeaderActions>
            <Link href="/referrals/new">
              <Button size="sm" className="h-8 gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium shadow-2xs">
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Create New Referral</span>
              </Button>
            </Link>
          </PageHeaderActions>
        </PageHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border border-border/80 bg-card shadow-2xs">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-zinc-600" />
                Demographics & Identification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-4 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Date of Birth:</span>
                <span className="font-medium text-foreground">{patient.dateOfBirth}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Gender:</span>
                <span className="font-medium text-foreground">{patient.gender || 'Unspecified'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Contact Phone:</span>
                <span className="font-medium text-foreground">{patient.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">SSN:</span>
                <span className="font-mono font-medium text-foreground">{patient.ssn ? `***-**-${patient.ssn.slice(-4)}` : 'N/A'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/80 bg-card shadow-2xs">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-zinc-600" />
                Territory & Governance Scope
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-4 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Operating Site:</span>
                <span className="font-medium text-foreground">{patient.site}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Jurisdiction State:</span>
                <span className="font-medium text-foreground">{patient.state}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Legal Entity:</span>
                <span className="font-medium text-foreground">{patient.legalEntity || 'LE-HEALS-NY'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referral History */}
        <Card className="border border-border/80 bg-card shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-zinc-600" />
                  Referral Encounters ({patient.referrals?.length || 0})
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  All clinical workflows associated with this patient
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!patient.referrals || patient.referrals.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No referrals on file"
                description="This patient has no active or past referrals recorded in this facility."
                className="min-h-[180px] border-none bg-transparent"
              />
            ) : (
              <div className="divide-y divide-border/60">
                {patient.referrals.map((ref: any) => (
                  <div
                    key={ref.id}
                    className="flex items-center justify-between p-3.5 px-4 hover:bg-muted/30 transition-colors text-xs"
                  >
                    <div>
                      <span className="font-mono font-semibold text-foreground">{ref.trackingNumber}</span>
                      <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                        <span>Stage: {ref.pipelineStage.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>Status: {ref.workStatus.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <Link href={`/referrals/${ref.id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs border-border hover:bg-zinc-100 font-medium">
                        View Referral
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
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

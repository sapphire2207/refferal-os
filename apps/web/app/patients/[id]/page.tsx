'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Calendar, Phone, MapPin, FileText, ArrowRight, Loader2 } from 'lucide-react';

export default function PatientDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const { data: patient, isLoading, error } = useQuery<any>({
    queryKey: ['patient', id],
    queryFn: () => apiClient.get<any>(`/patients/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout title="Patient Profile">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (error || !patient) {
    return (
      <AppLayout title="Patient Not Found">
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-destructive">Patient not found or out of authorized scope.</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/patients')}>
            Back to Patients
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Patient: ${patient.firstName} ${patient.lastName}`}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/patients')}
            className="h-8 px-2 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Patients
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {patient.firstName} {patient.lastName}
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                MRN: {patient.mrn || 'N/A'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verified patient record • Scoped to {patient.site} ({patient.state})
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Demographics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Date of Birth:</span>
                <span>{patient.dateOfBirth}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Gender:</span>
                <span>{patient.gender || 'Unspecified'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Phone:</span>
                <span>{patient.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">SSN:</span>
                <span className="font-mono">{patient.ssn ? `***-**-${patient.ssn.slice(-4)}` : 'N/A'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location & Payer Scope
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Site:</span>
                <span>{patient.site}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">State:</span>
                <span>{patient.state}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Legal Entity:</span>
                <span>{patient.legalEntity || 'LE-HEALS-NY'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referral History */}
        <Card className="border border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Referral History ({patient.referrals?.length || 0})
            </CardTitle>
            <CardDescription className="text-xs">
              All clinical referrals associated with this patient
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!patient.referrals || patient.referrals.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No referrals on file for this patient.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {patient.referrals.map((ref: any) => (
                  <div
                    key={ref.id}
                    className="flex items-center justify-between p-3.5 px-4 hover:bg-muted/30 transition-colors text-xs"
                  >
                    <div>
                      <span className="font-mono font-semibold">{ref.trackingNumber}</span>
                      <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                        <span>Stage: {ref.pipelineStage.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>Status: {ref.workStatus.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <Link href={`/referrals/${ref.id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
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

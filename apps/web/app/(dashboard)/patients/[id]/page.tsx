'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
  PageHeaderActions,
} from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  WorkStatusBadge,
  PriorityBadge,
  PipelineStageBadge,
} from '@/components/ui/status-badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/state-views';
import {
  ArrowLeft,
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Building2,
  ShieldCheck,
  FileText,
  ExternalLink,
  Plus,
} from 'lucide-react';

interface PatientReferral {
  id: string;
  pipelineStage: string;
  workStatus: string;
  caseOutcome: string | null;
  priority: string;
  site: string;
  state: string;
  legalEntity: string;
  createdAt: string;
  updatedAt: string;
}

interface PatientDetail {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  medicalRecordNumber?: string | null;
  mrn?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  createdAt: string;
  updatedAt: string;
  referrals?: PatientReferral[];
}

function formatDob(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${month}/${day}/${year}`;
    }
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function calculateAge(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  try {
    const dob = new Date(dateStr);
    const diffMs = Date.now() - dob.getTime();
    const ageDt = new Date(diffMs);
    return Math.abs(ageDt.getUTCFullYear() - 1970);
  } catch {
    return null;
  }
}

export default function PatientDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const { data: patient, isLoading, error, refetch } = useQuery<PatientDetail>({
    queryKey: ['patient', id],
    queryFn: async () => apiClient.get<PatientDetail>(`/patients/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <AppLayout title="Patient Chart">
        <LoadingState message="Loading patient chart and medical records…" />
      </AppLayout>
    );
  }

  if (error || !patient) {
    return (
      <AppLayout title="Patient Not Found">
        <ErrorState
          title="Patient Chart Not Found"
          message="The requested patient record could not be loaded or access is restricted by your jurisdiction scope."
          onRetry={() => refetch()}
        />
      </AppLayout>
    );
  }

  const referrals = patient.referrals || [];
  const primaryReferral = referrals[0];
  const age = calculateAge(patient.dateOfBirth);
  const mrn = patient.mrn || patient.medicalRecordNumber || 'N/A';
  const site = primaryReferral?.site || 'main (CA)';
  const jurisdictionState = patient.state || primaryReferral?.state || 'CA';
  const legalEntity = primaryReferral?.legalEntity || 'Heals Medical Group, P.C.';

  return (
    <AppLayout title={`${patient.firstName} ${patient.lastName} — Patient Chart`}>
      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        {/* Navigation & Header */}
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/patients')}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 -ml-2 px-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Patient Directory</span>
          </Button>

          <PageHeader className="pt-0">
            <div>
              <div className="flex items-center gap-3">
                <PageHeaderHeading>
                  {patient.firstName} {patient.lastName}
                </PageHeaderHeading>
                <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 border-border/80">
                  MRN: {mrn}
                </Badge>
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  {jurisdictionState}
                </Badge>
              </div>
              <PageHeaderDescription>
                Authoritative Master Patient Index (MPI) Demographics & Clinical Referral History
              </PageHeaderDescription>
            </div>
            <PageHeaderActions>
              <Button
                size="sm"
                onClick={() => router.push(`/referrals/new?patientId=${patient.id}`)}
                className="gap-1.5 h-8 text-xs font-semibold shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Referral</span>
              </Button>
            </PageHeaderActions>
          </PageHeader>
        </div>

        {/* 2-Column Info Grid: Demographics + Territory & Jurisdiction */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Demographics & Identification Card */}
          <Card className="border-border/80 bg-card shadow-2xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground">
                  <User className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Demographics & Identification Card
                  </CardTitle>
                  <CardDescription className="text-[11px] text-muted-foreground">
                    DOB, gender identity, verified contact phone, and residential address
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 pb-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Full Legal Name</dt>
                  <dd className="font-semibold text-foreground mt-0.5">
                    {patient.firstName} {patient.lastName}
                  </dd>
                </div>

                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Medical Record Number (MRN)</dt>
                  <dd className="font-mono font-semibold text-foreground mt-0.5">
                    {mrn}
                  </dd>
                </div>

                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Date of Birth (DOB)</dt>
                  <dd className="font-medium text-foreground mt-0.5 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span>{formatDob(patient.dateOfBirth)}</span>
                    {age !== null && (
                      <span className="text-muted-foreground font-normal">({age} yrs)</span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Gender</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {patient.gender || 'Not specified'}
                  </dd>
                </div>

                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Contact Phone</dt>
                  <dd className="font-medium text-foreground mt-0.5 flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span>{patient.phone || 'N/A'}</span>
                  </dd>
                </div>

                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Email Address</dt>
                  <dd className="font-medium text-foreground mt-0.5 flex items-center gap-1.5 truncate">
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{patient.email || 'N/A'}</span>
                  </dd>
                </div>

                <div className="col-span-2 pt-1 border-t border-border/40">
                  <dt className="text-muted-foreground font-medium text-[11px]">City / State / Zip</dt>
                  <dd className="font-medium text-foreground mt-0.5 flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span>
                      {[
                        patient.addressLine1,
                        patient.city,
                        patient.state,
                        patient.zipCode,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'N/A'}
                    </span>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Card 2: Territory & Jurisdiction Card */}
          <Card className="border-border/80 bg-card shadow-2xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Territory & Jurisdiction Card
                  </CardTitle>
                  <CardDescription className="text-[11px] text-muted-foreground">
                    Site, primary jurisdiction state, and scoped legal entity
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 pb-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Site</dt>
                  <dd className="font-semibold text-foreground mt-0.5 flex items-center gap-1.5">
                    <Badge variant="outline" className="font-medium text-xs px-2 py-0.5">
                      {site}
                    </Badge>
                  </dd>
                </div>

                <div>
                  <dt className="text-muted-foreground font-medium text-[11px]">Primary Jurisdiction State</dt>
                  <dd className="font-semibold text-foreground mt-0.5">
                    <Badge variant="secondary" className="font-semibold text-xs px-2 py-0.5">
                      {jurisdictionState}
                    </Badge>
                  </dd>
                </div>

                <div className="col-span-2">
                  <dt className="text-muted-foreground font-medium text-[11px]">Scoped Legal Entity</dt>
                  <dd className="font-semibold text-foreground mt-0.5 flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{legalEntity}</span>
                  </dd>
                </div>

                <div className="col-span-2 pt-1 border-t border-border/40">
                  <dt className="text-muted-foreground font-medium text-[11px]">Regulatory & Scope Compliance</dt>
                  <dd className="font-medium text-foreground mt-1 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-[11px] text-muted-foreground">
                      Covered Healthcare Entity (HIPAA 45 CFR § 164.530) — Authorized Territorial Operations
                    </span>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Associated Clinical Referrals Table */}
        <Card className="border-border/80 bg-card shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Associated Clinical Referrals Table
                  </CardTitle>
                  <CardDescription className="text-[11px] text-muted-foreground">
                    All referrals linked to this patient with Stage badge, Status badge, Priority, and direct link
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {referrals.length} {referrals.length === 1 ? 'Referral' : 'Referrals'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {referrals.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  icon={FileText}
                  title="No referrals found"
                  description="This patient record has no associated clinical referrals yet."
                  actionLabel="Create Referral"
                  onAction={() => router.push(`/referrals/new?patientId=${patient.id}`)}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Referral / Tracking #</TableHead>
                    <TableHead className="text-xs">Stage</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Priority</TableHead>
                    <TableHead className="text-xs">Site / Jurisdiction</TableHead>
                    <TableHead className="text-xs">Outcome</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((ref) => {
                    const trackingNumber = `REF-${ref.id.slice(0, 8).toUpperCase()}`;
                    return (
                      <TableRow key={ref.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="font-mono text-xs font-semibold text-foreground">
                          {trackingNumber}
                        </TableCell>
                        <TableCell>
                          <PipelineStageBadge stage={ref.pipelineStage as any} />
                        </TableCell>
                        <TableCell>
                          <WorkStatusBadge status={ref.workStatus as any} />
                        </TableCell>
                        <TableCell>
                          <PriorityBadge priority={ref.priority as any} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ref.site} ({ref.state})
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ref.caseOutcome || 'Active'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(ref.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/referrals/${ref.id}`)}
                            className="h-7 px-2.5 text-xs font-medium gap-1"
                          >
                            <span>Open Case</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
